const sanitizeHtml = require('sanitize-html');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

function cleanText(value = '') {
  return String(value)
    .replace(/\p{Cf}/gu, '')
    .replace(/附件不支持打印/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function replaceAllLiteral(input, search, replacement) {
  if (!search) return input;
  return input.split(search).join(replacement);
}

function mediaTarget(item) {
  return item.status === 'downloaded'
    ? item.localRelativePath.replace(/\\/g, '/')
    : item.url;
}

function findMedia(url, inventory) {
  return inventory.find(item => item.url === url) || null;
}

function orientationFor(item) {
  const ratio = Number(item?.aspectRatio) ||
    (item?.width && item?.height ? item.width / item.height : null);
  if (!ratio) return 'unknown';
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.1) return 'landscape';
  return 'square';
}

function rewriteMedia(html, inventory) {
  let output = html;
  for (const item of inventory) {
    const target = mediaTarget(item);
    output = replaceAllLiteral(output, item.url, target);
    output = replaceAllLiteral(
      output,
      item.url.replace(/&/g, '&amp;'),
      target.replace(/&/g, '&amp;')
    );
  }
  return output;
}

function sanitizeBlock(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      'div', 'span', 'p', 'a', 'img', 'video', 'source',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
      'blockquote', 'pre', 'code', 'br', 'hr', 'figure', 'figcaption',
    ],
    allowedAttributes: {
      '*': [
        'class', 'id', 'data-block-id', 'data-media-id', 'data-media-kind',
        'data-media-context', 'data-media-width', 'data-media-height',
        'data-media-orientation', 'colspan', 'rowspan',
      ],
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      video: ['src', 'controls', 'poster', 'preload', 'width', 'height', 'playsinline'],
      source: ['src', 'type'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      video: ['http', 'https'],
      source: ['http', 'https'],
      a: ['http', 'https', 'mailto'],
    },
    allowProtocolRelative: false,
  });
}

function createTurndown() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  service.use(gfm);

  service.addRule('video', {
    filter: 'video',
    replacement(content, node) {
      const src = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src') || '';
      if (!src) return '';
      return `\n\n<video controls src="${src}"></video>\n\n`;
    },
  });

  service.addRule('source', {
    filter: 'source',
    replacement() {
      return '';
    },
  });

  return service;
}

function headingLevel(className) {
  const match = String(className).match(/docx-heading([1-6])-block/);
  return match ? Math.min(6, Number(match[1]) + 1) : null;
}

function markdownMedia(mediaEntries, inventory, compact = false) {
  const parts = [];
  const seenSources = new Set();

  for (const entry of mediaEntries || []) {
    if (seenSources.has(entry.url)) continue;
    seenSources.add(entry.url);

    const item = findMedia(entry.url, inventory);
    if (!item) continue;
    const target = mediaTarget(item);

    if (item.kind === 'video') {
      parts.push(compact ? `[视频](${target})` : `<video controls src="${target}"></video>`);
    } else {
      parts.push(`![](${target})`);
    }
  }

  return parts;
}

function mediaDataAttributes(item, context) {
  const orientation = orientationFor(item);
  return [
    `data-media-id="${escapeHtml(item.id)}"`,
    `data-media-kind="${escapeHtml(item.kind)}"`,
    `data-media-context="${escapeHtml(context)}"`,
    `data-media-orientation="${orientation}"`,
    item.width ? `data-media-width="${item.width}"` : '',
    item.height ? `data-media-height="${item.height}"` : '',
  ].filter(Boolean).join(' ');
}

function htmlMedia(mediaEntries, inventory, context = 'standalone') {
  const parts = [];
  const seenSources = new Set();

  for (const entry of mediaEntries || []) {
    if (seenSources.has(entry.url)) continue;
    seenSources.add(entry.url);

    const item = findMedia(entry.url, inventory);
    if (!item) continue;

    const target = mediaTarget(item);
    const orientation = orientationFor(item);
    const attrs = mediaDataAttributes(item, context);
    const contextClass = context === 'table-cell' ? 'reader-media--table-cell' : 'reader-media--standalone';

    if (item.kind === 'video') {
      const intrinsic = [
        item.width ? `width="${item.width}"` : '',
        item.height ? `height="${item.height}"` : '',
      ].filter(Boolean).join(' ');
      parts.push(
        `<figure class="reader-media reader-media--video reader-media--${orientation} ${contextClass}" ${attrs}>` +
        `<video class="reader-video" controls playsinline preload="none" src="${escapeHtml(target)}" ${intrinsic} ${attrs}></video>` +
        `</figure>`
      );
    } else {
      const intrinsic = [
        item.width ? `width="${item.width}"` : '',
        item.height ? `height="${item.height}"` : '',
      ].filter(Boolean).join(' ');
      parts.push(
        `<figure class="reader-media reader-media--image reader-media--${orientation} ${contextClass}" ${attrs}>` +
        `<img class="reader-image" loading="lazy" src="${escapeHtml(target)}" alt="" ${intrinsic} ${attrs}>` +
        `</figure>`
      );
    }
  }

  return parts;
}

