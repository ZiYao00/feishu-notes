const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Media bytes are transferred only through the shared bounded transport.
const { renderDocument } = require('./render-document');
const { evaluateQuality } = require('./quality-gate');
const {snapshotDocument}=require('./source-snapshot');
const {verifyMediaAsset,publishStage}=require('./media-service');
const {publishArchiveFiles}=require('./publish-transaction');

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

function chooseArchiveDir(libraryRoot, document, agentSafe = false) {
  const existing = findExistingArchive(libraryRoot, document.documentId);
  if (existing) {
    throw new Error('ARCHIVE_EXISTS: use reviewed resume or a separate candidate; never implicitly overwrite an existing article.');
  }

  const base = safeName(document.title);
  const candidate = path.join(libraryRoot, base);
  if (!fs.existsSync(candidate)) return candidate;

  const existingManifest = readJson(path.join(candidate, 'archive.json'));
  const interruptedAssets = path.join(candidate, 'assets');
  if (!agentSafe && !existingManifest && fs.existsSync(interruptedAssets)) {
    throw new Error('ARCHIVE_INTERRUPTED: existing assets without manifest require manual recovery.');
  }

  const suffix = safeName(document.documentId).slice(0, 8);
  const alternate = path.join(libraryRoot, `${base}--${suffix}`);
  if (fs.existsSync(alternate)) {
    throw new Error('AGENT_ARCHIVE_COLLISION: target folder already exists; no files were overwritten.');
  }
  return alternate;
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
    (item.identity ? media.find(entry => entry.identity === item.identity) : null) ||
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
  safeMediaTransport = null,
  transferredBytes = 0,
  hardBudget = null,
}) {
  const oldEntry = existingMediaFor(item, existingManifest);
  const candidateRelatives = [...new Set([
    oldEntry?.localRelativePath,
    item.localRelativePath,
  ].filter(Boolean))];

  let sourcePath = null;
  for (const relative of candidateRelatives) {
    const validated=oldEntry?.contentHash ? await verifyMediaAsset({
      dir:archiveDir,relative,hash:oldEntry.contentHash,size:oldEntry.actualSize,
    }) : null;
    if(validated && (item.size == null || fs.statSync(validated).size === item.size)) {
      sourcePath=validated;
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

    if (!safeMediaTransport || !hardBudget)throw new Error('MEDIA_SAFE_TRANSPORT_REQUIRED');
    if (safeMediaTransport) {
      if (item.url.startsWith('blob:')) {
        await safeMediaTransport.streamBlob(item.url, page, stagingPath, transferredBytes, hardBudget, item);
      } else if (/^https:\/\//i.test(item.url)) {
        await safeMediaTransport.streamRemote(item.url, context, page, stagingPath, transferredBytes, hardBudget);
      } else {
        throw new Error('Only HTTPS or authenticated Blob media can be downloaded safely.');
      }
      const header=Buffer.alloc(256);
      const fd=fs.openSync(stagingPath,'r');
      try { fs.readSync(fd,header,0,header.length,0); } finally { fs.closeSync(fd); }
      const ext=safeMediaTransport.extFor(header,item.kind);
      if (!ext) throw new Error('Invalid or unsupported media bytes; refusing to record a successful asset.');
      item.extension=ext;
    } // No legacy unbounded or unauthenticated download fallback.
    sourcePath = stagingPath;
  }

  const physical=await publishStage({dir:archiveDir,stage:sourcePath,kind:item.kind,extension:item.extension});
  const {actualSize,contentHash}=physical;
  const dedupeKey = `${item.kind}:${contentHash}`;
  const owner = ownerByHash.get(dedupeKey) || null;
  const canonicalRelativePath=owner?.localRelativePath||physical.localRelativePath;
  const canonicalPath=path.join(archiveDir,canonicalRelativePath);
  if(owner && (await hashFile(canonicalPath))!==contentHash)
    throw new Error('MEDIA_OWNER_HASH_MISMATCH');

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
  safeMediaTransport = null,
  mediaLimits = null,
  maxMediaDownloads = Number.POSITIVE_INFINITY,
}) {
  const ownerByHash = new Map();
  const obsoletePaths = new Set();
  let transferredBytes = 0;
  let attemptedDownloads = 0;
  const hardBudget = safeMediaTransport ? {
    singleMax: Number(mediaLimits?.warnSingleFileMB || 300) * 1024 * 1024,
    totalMax: Number(mediaLimits?.warnTotalMB || 1024) * 1024 * 1024,
    spentBytes: 0,
  } : null;

  for (const item of inventory) {
    const allowed =
      (item.kind === 'video' && archiveConfig.downloadVideos !== false) ||
      (item.kind === 'image' && archiveConfig.downloadImages !== false);

    if (!allowed) {
      item.status = 'skipped_by_config';
      continue;
    }
    if (attemptedDownloads >= maxMediaDownloads) {
      item.status = 'skipped_by_media_limit';
      item.error = 'This candidate was intentionally limited to the approved media-item count.';
      continue;
    }
    attemptedDownloads++;

    try {
      await materializeMedia({
        item,
        archiveDir,
        context,
        page,
        existingManifest,
        ownerByHash,
        obsoletePaths,
        safeMediaTransport,
        transferredBytes,
        hardBudget,
      });
      if (safeMediaTransport) transferredBytes += item.actualSize || 0;
    } catch (error) {
      item.status = 'failed';
      item.error = error.message;
    }
  }

  return { obsoletePaths };
}

