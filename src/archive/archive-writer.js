const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { renderDocument } = require('./render-document');

function safeName(value) {
  const cleaned = String(value || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || 'untitled';
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function findExistingArchive(libraryRoot, documentId) {
  if (!fs.existsSync(libraryRoot)) return null;
  for (const entry of fs.readdirSync(libraryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = readJson(path.join(libraryRoot, entry.name, 'archive.json'));
    if (manifest?.documentId === documentId) return path.join(libraryRoot, entry.name);
  }
  return null;
}

function chooseArchiveDir(libraryRoot, document) {
  const existing = findExistingArchive(libraryRoot, document.documentId);
  if (existing) return existing;

  const base = safeName(document.title);
  let candidate = path.join(libraryRoot, base);
  if (!fs.existsSync(candidate)) return candidate;

  const existingManifest = readJson(path.join(candidate, 'archive.json'));
  const interruptedAssets = path.join(candidate, 'assets');
  if (!existingManifest && fs.existsSync(interruptedAssets)) return candidate;

  const suffix = safeName(document.documentId).slice(0, 8);
  return path.join(libraryRoot, `${base}--${suffix}`);
}

async function downloadBlob(page, url, destination) {
  const payload = await page.evaluate(async source => {
    const response = await fetch(source);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }, url);
  fs.writeFileSync(destination, Buffer.from(payload, 'base64'));
}

async function requestHeaders(context, page, url) {
  const browserCookies = await context.cookies(url);
  const sessionHeader = browserCookies.map(item => `${item.name}=${item.value}`).join('; ');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  return {
    'User-Agent': userAgent,
    'Referer': page.url(),
    ...(sessionHeader ? { Cookie: sessionHeader } : {}),
  };
}

async function downloadRemote(context, page, url, destination) {
  const headers = await requestHeaders(context, page, url);
  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function isExistingMediaUsable(file, expectedSize) {
  if (!file || !fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0) return false;
  return expectedSize == null || stat.size === expectedSize;
}

function tryLinkOrCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) return;
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

function existingMediaFor(item, manifest) {
  const media = Array.isArray(manifest?.media) ? manifest.media : [];
  return media.find(entry => entry.id === item.id) ||
    media.find(entry => entry.sourceUrl === item.url) ||
    null;
}

async function materializeMedia({
  item,
  archiveDir,
  context,
  page,
  existingManifest,
  ownerByHash,
  obsoletePaths,
}) {
  const oldEntry = existingMediaFor(item, existingManifest);
  const candidateRelatives = [...new Set([
    oldEntry?.localRelativePath,
    item.localRelativePath,
  ].filter(Boolean))];

  let sourcePath = null;
  for (const relative of candidateRelatives) {
    const candidate = path.join(archiveDir, relative);
    if (isExistingMediaUsable(candidate, item.size)) {
      sourcePath = candidate;
      break;
    }
  }

  let stagingPath = null;
  if (!sourcePath) {
    const stagingDir = path.join(
      archiveDir,
      'assets',
      item.kind === 'video' ? 'videos' : 'images',
      '.staging'
    );
    fs.mkdirSync(stagingDir, { recursive: true });
    stagingPath = path.join(
      stagingDir,
      `${item.id}-${process.pid}-${Date.now()}${item.extension}`
    );

    if (item.url.startsWith('blob:')) {
      await downloadBlob(page, item.url, stagingPath);
    } else if (/^https?:/i.test(item.url)) {
      await downloadRemote(context, page, item.url, stagingPath);
    } else {
      throw new Error('Unsupported media URL scheme.');
    }
    sourcePath = stagingPath;
  }

  const actualSize = fs.statSync(sourcePath).size;
  const contentHash = await hashFile(sourcePath);
  const dedupeKey = `${item.kind}:${contentHash}`;
  const owner = ownerByHash.get(dedupeKey) || null;
  const kindDir = item.kind === 'video' ? 'videos' : 'images';
  const canonicalRelativePath = owner?.localRelativePath ||
    `assets/${kindDir}/sha256-${contentHash}${item.extension}`;
  const canonicalPath = path.join(archiveDir, canonicalRelativePath);

  if (!fs.existsSync(canonicalPath)) {
    tryLinkOrCopy(sourcePath, canonicalPath);
  } else {
    const canonicalStat = fs.statSync(canonicalPath);
    if (canonicalStat.size !== actualSize) {
      const existingHash = await hashFile(canonicalPath);
      if (existingHash !== contentHash) {
        throw new Error(`Canonical media hash collision or corruption: ${canonicalRelativePath}`);
      }
    }
  }

  if (!owner) {
    ownerByHash.set(dedupeKey, {
      id: item.id,
      localRelativePath: canonicalRelativePath,
    });
  }

  item.contentHash = contentHash;
  item.localRelativePath = canonicalRelativePath;
  item.actualSize = actualSize;
  item.duplicateOf = owner?.id || null;
  item.status = 'downloaded';

  for (const relative of candidateRelatives) {
    const oldPath = path.join(archiveDir, relative);
    if (path.resolve(oldPath) !== path.resolve(canonicalPath) && fs.existsSync(oldPath)) {
      obsoletePaths.add(oldPath);
    }
  }
  if (stagingPath && path.resolve(stagingPath) !== path.resolve(canonicalPath) && fs.existsSync(stagingPath)) {
    obsoletePaths.add(stagingPath);
  }
}

async function downloadMedia({
  inventory,
  archiveDir,
  context,
  page,
  archiveConfig,
  existingManifest,
}) {
  const ownerByHash = new Map();
  const obsoletePaths = new Set();

  for (const item of inventory) {
    const allowed =
      (item.kind === 'video' && archiveConfig.downloadVideos !== false) ||
      (item.kind === 'image' && archiveConfig.downloadImages !== false);

    if (!allowed) {
      item.status = 'skipped_by_config';
      continue;
    }

    try {
      await materializeMedia({
        item,
        archiveDir,
        context,
        page,
        existingManifest,
        ownerByHash,
        obsoletePaths,
      });
    } catch (error) {
      item.status = 'failed';
      item.error = error.message;
    }
  }

  return { obsoletePaths };
}

function archiveStatus(inventory, pendingConfirmation = false) {
  if (pendingConfirmation) return 'pending_confirmation';
  const incomplete = inventory.some(item => item.status !== 'downloaded');
  return incomplete ? 'partial' : 'complete';
}

function storageSummary(inventory) {
  const downloaded = inventory.filter(item => item.status === 'downloaded');
  const logicalBytes = downloaded.reduce((sum, item) => sum + (item.actualSize || 0), 0);
  const unique = new Map();
  for (const item of downloaded) {
    if (!item.localRelativePath || unique.has(item.localRelativePath)) continue;
    unique.set(item.localRelativePath, item.actualSize || 0);
  }
  const physicalBytes = [...unique.values()].reduce((sum, value) => sum + value, 0);
  return {
    logicalMediaCount: downloaded.length,
    physicalAssetCount: unique.size,
    logicalBytes,
    physicalBytes,
    deduplicatedBytes: Math.max(0, logicalBytes - physicalBytes),
  };
}

function writeArchiveFiles({ archiveDir, document, inventory, policy, pendingConfirmation }) {
  fs.mkdirSync(archiveDir, { recursive: true });

  const status = archiveStatus(inventory, pendingConfirmation);
  const rendered = renderDocument({ document, inventory });
  const markdownName = `${safeName(document.title)}.md`;

  fs.writeFileSync(path.join(archiveDir, markdownName), rendered.markdown, 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'article.html'), rendered.html, 'utf8');

  const manifest = {
    version: 2,
    documentId: document.documentId,
    title: document.title,
    sourceUrl: document.sourceUrl,
    savedAt: new Date().toISOString(),
    status,
    markdownFile: markdownName,
    htmlFile: 'article.html',
    scan: document.scan || null,
    policy,
    embeddedSheets: Array.isArray(document.embeddedSheets) ? document.embeddedSheets : [],
    storage: storageSummary(inventory),
    media: inventory.map(item => ({
      id: item.id,
      kind: item.kind,
      sourceUrl: item.url,
      localRelativePath: item.localRelativePath,
      expectedSize: item.size,
      actualSize: item.actualSize ?? null,
      contentType: item.contentType,
      status: item.status,
      error: item.error || item.probeError || null,
      blockIds: item.blockIds,
      contexts: item.contexts || [],
      width: item.width ?? null,
      height: item.height ?? null,
      aspectRatio: item.aspectRatio ?? null,
      contentHash: item.contentHash || null,
      duplicateOf: item.duplicateOf || null,
    })),
  };

  fs.writeFileSync(path.join(archiveDir, 'archive.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { status, markdownName, manifest };
}

function cleanupObsoleteMedia({ archiveDir, obsoletePaths, inventory }) {
  const referenced = new Set(
    inventory
      .filter(item => item.status === 'downloaded' && item.localRelativePath)
      .map(item => path.resolve(archiveDir, item.localRelativePath))
  );
  const assetsRoot = path.resolve(archiveDir, 'assets') + path.sep;

  for (const candidate of obsoletePaths) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(assetsRoot)) continue;
    if (referenced.has(resolved)) continue;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) fs.unlinkSync(resolved);
    } catch {
      // Cleanup failure must not invalidate a successfully written archive.
    }
  }
}

