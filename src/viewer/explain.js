const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sha256File(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function resolveInside(root, relative) {
  const base = path.resolve(root);
  const candidate = path.resolve(base, relative);
  const rel = path.relative(base, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

function readExplainManifest(articleDir) {
  return readJson(path.join(articleDir, 'explain', 'manifest.json'));
}

function readCases(articleDir, explainManifest) {
  const relative = explainManifest?.evidence?.casesFile || 'evidence/cases.json';
  const file = resolveInside(path.join(articleDir, 'explain'), relative);
  return file ? readJson(file) : null;
}

function sourceState(articleDir, archiveManifest, explainManifest) {
  const source = explainManifest?.source || {};
  let stale = false;
  const reasons = [];

  if (source.documentId && archiveManifest?.documentId && source.documentId !== archiveManifest.documentId) {
    stale = true;
    reasons.push('document_id_changed');
  }

  if (source.savedAt && archiveManifest?.savedAt && source.savedAt !== archiveManifest.savedAt) {
    stale = true;
    reasons.push('archive_saved_at_changed');
  }

  const fingerprint = source.fingerprint || null;
  if (fingerprint?.file && fingerprint?.sha256) {
    const sourceFile = resolveInside(articleDir, fingerprint.file);
    const currentHash = sourceFile ? sha256File(sourceFile) : null;
    if (!currentHash || currentHash !== fingerprint.sha256) {
      stale = true;
      reasons.push('source_fingerprint_changed');
    }
  }

  return { stale, reasons };
}

function evidenceSummary(articleDir, explainManifest) {
  const cases = readCases(articleDir, explainManifest);
  const caseCount = Array.isArray(cases?.cases) ? cases.cases.length : 0;

  const asrDir = path.join(articleDir, 'explain', explainManifest?.evidence?.asrDir || 'evidence/asr');
  const frameDir = path.join(articleDir, 'explain', explainManifest?.evidence?.framesDir || 'evidence/frames');
  const asrCount = fs.existsSync(asrDir)
    ? fs.readdirSync(asrDir, { withFileTypes: true }).filter(entry => entry.isFile() && /\.json$/i.test(entry.name)).length
    : 0;
  const frameSetCount = fs.existsSync(frameDir)
    ? fs.readdirSync(frameDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
    : 0;

  return { caseCount, asrCount, frameSetCount };
}

function getExplainSummary(articleDir, archiveManifest) {
  const manifest = readExplainManifest(articleDir);
  if (!manifest) return null;

  const lessons = Array.isArray(manifest.lessons) ? manifest.lessons : [];
  const readyLessons = lessons.filter(item => item?.status === 'ready');
  const source = sourceState(articleDir, archiveManifest, manifest);
  const evidence = evidenceSummary(articleDir, manifest);

  return {
    status: manifest.status || 'draft',
    title: manifest.title || '讲解专题',
    lessonCount: lessons.length,
    readyLessonCount: readyLessons.length,
    sourceStale: source.stale,
    staleReasons: source.reasons,
    evidence,
  };
}

function lessonForId(explainManifest, lessonId) {
  const lessons = Array.isArray(explainManifest?.lessons) ? explainManifest.lessons : [];
  return lessons.find(item => item?.id === lessonId) || null;
}

function resolveLessonFile(articleDir, lesson) {
  if (!lesson?.file || path.extname(lesson.file).toLowerCase() !== '.html') return null;
  const explainRoot = path.join(articleDir, 'explain');
  const file = resolveInside(explainRoot, lesson.file);
  if (!file) return null;
  const lessonsRoot = path.resolve(explainRoot, 'lessons') + path.sep;
  if (!path.resolve(file).startsWith(lessonsRoot)) return null;
  return file;
}

function sanitizeLessonArticle(html) {
  const article = String(html).match(/<article\b[^>]*data-reader-article[^>]*>[\s\S]*?<\/article>/i);
  const source = article ? article[0] : String(html);
  return sanitizeHtml(source, {
    allowedTags: [
      'article', 'section', 'div', 'span',
      'h1', 'h2', 'h3', 'h4',
      'p', 'blockquote', 'ul', 'ol', 'li',
      'strong', 'em', 'b', 'i', 'mark',
      'pre', 'code', 'hr', 'br',
      'a', 'img', 'video', 'source', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'title', 'data-*'],
      a: ['href', 'target', 'rel', 'class', 'id', 'title', 'data-*'],
      img: ['src', 'alt', 'width', 'height', 'class', 'id', 'title', 'data-*'],
      video: ['src', 'controls', 'playsinline', 'preload', 'poster', 'width', 'height', 'class', 'id', 'data-*'],
      source: ['src', 'type'],
      th: ['colspan', 'rowspan', 'scope', 'class', 'id'],
      td: ['colspan', 'rowspan', 'class', 'id'],
    },
    allowProtocolRelative: false,
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

function renderTopbar({ folder, title, meta, backHref, backLabel, sourceHref }) {
  return `<header class="reader-topbar">
  <a class="reader-back" href="${backHref}"><span aria-hidden="true">←</span><span>${escapeHtml(backLabel)}</span></a>
  <button class="reader-action reader-toc-toggle" type="button" data-toc-toggle>目录</button>
  <div class="reader-titlebar">
    <div class="reader-titlebar-title">${escapeHtml(title)}</div>
    <div class="reader-titlebar-meta">${meta}</div>
  </div>
  <div class="reader-toolbar">
    ${sourceHref ? `<a class="reader-action" href="${sourceHref}">原始报告</a>` : ''}
    <button class="reader-action" type="button" data-theme-toggle aria-label="切换主题">系统</button>
  </div>
  <div class="reader-progress"><span data-reader-progress></span></div>
</header>`;
}

function renderExplainLanding({ archiveManifest, explainManifest, folder, articleDir }) {
  const lessons = Array.isArray(explainManifest.lessons) ? explainManifest.lessons : [];
  const source = sourceState(articleDir, archiveManifest, explainManifest);
  const evidence = evidenceSummary(articleDir, explainManifest);
  const encodedFolder = encodeURIComponent(folder);
  const statusLabel = source.stale ? '源文章已更新' : (explainManifest.status === 'ready' ? '专题已完成' : '专题构建中');

  const lessonCards = lessons.length
    ? lessons.map((lesson, index) => {
      const available = Boolean(resolveLessonFile(articleDir, lesson) && fs.existsSync(resolveLessonFile(articleDir, lesson)));
      const href = available ? `/explain/${encodedFolder}/${encodeURIComponent(lesson.id)}/` : '';
      const state = lesson.status === 'ready' && available ? '可阅读' : lesson.status === 'draft' ? '草稿' : '待制作';
      return `<article class="explain-lesson-card ${available ? '' : 'is-disabled'}">
        <div class="explain-lesson-index">${String(index).padStart(2, '0')}</div>
        <div class="explain-lesson-body">
          <div class="explain-lesson-title">${escapeHtml(lesson.title || lesson.id || '未命名课程')}</div>
          ${lesson.summary ? `<p>${escapeHtml(lesson.summary)}</p>` : ''}
          <div class="explain-lesson-meta">
            <span>${escapeHtml(state)}</span>
            ${lesson.caseCount != null ? `<span>${Number(lesson.caseCount)} Cases</span>` : ''}
          </div>
        </div>
        ${href ? `<a class="explain-lesson-link" href="${href}" aria-label="阅读 ${escapeHtml(lesson.title || lesson.id)}">进入</a>` : '<span class="explain-lesson-link is-disabled">等待</span>'}
      </article>`;
    }).join('\n')
    : `<div class="explain-empty">
      <strong>专题骨架已建立。</strong>
      <span>下一批会先制作 2 篇真实 Lesson，再决定完整课程数量。</span>
    </div>`;

  const staleNotice = source.stale
    ? `<div class="explain-notice is-warning"><strong>原始归档已发生变化。</strong><span>当前讲解专题需要重新核对来源指纹后再继续扩写。</span></div>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="/library/${encodedFolder}/">
<title>${escapeHtml(explainManifest.title || archiveManifest.title || folder)} · 讲解专题</title>
<link rel="stylesheet" href="/_viewer/reader.css">
<script src="/_viewer/reader.js" defer></script>
</head>
<body class="explain-home">
${renderTopbar({
  folder,
  title: explainManifest.title || '讲解专题',
  meta: `<span class="reader-status ${source.stale ? 'partial' : 'complete'}">${escapeHtml(statusLabel)}</span><span>${lessons.length} Lessons</span><span>${evidence.caseCount} Cases</span>`,
  backHref: '/',
  backLabel: '笔记库',
  sourceHref: `/note/${encodedFolder}/`,
})}
<main class="explain-shell">
  <section class="explain-hero">
    <div class="explain-kicker">PERFORMANCE CREATIVE · LEARNING EDITION</div>
    <h1>${escapeHtml(explainManifest.title || archiveManifest.title || folder)}</h1>
    <p>${escapeHtml(explainManifest.description || '基于原始飞书归档、视频证据、ASR 文案与案例拆解建立的教学专题。')}</p>
    <div class="explain-proof-chain">
      <span>原始报告</span><b>→</b><span>视频证据</span><b>→</b><span>ASR / 关键帧</span><b>→</b><span>方法论</span><b>→</b><span>跨类目迁移</span>
    </div>
  </section>

  ${staleNotice}

  <section class="explain-stat-grid" aria-label="专题状态">
    <article><strong>${lessons.length}</strong><span>Lessons</span></article>
    <article><strong>${evidence.caseCount}</strong><span>Evidence Cases</span></article>
    <article><strong>${evidence.asrCount}</strong><span>ASR Records</span></article>
    <article><strong>${evidence.frameSetCount}</strong><span>Frame Sets</span></article>
  </section>

  <section class="explain-section">
    <div class="explain-section-head">
      <div>
        <div class="explain-kicker">COURSE MAP</div>
        <h2>讲解专题</h2>
      </div>
      <a class="reader-action" href="/note/${encodedFolder}/">查看原始报告</a>
    </div>
    <div class="explain-lesson-list">
      ${lessonCards}
    </div>
  </section>
</main>
</body>
</html>`;
}

function renderExplainLesson({ archiveManifest, explainManifest, folder, articleDir, lesson }) {
  const file = resolveLessonFile(articleDir, lesson);
  if (!file || !fs.existsSync(file)) return null;
  const article = sanitizeLessonArticle(fs.readFileSync(file, 'utf8'));
  const encodedFolder = encodeURIComponent(folder);
  const source = sourceState(articleDir, archiveManifest, explainManifest);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="/library/${encodedFolder}/">
<title>${escapeHtml(lesson.title || lesson.id)} · ${escapeHtml(explainManifest.title || '讲解专题')}</title>
<link rel="stylesheet" href="/_viewer/reader.css">
<script src="/_viewer/reader.js" defer></script>
</head>
<body class="explain-lesson">
${renderTopbar({
  folder,
  title: lesson.title || lesson.id,
  meta: `<span>${escapeHtml(explainManifest.title || '讲解专题')}</span>${source.stale ? '<span class="reader-status partial">来源待复核</span>' : ''}`,
  backHref: `/explain/${encodedFolder}/`,
  backLabel: '讲解专题',
  sourceHref: `/note/${encodedFolder}/`,
})}
<div class="reader-layout">
  <aside class="reader-toc" data-reader-toc>
    <div class="reader-toc-head">
      <div class="reader-toc-title">目录</div>
      <button class="reader-toc-collapse" type="button" data-toc-collapse aria-label="折叠目录" title="折叠目录">‹</button>
    </div>
    <nav class="reader-toc-list" data-reader-toc-list aria-label="课程目录"></nav>
  </aside>
  <div class="reader-splitter" data-reader-splitter role="separator" aria-orientation="vertical" aria-label="调整目录与正文宽度" aria-valuemin="160" aria-valuemax="720" aria-valuenow="208" tabindex="0" title="拖动调整目录宽度；双击恢复默认"></div>
  <main class="reader-main">
    <div class="reader-paper">
      <div class="reader-content">
        ${article}
      </div>
    </div>
  </main>
</div>
<dialog class="reader-dialog" data-media-dialog>
  <div class="reader-dialog-bar"><button class="reader-dialog-close" type="button" data-dialog-close aria-label="关闭媒体预览">关闭</button></div>
  <div class="reader-dialog-stage"><video controls playsinline preload="metadata" hidden></video><img alt="" hidden></div>
</dialog>
</body>
</html>`;
}

module.exports = {
  readExplainManifest,
  getExplainSummary,
  renderExplainLanding,
  renderExplainLesson,
  lessonForId,
  sourceState,
};