function archiveStatus(inventory, pendingConfirmation = false, verifiedComplete = true) {
  if (pendingConfirmation) return 'pending_confirmation';
  const incomplete = !verifiedComplete || inventory.some(item => item.status !== 'downloaded');
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

function writeArchiveFiles({ archiveDir, document, inventory, policy, pendingConfirmation, agentSafe = false }) {
  fs.mkdirSync(archiveDir, { recursive: true });

  const rendered = renderDocument({ document, inventory });
  const attachments = rendered.audit.attachmentCandidates;
  const mediaDiagnostics = inventory.diagnostics || [];
  const quality = evaluateQuality({
    document, inventory, audit: rendered.audit,
    diagnostics: mediaDiagnostics, policy, pendingConfirmation,
  });
  const status = quality.status;
  const markdownName = `${safeName(document.title)}.md`;

  // Build every authoritative file before publishing through a single gate.

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
    sourceFingerprint:snapshotDocument(document).contentFingerprint,
    sourceSnapshotSchema:2,
    policy,
    embeddedSheets: Array.isArray(document.embeddedSheets) ? document.embeddedSheets : [],
    attachments,
    mediaDiagnostics,
    quality,
    storage: storageSummary(inventory),
    media: inventory.map(item => ({
      id: item.id,
      identity: item.identity || null,
      kind: item.kind,
      sourceUrl: item.url,
      localRelativePath: item.localRelativePath,
      expectedSize: item.size,
      actualSize: item.actualSize ?? null,
      contentType: item.contentType,
      status: item.status,
      error: item.error || item.probeError || null,
      blockIds: item.blockIds,
      recordIds: item.recordIds || [],
      contexts: item.contexts || [],
      width: item.width ?? null,
      height: item.height ?? null,
      aspectRatio: item.aspectRatio ?? null,
      contentHash: item.contentHash || null,
      duplicateOf: item.duplicateOf || null,
    })),
  };

  const publication=publishArchiveFiles({
    dir:archiveDir,files:{markdown:markdownName,html:'article.html',manifest:'archive.json'},
    contents:{markdown:rendered.markdown,html:rendered.html,manifest:JSON.stringify(manifest,null,2)},
  });
  return { status, markdownName, manifest, publication };
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
  agentSafe = false,
  mediaLimits = null,
  safeMediaTransport = null,
  maxMediaDownloads = Number.POSITIVE_INFINITY,
}) {
  fs.mkdirSync(libraryRoot, { recursive: true });
  const archiveDir = chooseArchiveDir(libraryRoot, document, agentSafe);
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
      agentSafe,
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
    mediaLimits,
    safeMediaTransport,
    maxMediaDownloads,
  });

  const result = writeArchiveFiles({
    archiveDir,
    document,
    inventory,
    policy,
    pendingConfirmation: false,
    agentSafe,
  });

  // Never remove old media or staging automatically. Publication and resource
  // retention are independent operations requiring their own authorization.
  void obsoletePaths;

  return { archiveDir, ...result, warningsRequireConfirmation: false };
}

module.exports = {
  createArchive,
  safeName,
  storageSummary,
  archiveStatus,
};
