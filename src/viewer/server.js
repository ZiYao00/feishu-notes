const http = require('http');
const fs = require('fs');
const path = require('path');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
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
      totalBytes: media.reduce((sum, item) => sum + (item.actualSize || 0), 0),
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
    return `<a class="card" href="/note/${encodeURIComponent(item.folder)}/">
      <div class="title">${escapeHtml(item.title)}</div>
      <div class="meta">
        <span class="status ${statusClass}">${escapeHtml(item.status)}</span>
        <span>${item.localMediaCount}/${item.mediaCount} 媒体</span>
        <span>${formatBytes(item.totalBytes)}</span>
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

function startViewer({ libraryRoot, host = '127.0.0.1', port = 4173 }) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (url.pathname === '/') {
        const html = renderIndex(listArchives(libraryRoot));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
        res.end(html);
        return;
      }

      if (url.pathname.startsWith('/note/')) {
        const folder = decodeURIComponent(url.pathname.slice('/note/'.length).replace(/\/$/, ''));
        const dir = path.resolve(libraryRoot, folder);
        if (!isInside(path.resolve(libraryRoot), dir)) throw new Error('Invalid archive path.');
        const manifest = readJson(path.join(dir, 'archive.json'));
        if (!manifest) {
          res.writeHead(404); res.end('Not found'); return;
        }
        res.writeHead(302, { Location: `/library/${encodeURIComponent(folder)}/${encodeURIComponent(manifest.htmlFile || 'article.html')}` });
        res.end();
        return;
      }

      if (url.pathname.startsWith('/library/')) {
        const relativeUrl = url.pathname.slice('/library/'.length);
        const decoded = relativeUrl.split('/').map(decodeURIComponent).join(path.sep);
        const file = path.resolve(libraryRoot, decoded);
        if (!isInside(path.resolve(libraryRoot), file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404); res.end('Not found'); return;
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
    server.listen(port, host, () => resolve({ server, host, port }));
  });
}

module.exports = { startViewer, listArchives };
