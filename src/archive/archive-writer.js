const fs = require('fs');
const path = require('path');
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
    const manifestPath = path.join(libraryRoot, entry.name, 'archive.json');
    const manifest = readJson(manifestPath);
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
  candidate = path.join(libraryRoot, `${base}--${suffix}`);
  return candidate;
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

async function downloadMedia({ inventory, archiveDir, context, page, archiveConfig }) {
  for (const item of inventory) {
    const allowed =
      (item.kind === 'video' && archiveConfig.downloadVideos !== false) ||
      (item.kind === 'image' && archiveConfig.downloadImages !== false);

    if (!allowed) {
      item.status = 'skipped_by_config';
      continue;
    }

    const destination = path.join(archiveDir, item.localRelativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
      item.status = 'downloaded';
      item.actualSize = fs.statSync(destination).size;
      continue;
    }

    try {
      if (item.url.startsWith('blob:')) {
        await downloadBlob(page, item.url, destination);
      } else if (/^https?:/i.test(item.url)) {
        await downloadRemote(context, page, item.url, destination);
      } else {
        throw new Error('Unsupported media URL scheme.');
      }
      item.status = 'downloaded';
      item.actualSize = fs.statSync(destination).size;
    } catch (error) {
      item.status = 'failed';
      item.error = error.message;
    }
  }
}

function archiveStatus(inventory, pendingConfirmation = false) {
  if (pendingConfirmation) return 'pending_confirmation';
  const incomplete = inventory.some(item => item.status !== 'downloaded');
  return incomplete ? 'partial' : 'complete';
}

function writeArchiveFiles({ archiveDir, document, inventory, policy, pendingConfirmation }) {
  fs.mkdirSync(archiveDir, { recursive: true });

  const status = archiveStatus(inventory, pendingConfirmation);
  const rendered = renderDocument({ document, inventory });
  const markdownName = `${safeName(document.title)}.md`;

  fs.writeFileSync(path.join(archiveDir, markdownName), rendered.markdown, 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'article.html'), rendered.html, 'utf8');

  const manifest = {
    version: 1,
    documentId: document.documentId,
    title: document.title,
    sourceUrl: document.sourceUrl,
    savedAt: new Date().toISOString(),
    status,
    markdownFile: markdownName,
    htmlFile: 'article.html',
    scan: document.scan || null,
    policy,
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
    })),
  };

  fs.writeFileSync(path.join(archiveDir, 'archive.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { status, markdownName, manifest };
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

  if (policy.warnings.length && !confirmLarge) {
    const existingManifest = readJson(path.join(archiveDir, 'archive.json'));

    if (existingManifest?.status === 'complete') {
      const preflight = {
        version: 1,
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

  await downloadMedia({ inventory, archiveDir, context, page, archiveConfig });
  const result = writeArchiveFiles({
    archiveDir,
    document,
    inventory,
    policy,
    pendingConfirmation: false,
  });

  const preflightPath = path.join(archiveDir, 'preflight.json');
  if (fs.existsSync(preflightPath)) fs.unlinkSync(preflightPath);

  return { archiveDir, ...result, warningsRequireConfirmation: false };
}

module.exports = {
  createArchive,
  safeName,
};
