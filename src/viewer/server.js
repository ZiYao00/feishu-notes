const http = require('http');
const fs = require('fs');
const path = require('path');
const { readExplainManifest } = require('./explain');
const {readMarker}=require('../archive/publish-transaction');
const {
  readChapterManifest,
  getChapterSummary,
  renderChapterReader,
  renderThemeControl,
  chapterAnchorId,
} = require('./chapters');

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
    const explain = getChapterSummary(dir, manifest);
    items.push({
      folder: entry.name,
      title: manifest.title || entry.name,
      savedAt: manifest.savedAt || '',
      status: readMarker(dir)?'publishing':manifest.status || 'unknown',
      qualityVerdict:manifest.quality?.verdict||'legacy_unverified',
      unresolvedAttachments:manifest.quality?.unresolvedAttachmentCount??null,
      mediaCount: media.length,
      localMediaCount: media.filter(item => item.status === 'downloaded').length,
      totalBytes: manifest.storage?.physicalBytes ?? uniquePhysicalBytes(media),
      logicalBytes: manifest.storage?.logicalBytes ?? media.reduce((sum, item) => sum + (item.actualSize || 0), 0),
      deduplicatedBytes: manifest.storage?.deduplicatedBytes ?? 0,
      explain,
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
    const encodedFolder = encodeURIComponent(item.folder);
    const explain = item.explain
      ? `<a class="btn btn-primary" href="/explain/${encodedFolder}/">
          <span>进入深度拆解</span>
          <small>${item.explain.sourceStale ? '来源需复核' : '从原文总览开始'}</small>
        </a>`
      : '';

    return `<article class="card">
      <div class="card-main">
        <div class="eyebrow">OFFLINE ARCHIVE</div>
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="meta">
          <span class="status ${statusClass}">${escapeHtml(item.status)}</span>
          <span>${escapeHtml(item.qualityVerdict||'legacy_unverified')}</span>
          ${item.unresolvedAttachments?`<span>${item.unresolvedAttachments} 附件未离线</span>`:''}
          <span>${item.localMediaCount}/${item.mediaCount} 媒体</span>
          <span>${formatBytes(item.totalBytes)}</span>
          ${saved}
        </div>
        <div class="date">${escapeHtml(item.savedAt)}</div>
      </div>
      <div class="card-actions">
        ${explain}
        <a class="btn btn-secondary" href="/note/${encodedFolder}/"><span>查看原始文章</span><small>Source</small></a>
      </div>
    </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>feishu-notes</title>
<script src="/_viewer/theme-init.js"></script>
<style>
:root{color-scheme:light;--bg:#f5f5f8;--surface:#fff;--surface-soft:#f7f7fa;--text:#34364a;--strong:#232437;--muted:#6c6f85;--faint:#8c8fa1;--line:#e4e5eb;--accent:#7287fd;--accent-soft:rgba(114,135,253,.10);--success:#40a02b;--success-soft:rgba(64,160,43,.09);--warning:#df8e1d;--warning-soft:rgba(223,142,29,.10);--shadow:0 10px 30px rgba(76,79,105,.07)}
html[data-theme="dark"]{color-scheme:dark;--bg:#11111b;--surface:#1e1e2e;--surface-soft:#181825;--text:#cdd6f4;--strong:#e7eaf8;--muted:#a6adc8;--faint:#7f849c;--line:#313244;--accent:#b4befe;--accent-soft:rgba(180,190,254,.10);--success:#a6e3a1;--success-soft:rgba(166,227,161,.08);--warning:#f9e2af;--warning-soft:rgba(249,226,175,.08);--shadow:0 16px 42px rgba(0,0,0,.28)}
*{box-sizing:border-box}
body{margin:0;font:15px/1.68 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:radial-gradient(circle at 85% -10%,var(--accent-soft),transparent 34rem),var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
main{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:44px 0 84px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid var(--line)}
h1{font-size:30px;line-height:1.2;letter-spacing:-.02em;margin:0;color:var(--strong)}p{margin:7px 0 0;color:var(--muted)}
.count{color:var(--faint);font-size:12px}
.header-tools{display:flex;align-items:center;gap:12px}
.theme-toggle{width:36px;height:34px;padding:0;border:1px solid var(--line);border-radius:9px;background:var(--surface-soft);color:var(--strong);cursor:pointer}
.theme-toggle::before{content:"☾";font-size:18px;line-height:1}html[data-theme="dark"] .theme-toggle::before{content:"☀"}
.grid{display:grid;gap:16px}
.card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.card-main{min-width:0}.eyebrow{margin-bottom:5px;color:var(--faint);font-size:12px;font-weight:800;letter-spacing:.09em}
.title{font-size:18px;font-weight:720;line-height:1.45;color:var(--strong);margin-bottom:13px}
.meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13px}
.status{padding:2px 7px;border-radius:999px}.status.complete{background:var(--success-soft);color:var(--success)}.status.partial{background:var(--warning-soft);color:var(--warning)}.status.pending{background:var(--accent-soft);color:var(--accent)}
.date{margin-top:11px;color:var(--faint);font-size:12px}
.card-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.btn{min-width:132px;min-height:52px;display:flex;flex-direction:column;justify-content:center;gap:1px;padding:8px 13px;border:1px solid var(--line);border-radius:11px;text-decoration:none;transition:.15s ease}
.btn span{font-size:14px;font-weight:720}.btn small{color:inherit;opacity:.72;font-size:12px;letter-spacing:.02em}
.btn:hover{transform:translateY(-1px)}.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn-secondary{background:var(--surface-soft);color:var(--text)}.btn-secondary:hover{border-color:var(--accent);color:var(--accent)}
.empty{padding:50px 0;color:var(--faint)}
@media(max-width:720px){main{width:calc(100% - 24px);padding-top:26px}.card{grid-template-columns:1fr;gap:18px}.card-actions{justify-content:stretch}.btn{flex:1;min-width:0}}
</style>
<script src="/_viewer/reader.js" defer></script>
</head>
<body>
<main>
<header><div><h1>feishu-notes</h1><p>本地飞书笔记归档 · 原始资料与原文深度拆解</p></div><div class="header-tools"><button type="button" class="theme-toggle" data-theme-toggle aria-label="切换到暗色模式" title="切换到暗色模式" aria-pressed="false"></button><div class="count">${items.length} 篇</div></div></header>
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
<script src="/_viewer/theme-init.js"></script>
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
      <span>${escapeHtml(manifest.quality?.verdict||'legacy_unverified')}</span>
      ${manifest.quality?.unresolvedAttachmentCount?`<span>${manifest.quality.unresolvedAttachmentCount} 附件未离线</span>`:''}
      <span>${videoCount} 视频 · ${imageCount} 图片</span>
      <span>${formatBytes(physicalBytes)}</span>
      ${deduplicatedBytes ? `<span>去重节省 ${formatBytes(deduplicatedBytes)}</span>` : ''}
    </div>
  </div>
  <div class="reader-toolbar">
    ${manifest.sourceUrl ? `<a class="reader-action" href="${escapeHtml(manifest.sourceUrl)}" target="_blank" rel="noreferrer">原文</a>` : ''}
    ${renderThemeControl()}
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

  if (req.method === 'GET' && range && /^video\//.test(type)) {
    const match = range.trim().match(/^bytes=(\d*)-(\d*)$/i);
    if (match && (match[1] || match[2])) {
      const first = match[1] ? Number(match[1]) : null;
      const last = match[2] ? Number(match[2]) : null;
      const valid = (first === null || Number.isSafeInteger(first)) &&
        (last === null || Number.isSafeInteger(last)) &&
        (first === null || last === null || first <= last);
      if (valid) {
        const start = first === null ? Math.max(0, stat.size - last) : first;
        const safeEnd = first === null || last === null ? stat.size - 1 : Math.min(last, stat.size - 1);
        if (stat.size === 0 || start > safeEnd) {
          res.writeHead(416, {
            'Content-Type': type,
            'Content-Range': `bytes */${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': 0,
          });
          res.end();
          return;
        }
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
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

