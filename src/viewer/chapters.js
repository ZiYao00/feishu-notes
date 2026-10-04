const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const { readExplainManifest, sourceState } = require('./explain');

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

function resolveInside(root, relative) {
  const base = path.resolve(root);
  const candidate = path.resolve(base, relative);
  const rel = path.relative(base, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

function readChapterManifest(articleDir) {
  return readJson(path.join(articleDir, 'explain', 'chapters', 'manifest.json'));
}

function resolveChapterFile(articleDir, chapter) {
  if (!chapter || !chapter.file || path.extname(chapter.file).toLowerCase() !== '.md') return null;
  const root = path.join(articleDir, 'explain', 'chapters');
  const file = resolveInside(root, chapter.file);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

function chapterState(articleDir, chapter) {
  const file = resolveChapterFile(articleDir, chapter);
  return Object.assign({}, chapter, {
    available: chapter && chapter.status === 'ready' && Boolean(file),
    file,
  });
}

function getChapterSummary(articleDir, archiveManifest) {
  const chapterManifest = readChapterManifest(articleDir);
  if (!chapterManifest || !Array.isArray(chapterManifest.chapters)) return null;

  const chapters = chapterManifest.chapters.map(chapter => chapterState(articleDir, chapter));
  const ready = chapters.filter(chapter => chapter.available);
  if (!ready.length) return null;

  const explainManifest = readExplainManifest(articleDir);
  const source = sourceState(articleDir, archiveManifest, explainManifest);

  return {
    title: chapterManifest.title || '原文深度拆解',
    description: chapterManifest.description || '',
    chapterCount: chapters.length,
    readyChapterCount: ready.length,
    sourceStale: source.stale,
    firstChapterId: ready[0].id,
  };
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const LEARNING_DIRECTIVES = new Set(['hero', 'split', 'metrics', 'flow', 'compare', 'cards', 'case', 'takeaway']);

function parseLearningDirective(lines, startIndex) {
  const open = String(lines[startIndex] || '').trim().match(/^:::([a-z-]+)\s*$/);
  if (!open || !LEARNING_DIRECTIVES.has(open[1])) return null;

  const fields = {};
  let index = startIndex + 1;
  while (index < lines.length && !/^:::\s*$/.test(String(lines[index] || '').trim())) {
    const line = String(lines[index] || '').trim();
    const match = line.match(/^([a-z-]+):\s*(.*)$/);
    if (match) {
      if (!fields[match[1]]) fields[match[1]] = [];
      fields[match[1]].push(match[2]);
    }
    index += 1;
  }

  if (index < lines.length) index += 1;
  return { type: open[1], fields, nextIndex: index };
}

function firstField(fields, key) {
  return Array.isArray(fields[key]) && fields[key].length ? fields[key][0] : '';
}

function fieldList(fields, key) {
  return Array.isArray(fields[key]) ? fields[key] : [];
}

function splitDirectiveRow(value, expectedParts) {
  const parts = String(value || '').split('|').map(part => part.trim());
  while (parts.length < expectedParts) parts.push('');
  if (parts.length > expectedParts) {
    const tail = parts.splice(expectedParts - 1);
    parts.push(tail.join(' | '));
  }
  return parts;
}

function hasLearningNumber(value) {
  return /(?:^|[^A-Za-z])(?:[<>≈~]?\s*\d[\d,.]*(?:\.\d+)?\s*(?:%|秒|分钟|小时|天|条|万|h|s)?|\d+\s*[–-]\s*\d+\s*(?:秒|分钟|小时|天|h|s)?)(?:$|[^A-Za-z])/i.test(String(value || ''));
}

function learningValueClass(value, baseClass) {
  return baseClass + (hasLearningNumber(value) ? ' is-numeric' : '');
}

function safeLearningAsset(value, kind) {
  const candidate = String(value || '').trim().replace(/\\/g, '/');
  const pattern = kind === 'video'
    ? /^assets\/videos\/sha256-[a-f0-9]{64}\.mp4$/i
    : /^assets\/images\/sha256-[a-f0-9]{64}\.(?:png|jpe?g|webp)$/i;
  return pattern.test(candidate) ? candidate : '';
}

function renderFlowSteps(stepValues) {
  return stepValues.map(value => {
    const [number, heading, detail] = splitDirectiveRow(value, 3);
    return '<div class="learning-flow-step"><span class="learning-flow-number">' + renderInline(number) + '</span>' +
      '<div class="learning-flow-copy"><strong>' + renderInline(heading) + '</strong>' + (detail ? '<p>' + renderInline(detail) + '</p>' : '') + '</div></div>';
  });
}

function renderLearningDirective(type, fields) {
  const title = renderInline(firstField(fields, 'title'));
  const body = renderInline(firstField(fields, 'body'));

  if (type === 'hero') {
    const eyebrow = renderInline(firstField(fields, 'eyebrow'));
    const tags = fieldList(fields, 'tag').map(tag => '<span class="learning-tag">' + renderInline(tag) + '</span>').join('');
    return '<section class="learning-block learning-hero">' +
      (eyebrow ? '<div class="learning-eyebrow">' + eyebrow + '</div>' : '') +
      (title ? '<h2>' + title + '</h2>' : '') +
      (body ? '<p>' + body + '</p>' : '') +
      (tags ? '<div class="learning-tags">' + tags + '</div>' : '') +
      '</section>';
  }

  if (type === 'split') {
    const leftTitle = renderInline(firstField(fields, 'left-title'));
    const leftBody = renderInline(firstField(fields, 'left-body'));
    const rightTitle = renderInline(firstField(fields, 'right-title'));
    const rightBody = renderInline(firstField(fields, 'right-body'));
    return '<section class="learning-block learning-split">' +
      (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
      '<div class="learning-split-grid">' +
      '<div class="learning-panel learning-panel--source"><div class="learning-panel-label">' + leftTitle + '</div><p>' + leftBody + '</p></div>' +
      '<div class="learning-panel learning-panel--learn"><div class="learning-panel-label">' + rightTitle + '</div><p>' + rightBody + '</p></div>' +
      '</div></section>';
  }

  if (type === 'metrics') {
    const cards = fieldList(fields, 'metric').map(value => {
      const [number, label, note] = splitDirectiveRow(value, 3);
      return '<div class="learning-metric"><strong>' + renderInline(number) + '</strong><span>' + renderInline(label) + '</span>' +
        (note ? '<small>' + renderInline(note) + '</small>' : '') + '</div>';
    }).join('');
    return '<section class="learning-block learning-metrics">' +
      (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
      (body ? '<p class="learning-block-intro">' + body + '</p>' : '') +
      '<div class="learning-metric-grid">' + cards + '</div></section>';
  }

  if (type === 'flow') {
    const stepValues = fieldList(fields, 'step');
    const stepHtml = renderFlowSteps(stepValues);
    const count = Math.max(1, Math.min(6, stepValues.length));
    let track = '<div class="learning-flow-track is-count-' + count + '">' + stepHtml.join('') + '</div>';
    if (count === 6) {
      track = '<div class="learning-flow-stack">' +
        '<div class="learning-flow-track is-count-3">' + stepHtml.slice(0, 3).join('') + '</div>' +
        '<div class="learning-flow-turn" aria-hidden="true"><span>继续</span><strong>↓</strong></div>' +
        '<div class="learning-flow-track is-count-3">' + stepHtml.slice(3).join('') + '</div>' +
        '</div>';
    }
    return '<section class="learning-block learning-flow">' +
      (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
      (body ? '<p class="learning-block-intro">' + body + '</p>' : '') +
      track + '</section>';
  }

  if (type === 'compare') {
    const leftLabel = renderInline(firstField(fields, 'left-label') || 'A');
    const rightLabel = renderInline(firstField(fields, 'right-label') || 'B');
    const rows = fieldList(fields, 'row').map(value => {
      const [dimension, left, right] = splitDirectiveRow(value, 3);
      return '<div class="learning-compare-row"><div class="' + learningValueClass(dimension, 'learning-compare-key') + '">' + renderInline(dimension) + '</div>' +
        '<div class="' + learningValueClass(left, 'learning-compare-cell') + '">' + renderInline(left) + '</div>' +
        '<div class="' + learningValueClass(right, 'learning-compare-cell') + '">' + renderInline(right) + '</div></div>';
    }).join('');
    return '<section class="learning-block learning-compare">' +
      (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
      '<div class="learning-compare-head"><span></span><strong>' + leftLabel + '</strong><strong>' + rightLabel + '</strong></div>' +
      rows + '</section>';
  }

  if (type === 'cards') {
    const cards = fieldList(fields, 'card').map(value => {
      const [heading, meta, detail] = splitDirectiveRow(value, 3);
      return '<div class="learning-card"><strong>' + renderInline(heading) + '</strong>' +
        (meta ? '<span class="' + learningValueClass(meta, 'learning-card-meta') + '">' + renderInline(meta) + '</span>' : '') +
        (detail ? '<p>' + renderInline(detail) + '</p>' : '') + '</div>';
    }).join('');
    return '<section class="learning-block learning-cards">' +
      (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
      (body ? '<p class="learning-block-intro">' + body + '</p>' : '') +
      '<div class="learning-card-grid">' + cards + '</div></section>';
  }

  if (type === 'case') {
    const meta = renderInline(firstField(fields, 'meta'));
    const note = renderInline(firstField(fields, 'note'));
    const promptCase = /^(?:1|true|yes)$/i.test(firstField(fields, 'prompt'));
    const tags = fieldList(fields, 'tag')
      .map(tag => '<span class="learning-case-tag">' + renderInline(tag) + '</span>')
      .join('');
    const renderCaseList = (label, values, className) => values.length
      ? '<div class="learning-case-section ' + className + '"><div class="learning-case-section-title">' + label +
        '</div><ul>' + values.map(value => '<li>' + renderInline(value) + '</li>').join('') + '</ul></div>'
      : '';
    const analyses = fieldList(fields, 'analysis');
    const anatomy = fieldList(fields, 'anatomy');
    const constraints = fieldList(fields, 'constraint');
    const video = safeLearningAsset(firstField(fields, 'video'), 'video');
    const image = safeLearningAsset(firstField(fields, 'image'), 'image');
    let media = '';
    if (video) {
      media = '<figure class="reader-media reader-media--standalone reader-media--video learning-case-media">' +
        '<video class="reader-video" controls playsinline preload="metadata" src="' + escapeHtml(video) + '"></video></figure>';
    } else if (image) {
      media = '<figure class="reader-media reader-media--standalone reader-media--image learning-case-media">' +
        '<img class="reader-image" src="' + escapeHtml(image) + '" alt="' + escapeHtml(firstField(fields, 'title') || '案例图片') + '"></figure>';
    }

    return '<section class="learning-block learning-case' + (promptCase ? ' learning-case--prompt' : '') + '"' +
      (promptCase ? ' data-prompt-case="1"' : '') + '>' +
      '<div class="learning-case-head"><div>' +
      (title ? '<div class="learning-case-title">' + title + '</div>' : '') +
      (meta ? '<div class="learning-case-meta">' + meta + '</div>' : '') +
      '</div>' +
      (tags ? '<div class="learning-case-tags">' + tags + '</div>' : '') +
      '</div>' +
      (body ? '<p class="learning-case-summary">' + body + '</p>' : '') +
      media +
      renderCaseList('案例拆解', analyses, 'learning-case-analysis') +
      renderCaseList('Prompt 结构', anatomy, 'learning-case-anatomy') +
      renderCaseList('关键约束', constraints, 'learning-case-constraints') +
      (note ? '<div class="learning-case-note">' + note + '</div>' : '') +
      '</section>';
  }

  const items = fieldList(fields, 'item').map(item => '<li>' + renderInline(item) + '</li>').join('');
  return '<section class="learning-block learning-takeaway">' +
    (title ? '<div class="learning-block-title">' + title + '</div>' : '') +
    (body ? '<p class="learning-block-intro">' + body + '</p>' : '') +
    (items ? '<ul>' + items + '</ul>' : '') +
    '</section>';
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isSpecialLine(line, nextLine) {
  const trimmed = String(line || '').trim();
  return !trimmed ||
    /^#{1,4}\s+/.test(trimmed) ||
    /^:::[a-z-]+\s*$/.test(trimmed) ||
    /^\x60\x60\x60/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*_]{3,}$/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    (trimmed.includes('|') && isTableSeparator(nextLine || ''));
}

function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let index = 0;
  let headingIndex = 0;
  let articleTitleRendered = false;

  function nextHeadingId() {
    headingIndex += 1;
    return 'chapter-heading-' + String(headingIndex).padStart(2, '0');
  }

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const learningDirective = parseLearningDirective(lines, index);
    if (learningDirective) {
      out.push(renderLearningDirective(learningDirective.type, learningDirective.fields));
      index = learningDirective.nextIndex;
      continue;
    }

    const fence = trimmed.match(/^\x60\x60\x60([^\s]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\x60\x60\x60\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ' class="language-' + escapeHtml(fence[1]) + '"' : '';
      out.push('<div class="reader-block reader-block--code"><pre><code' + language + '>' + escapeHtml(code.join('\n')) + '</code></pre></div>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = renderInline(heading[2].trim());
      if (level === 1 && !articleTitleRendered) {
        articleTitleRendered = true;
        out.push('<h1 class="reader-article-title">' + title + '</h1>');
      } else {
        const outputLevel = level === 1 ? 2 : level;
        const id = nextHeadingId();
        out.push('<section class="reader-block reader-block--heading"><h' + outputLevel + ' id="' + id + '">' + title + '</h' + outputLevel + '></section>');
      }
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      out.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      out.push('<blockquote><p>' + renderInline(quote.join(' ')) + '</p></blockquote>');
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitTableRow(trimmed);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const headHtml = header.map(cell => '<th>' + renderInline(cell) + '</th>').join('');
      const bodyHtml = rows.map(row => {
        const cells = header.map((unused, cellIndex) => '<td>' + renderInline(row[cellIndex] || '') + '</td>').join('');
        return '<tr>' + cells + '</tr>';
      }).join('');
      out.push('<div class="reader-block reader-block--table"><div class="reader-table-wrap"><table><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div></div>');
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      out.push('<div class="reader-block reader-block--list"><ul>' + items.map(item => '<li>' + renderInline(item) + '</li>').join('') + '</ul></div>');
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      out.push('<div class="reader-block reader-block--list"><ol>' + items.map(item => '<li>' + renderInline(item) + '</li>').join('') + '</ol></div>');
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && !isSpecialLine(lines[index], lines[index + 1] || '')) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    out.push('<div class="reader-block reader-block--text"><p>' + renderInline(paragraph.join(' ')) + '</p></div>');
  }

  const html = '<article class="reader-article explain-chapter-article" data-reader-article>' + out.join('\n') + '</article>';
  return sanitizeHtml(html, {
    allowedTags: [
      'article', 'section', 'div', 'span', 'small', 'h1', 'h2', 'h3', 'h4',
      'p', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em',
      'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'figure', 'figcaption', 'video', 'img', 'source'
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'data-*'],
      code: ['class'],
      video: ['class', 'src', 'controls', 'playsinline', 'preload', 'poster', 'width', 'height', 'data-*'],
      img: ['class', 'src', 'alt', 'width', 'height', 'data-*'],
      source: ['src', 'type']
    }
  });
}

function renderThemeControl() {
  return '<button type="button" class="reader-action reader-theme-toggle" data-theme-toggle aria-label="切换到暗色模式" title="切换到暗色模式" aria-pressed="false"></button>';
}

function renderChapterReader(options) {
  const archiveManifest = options.archiveManifest;
  const articleDir = options.articleDir;
  const chapterManifest = options.chapterManifest;
  const explainManifest = options.explainManifest;
  const folder = options.folder;
  const requestedChapterId = options.requestedChapterId;

  const chapters = chapterManifest.chapters.map(chapter => chapterState(articleDir, chapter));
  const readyChapters = chapters.filter(chapter => chapter.available);
  if (!readyChapters.length) return null;

  const selected = readyChapters.find(chapter => chapter.id === requestedChapterId) || readyChapters[0];
  const readyIndex = readyChapters.findIndex(chapter => chapter.id === selected.id);
  const previous = readyIndex > 0 ? readyChapters[readyIndex - 1] : null;
  const next = readyIndex >= 0 && readyIndex < readyChapters.length - 1 ? readyChapters[readyIndex + 1] : null;

  const article = renderMarkdown(fs.readFileSync(selected.file, 'utf8'));
  const encodedFolder = encodeURIComponent(folder);
  const source = sourceState(articleDir, archiveManifest, explainManifest);
  const base = '/explain/' + encodedFolder + '/';
  const hrefFor = chapter => base + '?chapter=' + encodeURIComponent(chapter.id);

  const nav = readyChapters.map(chapter => {
    const active = chapter.id === selected.id;
    return '<a class="chapter-nav-item ' + (active ? 'is-active' : '') + '" href="' + hrefFor(chapter) + '" ' + (active ? 'aria-current="page"' : '') + ' title="' + escapeHtml(chapter.title || chapter.label || chapter.id) + '">' +
      '<span class="chapter-nav-number">' + escapeHtml(chapter.number || '') + '</span>' +
      '<span class="chapter-nav-copy"><strong>' + escapeHtml(chapter.label || chapter.title || chapter.id) + '</strong></span></a>';
  }).join('');

  const mobileOptions = readyChapters.map(chapter => {
    const selectedAttr = chapter.id === selected.id ? ' selected' : '';
    return '<option value="' + hrefFor(chapter) + '"' + selectedAttr + '>' + escapeHtml(chapter.number || '') + ' · ' + escapeHtml(chapter.label || chapter.title || chapter.id) + '</option>';
  }).join('');

  const previousHtml = previous
    ? '<a class="chapter-pager-link" href="' + hrefFor(previous) + '"><span>← 上一章</span><strong>' + escapeHtml(previous.label || previous.title) + '</strong></a>'
    : '<span class="chapter-pager-link is-disabled"><span>← 上一章</span><strong>已经是第一章</strong></span>';

  const nextHtml = next
    ? '<a class="chapter-pager-link is-next" href="' + hrefFor(next) + '"><span>下一章 →</span><strong>' + escapeHtml(next.label || next.title) + '</strong></a>'
    : '<span class="chapter-pager-link is-next is-disabled"><span>下一章 →</span><strong>已到最后一章</strong></span>';

  const staleMeta = source.stale ? '<span class="reader-status partial">原文已更新，待复核</span>' : '';
  const chapterMeta = '原文深度拆解 · ' + escapeHtml(selected.number || String(readyIndex + 1).padStart(2, '0')) + ' / ' + String(readyChapters.length).padStart(2, '0');

  return '<!doctype html><html lang="zh-CN"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base href="/library/' + encodedFolder + '/">' +
    '<title>' + escapeHtml(selected.title || selected.label || selected.id) + ' · ' + escapeHtml(chapterManifest.title || '原文深度拆解') + '</title>' +
    '<script src="/_viewer/theme-init.js"></script>' +
    '<link rel="stylesheet" href="/_viewer/reader.css"><script src="/_viewer/reader.js" defer></script>' +
    '</head><body class="explain-chapter-reader">' +
    '<header class="reader-topbar">' +
    '<a class="reader-back" href="/"><span aria-hidden="true">←</span><span>笔记库</span></a>' +
    '<div class="reader-titlebar"><div class="reader-titlebar-title">' + escapeHtml(archiveManifest.title || folder) + '</div>' +
    '<div class="reader-titlebar-meta"><span>' + chapterMeta + '</span>' + staleMeta + '</div></div>' +
    '<div class="reader-toolbar"><a class="reader-action" href="/note/' + encodedFolder + '/">查看原始文章</a>' + renderThemeControl() + '</div>' +
    '<div class="reader-progress"><span data-reader-progress></span></div></header>' +
    '<div class="chapter-mobile-nav"><label for="chapter-select">章节</label><select id="chapter-select" data-chapter-select aria-label="选择拆解章节">' + mobileOptions + '</select></div>' +
    '<div class="chapter-reader-layout"><aside class="chapter-sidebar" aria-label="拆解章节">' +
    '<div class="chapter-sidebar-head"><strong>' + escapeHtml(chapterManifest.title || '原文深度拆解') + '</strong></div>' +
    '<nav class="chapter-nav">' + nav + '</nav></aside>' +
    '<main class="chapter-main"><div class="reader-paper"><div class="reader-content">' + article +
    '<nav class="chapter-pager" aria-label="章节翻页">' + previousHtml + nextHtml + '</nav>' +
    '</div></div></main></div>' +
    '<dialog class="reader-dialog" data-media-dialog><div class="reader-dialog-bar"><button class="reader-dialog-close" type="button" data-dialog-close aria-label="关闭媒体预览">关闭</button></div><div class="reader-dialog-stage"><video controls playsinline preload="metadata" hidden></video><img alt="" hidden></div></dialog>' +
    '</body></html>';
}

module.exports = {
  readChapterManifest,
  getChapterSummary,
  renderChapterReader,
  renderThemeControl,
};