function escapeMarkdownCell(value) {
  return cleanText(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, '<br>');
}

function expandRow(row, inventory) {
  const cells = [];
  for (const cell of row || []) {
    const media = markdownMedia(cell.media, inventory, true);
    const text = [escapeMarkdownCell(cell.text), ...media].filter(Boolean).join('<br>');
    cells.push(text);
    for (let i = 1; i < Math.max(1, cell.colspan || 1); i += 1) cells.push('');
  }
  return cells;
}

function renderTableMarkdown(table, inventory) {
  if (!Array.isArray(table) || !table.length) return '';
  const rows = table.map(row => expandRow(row, inventory));
  const width = Math.max(...rows.map(row => row.length), 1);
  const normalized = rows.map(row => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
  const header = normalized[0];
  const body = normalized.slice(1);
  const line = row => `| ${row.join(' | ')} |`;

  return [
    line(header),
    line(Array(width).fill('---')),
    ...body.map(line),
  ].join('\n');
}

function renderTableHtml(table, inventory) {
  if (!Array.isArray(table) || !table.length) return '';

  const rows = table.map(row => {
    const cells = row.map(cell => {
      const tag = cell.tag === 'th' ? 'th' : 'td';
      const attrs = [
        cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '',
      ].join('');
      const text = escapeHtml(cleanText(cell.text)).replace(/\r?\n/g, '<br>');
      const media = htmlMedia(cell.media, inventory, 'table-cell').join('');
      return `<${tag}${attrs}>${text}${media}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="reader-table-wrap"><table><tbody>${rows}</tbody></table></div>`;
}

function classifyBlock(block, level, isMediaShell) {
  if (level) return 'heading';
  if (block.table) return 'table';
  if (isMediaShell) return 'media';
  if (/docx-code-block/.test(block.className)) return 'code';
  return 'text';
}

function renderBlock(block, inventory, turndown) {
  const normalizedText = cleanText(block.text);
  if (normalizedText === '附件不支持打印') {
    return { markdown: '', html: '', type: 'empty' };
  }

  const level = headingLevel(block.className);
  if (level) {
    const value = cleanText(block.text);
    const anchor = `block-${escapeHtml(block.id)}`;
    return {
      markdown: value ? `${'#'.repeat(level)} ${value}` : '',
      html: value
        ? `<h${level} id="${anchor}" data-block-id="${escapeHtml(block.id)}">${escapeHtml(value)}</h${level}>`
        : '',
      type: 'heading',
    };
  }

  if (block.table) {
    return {
      markdown: renderTableMarkdown(block.table, inventory),
      html: renderTableHtml(block.table, inventory),
      type: 'table',
    };
  }

  const blockMedia = markdownMedia(block.media, inventory, false);
  const hasVideo = (block.media || []).some(entry => findMedia(entry.url, inventory)?.kind === 'video');
  const isMediaShell =
    /docx-(file|view)-block/.test(block.className) ||
    (hasVideo && /xgplayer|preview-type-video/.test(block.html));

  if (isMediaShell) {
    return {
      markdown: blockMedia.join('\n\n'),
      html: htmlMedia(block.media, inventory, 'standalone').join('\n'),
      type: 'media',
    };
  }

  if (/docx-code-block/.test(block.className)) {
    let value = cleanText(block.text);
    value = value.replace(/^代码块\s*/i, '').replace(/^Plain Text\s*/i, '');
    return {
      markdown: value ? `\`\`\`text\n${value}\n\`\`\`` : '',
      html: value ? `<pre><code>${escapeHtml(value)}</code></pre>` : '',
      type: 'code',
    };
  }

  const rewritten = rewriteMedia(block.html, inventory).replace(/附件不支持打印/g, '');
  const cleanHtml = sanitizeBlock(rewritten);

  if (!cleanHtml.trim()) {
    if (blockMedia.length) {
      return {
        markdown: blockMedia.join('\n\n'),
        html: htmlMedia(block.media, inventory, 'standalone').join('\n'),
        type: 'media',
      };
    }
    if (normalizedText) {
      return {
        markdown: normalizedText,
        html: `<div class="reader-fallback" data-source-class="${escapeHtml(block.className || '')}">${escapeHtml(normalizedText)}</div>`,
        type: 'fallback',
      };
    }
    return { markdown: '', html: '', type: 'empty' };
  }

  let markdown = turndown.turndown(cleanHtml)
    .replace(/\p{Cf}/gu, '')
    .trim();

  if (blockMedia.length && !markdown.includes('assets/')) {
    markdown = [markdown, ...blockMedia].filter(Boolean).join('\n\n');
  }

  return {
    markdown,
    html: cleanHtml,
    type: classifyBlock(block, level, isMediaShell),
  };
}

function portableCss() {
  return `
:root{color-scheme:light dark;--text-width:760px;--wide-width:1180px}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.75;background:Canvas;color:CanvasText}
.reader-article{padding:44px 24px 96px}
.reader-article-title{max-width:var(--text-width);margin:0 auto 36px;font-size:2.15rem;line-height:1.25}
.reader-block{max-width:var(--text-width);margin:0 auto}
.reader-block--heading{scroll-margin-top:72px}
.reader-block--heading h2{font-size:1.55rem;margin:2.5rem 0 .9rem}
.reader-block--heading h3{font-size:1.3rem;margin:2rem 0 .75rem}
.reader-block--heading h4{font-size:1.12rem;margin:1.5rem 0 .65rem}
.reader-block--table,.reader-block--media{max-width:var(--wide-width)}
.reader-table-wrap{overflow:auto;margin:1.15rem auto;border:1px solid color-mix(in srgb, CanvasText 18%, transparent);border-radius:10px}
table{border-collapse:collapse;min-width:100%;width:max-content;max-width:none}
td,th{border-right:1px solid color-mix(in srgb, CanvasText 14%, transparent);border-bottom:1px solid color-mix(in srgb, CanvasText 14%, transparent);padding:.65rem .8rem;vertical-align:top;min-width:110px}
th{font-weight:650;background:color-mix(in srgb, CanvasText 7%, Canvas)}
.reader-media{margin:1rem auto}
.reader-media--standalone{display:flex;justify-content:center}
.reader-article img{max-width:100%;height:auto}
.reader-video,.reader-image{display:block;max-width:100%;height:auto;border-radius:10px;background:#000}
.reader-media--standalone.reader-media--portrait .reader-video{width:auto;max-width:min(100%,520px);max-height:72vh}
.reader-media--standalone.reader-media--landscape .reader-video{width:min(100%,960px);max-height:72vh}
.reader-media--standalone.reader-media--square .reader-video{width:min(100%,680px);max-height:72vh}
.reader-media--standalone.reader-media--unknown .reader-video{width:min(100%,900px);max-height:72vh}
.reader-media--table-cell .reader-video,.reader-media--table-cell .reader-image{max-width:220px;max-height:280px;object-fit:contain}
pre{overflow:auto;padding:1rem;border-radius:8px;background:color-mix(in srgb, CanvasText 7%, Canvas)}
blockquote{margin-left:0;padding-left:1rem;border-left:3px solid color-mix(in srgb, CanvasText 24%, transparent)}
.reader-block--fallback .reader-fallback{padding:.8rem 1rem;border:1px dashed color-mix(in srgb, CanvasText 24%, transparent);border-radius:8px;background:color-mix(in srgb, CanvasText 5%, Canvas);white-space:pre-wrap}
a{overflow-wrap:anywhere}
@media(max-width:800px){
  .reader-article{padding:28px 16px 72px}
  .reader-article-title{font-size:1.75rem}
  .reader-block--table,.reader-block--media{max-width:100%}
}
`;
}

function renderDocument({ document, inventory }) {
  const turndown = createTurndown();
  const htmlBlocks = [];
  const markdownBlocks = [];

  for (const block of document.blocks) {
    const rendered = renderBlock(block, inventory, turndown);
    if (rendered.markdown) markdownBlocks.push(rendered.markdown);
    if (rendered.html) {
      htmlBlocks.push(
        `<section class="reader-block reader-block--${rendered.type}" data-block-id="${escapeHtml(block.id)}">${rendered.html}</section>`
      );
    }
  }

  const markdown = [
    `# ${document.title}`,
    '',
    ...markdownBlocks,
    '',
  ].join('\n\n').replace(/\n{4,}/g, '\n\n\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(document.title)}</title>
<style>${portableCss()}</style>
</head>
<body>
<article class="reader-article" data-reader-article>
<h1 class="reader-article-title">${escapeHtml(document.title)}</h1>
${htmlBlocks.join('\n')}
</article>
</body>
</html>`;

  return { markdown, html };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  renderDocument,
  rewriteMedia,
  sanitizeBlock,
  orientationFor,
};