async function createArchive({
  document,
  inventory,
  policy,
  context,
  page,
  archiveConfig,
  libraryRoot,
  confirmLarge = false,
}) {
  fs.mkdirSync(libraryRoot, { recursive: true });
  const archiveDir = chooseArchiveDir(libraryRoot, document);
  const existingManifest = readJson(path.join(archiveDir, 'archive.json'));

  if (policy.warnings.length && !confirmLarge) {
    if (existingManifest?.status === 'complete') {
      const preflight = {
        version: 2,
        documentId: document.documentId,
        title: document.title,
        checkedAt: new Date().toISOString(),
        policy,
        media: inventory.map(item => ({
          id: item.id,
          kind: item.kind,
          sourceUrl: item.url,
          localRelativePath: item.localRelativePath,
          expectedSize: item.size,
          contentType: item.contentType,
          probeError: item.probeError || null,
          contexts: item.contexts || [],
          width: item.width ?? null,
          height: item.height ?? null,
          aspectRatio: item.aspectRatio ?? null,
        })),
      };
      fs.writeFileSync(path.join(archiveDir, 'preflight.json'), JSON.stringify(preflight, null, 2), 'utf8');
      return {
        archiveDir,
        status: existingManifest.status,
        manifest: existingManifest,
        warningsRequireConfirmation: true,
        archivePreserved: true,
      };
    }

    const result = writeArchiveFiles({
      archiveDir,
      document,
      inventory,
      policy,
      pendingConfirmation: true,
    });
    return { archiveDir, ...result, warningsRequireConfirmation: true };
  }

  const { obsoletePaths } = await downloadMedia({
    inventory,
    archiveDir,
    context,
    page,
    archiveConfig,
    existingManifest,
  });

  const result = writeArchiveFiles({
    archiveDir,
    document,
    inventory,
    policy,
    pendingConfirmation: false,
  });

  cleanupObsoleteMedia({ archiveDir, obsoletePaths, inventory });

  const preflightPath = path.join(archiveDir, 'preflight.json');
  if (fs.existsSync(preflightPath)) fs.unlinkSync(preflightPath);

  return { archiveDir, ...result, warningsRequireConfirmation: false };
}

module.exports = {
  createArchive,
  safeName,
  storageSummary,
};
