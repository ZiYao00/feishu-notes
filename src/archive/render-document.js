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

function rewriteMedia(html, inventory) {
  let output = html;
  for (const item of inventory) {
    const target = mediaTarget(item);
    output = replaceAllLiteral(output, item.url, target);
    output = replaceAllLiteral(output, item.url.replace(/&/g, '&amp;'), target.replace(/&/g, '&amp;'));
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
      '*': ['class', 'data-block-id', 'colspan', 'rowspan'],
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      video: ['src', 'controls', 'poster', 'preload', 'width', 'height'],
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
    transformTags: {
      video: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, controls: 'controls', preload: 'metadata' },
      }),
    },
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
  const seen = new Set();

  for (const entry of mediaEntries || []) {
    const item = findMedia(entry.url, inventory);
    if (!item) continue;
    const target = mediaTarget(item);
    if (seen.has(target)) continue;
    seen.add(target);

    if (item.kind === 'video') {
      parts.push(compact ? `[视频](${target})` : `<video controls src="${target}"></video>`);
    } else {
      parts.push(`![](${target})`);
    }
  }

  return parts;
}

function htmlMedia(mediaEntries, inventory) {
  const parts = [];
  const seen = new Set();

  for (const entry of mediaEntries || []) {
    const item = findMedia(entry.url, inventory);
    if (!item) continue;
    const target = mediaTarget(item);
    if (seen.has(target)) continue;
    seen.add(target);

    if (item.kind === 'video') {
      parts.push(`<video controls preload="metadata" src="${escapeHtml(target)}"></video>`);
    } else {
      parts.push(`<img loading="lazy" src="${escapeHtml(target)}" alt="">`);
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
  const rows = table.map((row, rowIndex) => {
    const cells = row.map(cell => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      const attrs = [
        cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '',
      ].join('');
      const text = escapeHtml(cleanText(cell.text)).replace(/\r?\n/g, '<br>');
      const media = htmlMedia(cell.media, inventory).join('');
      return `<${tag}${attrs}>${text}${media}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

function renderBlock(block, inventory, turndown) {
  const normalizedText = cleanText(block.text);
  if (normalizedText === '附件不支持打印') {
    return { markdown: '', html: '' };
  }

  const level = headingLevel(block.className);
  if (level) {
    const value = cleanText(block.text);
    return {
      markdown: value ? `${'#'.repeat(level)} ${value}` : '',
      html: value ? `<h${level}>${escapeHtml(value)}</h${level}>` : '',
    };
  }

  if (block.table) {
    return {
      markdown: renderTableMarkdown(block.table, inventory),
      html: renderTableHtml(block.table, inventory),
    };
  }

  const blockMedia = markdownMedia(block.media, inventory, false);
  const hasVideo = (block.media || []).some(entry => findMedia(entry.url, inventory)?.kind === 'video');
  const isMediaShell = /docx-(file|view)-block/.test(block.className) || (hasVideo && /xgplayer|preview-type-video/.test(block.html));

  if (isMediaShell) {
    return {
      markdown: blockMedia.join('\n\n'),
      html: htmlMedia(block.media, inventory).join('\n'),
    };
  }

  if (/docx-code-block/.test(block.className)) {
    let value = cleanText(block.text);
    value = value.replace(/^代码块\s*/i, '').replace(/^Plain Text\s*/i, '');
    return {
      markdown: value ? `\`\`\`text\n${value}\n\`\`\`` : '',
      html: value ? `<pre><code>${escapeHtml(value)}</code></pre>` : '',
    };
  }

  const rewritten = rewriteMedia(block.html, inventory).replace(/附件不支持打印/g, '');
  const cleanHtml = sanitizeBlock(rewritten);
  if (!cleanHtml.trim()) return { markdown: '', html: '' };

  let markdown = turndown.turndown(cleanHtml)
    .replace(/\p{Cf}/gu, '')
    .trim();

  if (blockMedia.length && !markdown.includes('assets/')) {
    markdown = [markdown, ...blockMedia].filter(Boolean).join('\n\n');
  }

  return { markdown, html: cleanHtml };
}

function renderDocument({ document, inventory }) {
  const turndown = createTurndown();
  const htmlBlocks = [];
  const markdownBlocks = [];

  for (const block of document.blocks) {
    const rendered = renderBlock(block, inventory, turndown);
    if (rendered.markdown) markdownBlocks.push(rendered.markdown);
    if (rendered.html) htmlBlocks.push(rendered.html);
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
<style>
:root{color-scheme:light dark}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.75;max-width:980px;margin:0 auto;padding:42px 28px 80px}
h1{font-size:2rem;line-height:1.25;margin:0 0 2rem}h2{font-size:1.55rem;margin:2.2rem 0 .8rem}h3{font-size:1.3rem;margin:1.8rem 0 .7rem}h4{font-size:1.12rem;margin:1.4rem 0 .6rem}
.docx-text-block{margin:.45rem 0}table{border-collapse:collapse;width:100%;display:block;overflow:auto;margin:1rem 0}td,th{border:1px solid #8886;padding:.55rem .7rem;vertical-align:top;min-width:110px}img,video{max-width:100%;height:auto;border-radius:8px}video{display:block;margin:.8rem 0;background:#000}a{overflow-wrap:anywhere}pre{overflow:auto;padding:1rem;border-radius:8px;background:#8881}
</style>
</head>
<body>
<h1>${escapeHtml(document.title)}</h1>
${htmlBlocks.join('\n')}
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
};