function serveViewerAsset(req, res, name) {
  let file = null;

  if (name === 'reader.user.css') {
    file = USER_STYLE_FILE;
  } else if (['reader.css', 'reader.js', 'theme-init.js'].includes(name)) {
    file = path.join(VIEWER_ASSET_ROOT, name);
  }

  if (!file || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  serveFile(req, res, file);
}

function blockIfPublishing(res,dir){
  if(!readMarker(dir))return false;
  res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Retry-After':'5','Cache-Control':'no-store'});
  res.end('Archive is being published or requires recovery. The source is preserved.');
  return true;
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

      if (url.pathname.startsWith('/explain/')) {
        const relative = url.pathname.slice('/explain/'.length).replace(/^\/+|\/+$/g, '');
        const parts = relative ? relative.split('/').map(decodeURIComponent) : [];
        const folder = parts[0] || '';
        const dir = path.resolve(libraryRoot, folder);
        if (!folder || !isInside(path.resolve(libraryRoot), dir)) throw new Error('Invalid explain path.');
        if (blockIfPublishing(res,dir))return;

        if (parts.length > 1) {
          res.writeHead(404);
          res.end('Legacy lesson route is hidden');
          return;
        }

        const archiveManifest = readJson(path.join(dir, 'archive.json'));
        const explainManifest = readExplainManifest(dir);
        const chapterManifest = readChapterManifest(dir);
        if (!archiveManifest || !explainManifest || !chapterManifest) {
          res.writeHead(404);
          res.end('Explain reader not found');
          return;
        }

        const requestedChapterId = url.searchParams.get('chapter') || '';
        if (requestedChapterId) {
          const requestedChapter = chapterManifest.chapters.find(chapter =>
            chapter && chapter.status === 'ready' && chapter.id === requestedChapterId
          );
          if (requestedChapter) {
            const location = '/explain/' + encodeURIComponent(folder) + '/#' + chapterAnchorId(requestedChapter);
            res.writeHead(302, { Location: location });
            res.end();
            return;
          }
        }

        const html = renderChapterReader({
          archiveManifest,
          explainManifest,
          chapterManifest,
          folder,
          articleDir: dir,
        });

        if (!html) {
          res.writeHead(404);
          res.end('Explain chapter not found');
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; base-uri 'self'; object-src 'none'",
        });
        res.end(html);
        return;
      }

      if (url.pathname.startsWith('/note/')) {
        const folder = decodeURIComponent(url.pathname.slice('/note/'.length).replace(/\/$/, ''));
        const dir = path.resolve(libraryRoot, folder);
        if (!isInside(path.resolve(libraryRoot), dir)) throw new Error('Invalid archive path.');
        if (blockIfPublishing(res,dir))return;

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
        const folder=decoded.split(path.sep)[0];
        if(folder && blockIfPublishing(res,path.resolve(libraryRoot,folder)))return;
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
