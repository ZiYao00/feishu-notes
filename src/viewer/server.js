const http = require('http');
const fs = require('fs');
const path = require('path');

const VIEWER_ASSET_ROOT = path.join(__dirname, 'assets');
const USER_STYLE_FILE = path.resolve(__dirname, '..', '..', 'data', 'styles', 'reader.user.css');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function uniquePhysicalBytes(media) {
  const unique = new Map();
  for (const item of media || []) {
    if (item.status !== 'downloaded' || !item.localRelativePath) continue;
    if (!unique.has(item.localRelativePath)) unique.set(item.localRelativePath, item.actualSize || 0);
  }
  return [...unique.values()].reduce((sum, value) => sum + value, 0);
}

function listArchives(libraryRoot) {
  if (!fs.existsSync(libraryRoot)) return [];
  const items = [];

  for (const entry of fs.readdirSync(libraryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(libraryRoot, entry.name);
    const manifest = readJson(path.join(dir, 'archive.json'));
    if (!manifest) continue;

    const media = Array.isArray(manifest.media) ? manifest.media : [];
    items.push({
      folder: entry.name,
      title: manifest.title || entry.name,
      savedAt: manifest.savedAt || '',
      status: manifest.status || 'unknown',
      mediaCount: media.length,
      localMediaCount: media.filter(item => item.status === 'downloaded').length,
      totalBytes: manifest.storage?.physicalBytes ?? uniquePhysicalBytes(media),
      logicalBytes: manifest.storage?.logicalBytes ?? media.reduce((sum, item) => sum + (item.actualSize || 0), 0),
      deduplicatedBytes: manifest.storage?.deduplicatedBytes ?? 0,
    });
  }

  items.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  return items;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function renderIndex(items) {
  const cards = items.map(item => {
    const statusClass = item.status === 'complete' ? 'complete' : item.status === 'partial' ? 'partial' : 'pending';
    const saved = item.deduplicatedBytes > 0
      ? `<span>去重节省 ${formatBytes(item.deduplicatedBytes)}</span>`
      : '';
    return `<a class="card" href="/note/${encodeURIComponent(item.folder)}/">
      <div class="title">${escapeHtml(item.title)}</div>
      <div class="meta">
        <span class="status ${statusClass}">${escapeHtml(item.status)}</span>
        <span>${item.localMediaCount}/${item.mediaCount} 媒体</span>
        <span>${formatBytes(item.totalBytes)}</span>
        ${saved}
      </div>
      <div class="date">${escapeHtml(item.savedAt)}</div>
    </a>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>feishu-notes</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:#0d0f12;color:#e8eaed}
main{max-width:1180px;margin:0 auto;padding:42px 28px 80px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:30px}
h1{font-size:30px;margin:0}p{margin:6px 0 0;color:#9aa0a6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{display:block;text-decoration:none;color:inherit;background:#171a1f;border:1px solid #262a31;border-radius:12px;padding:18px;transition:.16s ease}
.card:hover{transform:translateY(-1px);border-color:#454b56;background:#1b1f25}
.title{font-size:17px;font-weight:650;line-height:1.45;margin-bottom:14px}
.meta{display:flex;gap:8px;flex-wrap:wrap;color:#aeb4bd;font-size:12px}
.status{padding:2px 7px;border-radius:999px}.status.complete{background:#123c2b;color:#91e6b9}.status.partial{background:#4a3514;color:#ffd58c}.status.pending{background:#3d284b;color:#d9b0ef}
.date{margin-top:12px;color:#727985;font-size:11px}
.empty{padding:50px 0;color:#8d949f}
</style>
</head>
<body>
<main>
<header><div><h1>feishu-notes</h1><p>本地飞书笔记归档</p></div><div>${items.length} 篇</div></header>
${items.length ? `<section class="grid">${cards}</section>` : '<div class="empty">library 里还没有归档文章。</div>'}
</main>
</body>
</html>`;
}

function extractArticle(html) {
  const article = String(html).match(/<article\b[^>]*data-reader-article[^>]*>[\s\S]*?<\/article>/i);
  if (article) return article[0];

  const body = String(html).match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function renderReader({ manifest, folder, articleHtml, hasUserStyle = false }) {
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  const videoCount = media.filter(item => item.kind === 'video').length;
  const imageCount = media.filter(item => item.kind === 'image').length;
  const physicalBytes = manifest.storage?.physicalBytes ?? uniquePhysicalBytes(media);
  const deduplicatedBytes = manifest.storage?.deduplicatedBytes ?? 0;
  const basePath = `/library/${encodeURIComponent(folder)}/`;
  const statusClass = manifest.status === 'complete' ? 'complete' : 'partial';
  const article = extractArticle(articleHtml);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="${basePath}">
<title>${escapeHtml(manifest.title || folder)} · feishu-notes</title>
<link rel="stylesheet" href="/_viewer/reader.css">
${hasUserStyle ? '<link rel="stylesheet" href="/_viewer/reader.user.css">' : ''}
<script src="/_viewer/reader.js" defer></script>
</head>
<body>
<header class="reader-topbar">
  <a class="reader-back" href="/"><span aria-hidden="true">←</span><span>笔记库</span></a>
  <button class="reader-action reader-toc-toggle" type="button" data-toc-toggle>目录</button>
  <div class="reader-titlebar">
    <div class="reader-titlebar-title">${escapeHtml(manifest.title || folder)}</div>
    <div class="reader-titlebar-meta">
      <span class="reader-status ${statusClass}">${escapeHtml(manifest.status || 'unknown')}</span>
      <span>${videoCount} 视频 · ${imageCount} 图片</span>
      <span>${formatBytes(physicalBytes)}</span>
      ${deduplicatedBytes ? `<span>去重节省 ${formatBytes(deduplicatedBytes)}</span>` : ''}
    </div>
  </div>
  <div class="reader-toolbar">
    ${manifest.sourceUrl ? `<a class="reader-action" href="${escapeHtml(manifest.sourceUrl)}" target="_blank" rel="noreferrer">原文</a>` : ''}
    <button class="reader-action" type="button" data-theme-toggle aria-label="切换主题">系统</button>
  </div>
  <div class="reader-progress"><span data-reader-progress></span></div>
</header>

<div class="reader-layout">
  <aside class="reader-toc" data-reader-toc>
    <div class="reader-toc-head">
      <div class="reader-toc-title">目录</div>
      <button class="reader-toc-collapse" type="button" data-toc-collapse aria-label="折叠目录" title="折叠目录">‹</button>
    </div>
    <nav class="reader-toc-list" data-reader-toc-list aria-label="文章目录"></nav>
  </aside>
  <div
    class="reader-splitter"
    data-reader-splitter
    role="separator"
    aria-orientation="vertical"
    aria-label="调整目录与正文宽度"
    aria-valuemin="160"
    aria-valuemax="720"
    aria-valuenow="208"
    tabindex="0"
    title="拖动调整目录宽度；双击恢复默认"
  ></div>
  <main class="reader-main">
    <div class="reader-paper">
      <div class="reader-content">
        ${article}
      </div>
    </div>
  </main>
</div>

<dialog class="reader-dialog" data-media-dialog>
  <div class="reader-dialog-bar">
    <span class="reader-dialog-title" aria-hidden="true">媒体预览</span>
    <button class="reader-dialog-close" type="button" data-dialog-close aria-label="关闭媒体预览">关闭</button>
  </div>
  <div class="reader-dialog-stage">
    <video controls playsinline preload="metadata" hidden></video>
    <img alt="" hidden>
  </div>
</dialog>
</body>
</html>`;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  }[ext] || 'application/octet-stream';
}

function serveFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = contentType(file);
  const range = req.headers.range;

  if (range && /^video\//.test(type)) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      const safeEnd = Math.min(end, stat.size - 1);
      if (start <= safeEnd) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': safeEnd - start + 1,
        });
        fs.createReadStream(file, { start, end: safeEnd }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': /^video\//.test(type) ? 'bytes' : 'none',
  });
  fs.createReadStream(file).pipe(res);
}

function serveViewerAsset(req, res, name) {
  let file = null;

  if (name === 'reader.user.css') {
    file = USER_STYLE_FILE;
  } else if (['reader.css', 'reader.js'].includes(name)) {
    file = path.join(VIEWER_ASSET_ROOT, name);
  }

  if (!file || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  serveFile(req, res, file);
}

function startViewer({ libraryRoot, host = '127.0.0.1', port = 4173 }) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);

      if (url.pathname === '/') {
        const html = renderIndex(listArchives(libraryRoot));
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      if (url.pathname.startsWith('/_viewer/')) {
        serveViewerAsset(req, res, path.basename(url.pathname));
        return;
      }

      if (url.pathname.startsWith('/note/')) {
        const folder = decodeURIComponent(url.pathname.slice('/note/'.length).replace(/\/$/, ''));
        const dir = path.resolve(libraryRoot, folder);
        if (!isInside(path.resolve(libraryRoot), dir)) throw new Error('Invalid archive path.');

        const manifest = readJson(path.join(dir, 'archive.json'));
        if (!manifest) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const articleFile = path.join(dir, manifest.htmlFile || 'article.html');
        if (!fs.existsSync(articleFile)) {
          res.writeHead(404);
          res.end('Article HTML is missing');
          return;
        }

        const html = renderReader({
          manifest,
          folder,
          articleHtml: fs.readFileSync(articleFile, 'utf8'),
          hasUserStyle: fs.existsSync(USER_STYLE_FILE),
        });

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; base-uri 'self'; object-src 'none'",
        });
        res.end(html);
        return;
      }

      if (url.pathname.startsWith('/library/')) {
        const relativeUrl = url.pathname.slice('/library/'.length);
        const decoded = relativeUrl.split('/').map(decodeURIComponent).join(path.sep);
        const file = path.resolve(libraryRoot, decoded);
        if (!isInside(path.resolve(libraryRoot), file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        serveFile(req, res, file);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({ server, host, port: typeof address === 'object' && address ? address.port : port });
    });
  });
}

module.exports = { startViewer, listArchives, renderReader };
