const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadConfig } = require('../src/config/load-config');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function usage() {
  console.log('Usage: node scripts/init-explain.js <article-folder> [--refresh-source]');
}

function main() {
  const args = process.argv.slice(2);
  const folder = args.find(value => !value.startsWith('--'));
  const refreshSource = args.includes('--refresh-source');
  if (!folder) {
    usage();
    process.exitCode = 2;
    return;
  }

  const config = loadConfig();
  const libraryRoot = path.resolve(config.archive.libraryRoot);
  const articleDir = path.resolve(libraryRoot, folder);
  const relative = path.relative(libraryRoot, articleDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Article folder must be inside the configured library root.');
  }

  const archiveFile = path.join(articleDir, 'archive.json');
  if (!fs.existsSync(archiveFile)) throw new Error('archive.json not found for the requested article.');
  const archive = readJson(archiveFile);

  const sourceFileName = archive.markdownFile || archive.htmlFile || 'article.html';
  const sourceFile = path.join(articleDir, sourceFileName);
  if (!fs.existsSync(sourceFile)) throw new Error(`Source file is missing: ${sourceFileName}`);

  const explainRoot = path.join(articleDir, 'explain');
  const chaptersDir = path.join(explainRoot, 'chapters');
  const internalDir = path.join(explainRoot, 'internal');
  const asrDir = path.join(explainRoot, 'evidence', 'asr');
  const framesDir = path.join(explainRoot, 'evidence', 'frames');
  fs.mkdirSync(chaptersDir, { recursive: true });
  fs.mkdirSync(internalDir, { recursive: true });
  fs.mkdirSync(asrDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const manifestFile = path.join(explainRoot, 'manifest.json');
  const now = new Date().toISOString();
  const source = {
    documentId: archive.documentId || null,
    savedAt: archive.savedAt || null,
    archiveVersion: archive.version || null,
    fingerprint: {
      algorithm: 'sha256',
      file: sourceFileName,
      sha256: sha256File(sourceFile),
    },
  };

  let manifest = null;
  if (fs.existsSync(manifestFile)) {
    manifest = readJson(manifestFile);
    if (!refreshSource) {
      console.log(JSON.stringify({
        status: 'exists',
        manifestFile,
        message: 'Explain manifest already exists. Use --refresh-source only after reviewing source changes.',
      }, null, 2));
      return;
    }
    manifest.source = source;
    manifest.updatedAt = now;
  } else {
    manifest = {
      version: 1,
      status: 'draft',
      title: `${archive.title || folder} · 讲解版`,
      description: '基于原始归档、方法论提炼和少量代表证据建立的本地讲解版。',
      source,
      evidence: {
        identity: 'archive media contentHash (SHA-256)',
        mediaIndexFile: 'evidence/media-index.json',
        casesFile: 'evidence/cases.json',
        asrDir: 'evidence/asr',
        framesDir: 'evidence/frames',
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  const chapterManifestFile = path.join(chaptersDir, 'manifest.json');
  if (!fs.existsSync(chapterManifestFile)) {
    fs.writeFileSync(chapterManifestFile, JSON.stringify({
      version: 1,
      title: `${archive.title || folder} · 讲解版`,
      description: '面向普通用户的连续讲解章节。只有 status=ready 且 Markdown 文件存在的章节才会公开显示。',
      chapters: [],
    }, null, 2), 'utf8');
  }

  const casesFile = path.join(explainRoot, 'evidence', 'cases.json');
  if (!fs.existsSync(casesFile)) {
    fs.writeFileSync(casesFile, JSON.stringify({
      version: 1,
      documentId: archive.documentId || null,
      sourceSavedAt: archive.savedAt || null,
      identity: 'contentHash',
      cases: [],
    }, null, 2), 'utf8');
  }

  const videos = (Array.isArray(archive.media) ? archive.media : [])
    .filter(item => item.kind === 'video' && item.status === 'downloaded' && item.contentHash)
    .reduce((map, item) => {
      if (!map.has(item.contentHash)) {
        map.set(item.contentHash, {
          contentHash: item.contentHash,
          localRelativePath: item.localRelativePath,
          actualSize: item.actualSize ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          aspectRatio: item.aspectRatio ?? null,
          logicalOccurrences: [],
        });
      }
      const current = map.get(item.contentHash);
      current.logicalOccurrences.push({
        mediaId: item.id,
        blockIds: item.blockIds || [],
        contexts: item.contexts || [],
        duplicateOf: item.duplicateOf || null,
      });
      return map;
    }, new Map());

  const mediaIndexFile = path.join(explainRoot, 'evidence', 'media-index.json');
  fs.writeFileSync(mediaIndexFile, JSON.stringify({
    version: 1,
    documentId: archive.documentId || null,
    sourceSavedAt: archive.savedAt || null,
    identity: 'contentHash',
    videos: [...videos.values()],
  }, null, 2), 'utf8');

  console.log(JSON.stringify({
    status: 'ok',
    article: archive.title || folder,
    manifestFile,
    mediaIndexFile,
    casesFile,
    uniqueVideoCount: videos.size,
    source,
  }, null, 2));
}

main();
