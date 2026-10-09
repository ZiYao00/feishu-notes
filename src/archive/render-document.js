const sanitizeHtml = require('sanitize-html');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const { inferAttachments } = require('../feishu/attachment-inventory');

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

function findMedia(entry, inventory) {
  const identity = entry.identity || null;
  if (identity) {
    const exact=inventory.find(item => item.identity === identity);
    if (exact) return exact;
  }
  const matches=inventory.filter(item => item.url === entry.url);
  return matches.length === 1 ? matches[0] : null;
}

function blockMediaEntries(block, inventory) {
  const entries = [...(block.media || [])];
  const seen = new Set(entries.map(entry => entry.identity || entry.url).filter(Boolean));
  const blockId = String(block.id);

  for (const item of inventory) {
    if (!(item.blockIds || []).map(String).includes(blockId)) continue;
    if (!item.url || seen.has(item.identity || item.url)) continue;
    seen.add(item.identity || item.url);
    entries.push({
      identity: item.identity || null,
      tag: item.kind === 'video' ? 'video' : 'img',
      url: item.url,
      width: item.width ?? null,
      height: item.height ?? null,
      aspectRatio: item.aspectRatio ?? null,
      context: (item.contexts || []).includes('table-cell') ? 'table-cell' : 'standalone',
    });
  }

  return entries;
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
  const targets=new Map();
  for(const item of inventory){
    if(!item.url)continue;
    const destination=item.status==='downloaded'?item.localRelativePath:item.url;
    if(targets.has(item.url)&&targets.get(item.url)!==destination)
      throw Error('MEDIA_URL_AMBIGUOUS: repeated URL points to conflicting image occurrences');
    targets.set(item.url,destination);
  }
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

function normalizeHeading(value) {
  return cleanText(value).replace(/\s*\r?\n\s*/g, ' ').replace(/[\t ]{2,}/g, ' ').trim();
}

function headingLevel(className) {
  const match = String(className).match(/docx-heading([1-6])-block/);
  return match ? Math.min(6, Number(match[1]) + 1) : null;
}

function markdownMedia(mediaEntries, inventory, compact = false) {
  const parts = [];
  const seenSources = new Set();

  for (const entry of mediaEntries || []) {
    const logicalKey=entry.identity || entry.url;
    if (seenSources.has(logicalKey)) continue;
    seenSources.add(logicalKey);

    const item = findMedia(entry, inventory);
    if (!item) continue;
    const target = mediaTarget(item);
    if (item.status !== 'downloaded') {
      const label = item.kind === 'video' ? '视频' : '图片';
      parts.push(compact ? `[${label}未保存]` : `> ${label}暂未离线保存（${item.status || 'pending'}）`);
      continue;
    }

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
    const logicalKey=entry.identity || entry.url;
    if (seenSources.has(logicalKey)) continue;
    seenSources.add(logicalKey);

    const item = findMedia(entry, inventory);
    if (!item) continue;

    const target = mediaTarget(item);
    const orientation = orientationFor(item);
    const attrs = mediaDataAttributes(item, context);
    const contextClass = context === 'table-cell' ? 'reader-media--table-cell' : 'reader-media--standalone';
    if (item.status !== 'downloaded') {
      const label = item.kind === 'video' ? '视频' : '图片';
      parts.push(`<figure class="reader-media reader-media--unavailable ${contextClass}" ${attrs}>` +
        `<div class="reader-embed-fallback"><strong>${label}暂未离线保存</strong>` +
        `<span>状态：${escapeHtml(item.status || 'pending')}。原始出现位置已保留。</span></div></figure>`);
      continue;
    }

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

  const renderRow = (row, forceHeader = false) => {
    const cells = row.map(cell => {
      const tag = forceHeader || cell.tag === 'th' || cell.isHeader ? 'th' : 'td';
      const attrs = [
        cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '',
        cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '',
      ].join('');
      const text = escapeHtml(cleanText(cell.text)).replace(/\r?\n/g, '<br>');
      const media = htmlMedia(cell.media, inventory, 'table-cell').join('');
      return `<${tag}${attrs}>${text}${media}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  };

  const firstRowIsHeader = table[0].length > 0 &&
    table[0].every(cell => cell.tag === 'th' || cell.isHeader);
  const head = firstRowIsHeader
    ? `<thead>${renderRow(table[0], true)}</thead>`
    : '';
  const bodyRows = firstRowIsHeader ? table.slice(1) : table;
  const body = bodyRows.map(row => renderRow(row)).join('');

  return `<div class="reader-table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
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
  const effectiveMedia = blockMediaEntries(block, inventory);
  // Feishu's '附件不支持打印' is a signal of an unsupported attachment,
  // not permission to delete the corresponding source block.
  const level = headingLevel(block.className);
  if (level) {
    const value = normalizeHeading(block.text);
    const anchor = `block-${escapeHtml(block.id)}`;
    const attachedMarkdown = markdownMedia(effectiveMedia, inventory, false);
    const attachedHtml = htmlMedia(effectiveMedia, inventory, 'standalone').join('');
    return {
      markdown: [
        value ? `${'#'.repeat(level)} ${value}` : '',
        ...attachedMarkdown,
      ].filter(Boolean).join('\n\n'),
      html: [
        value
          ? `<h${level} id="${anchor}" data-block-id="${escapeHtml(block.id)}">${escapeHtml(value)}</h${level}>`
          : '',
        attachedHtml ? `<div class="reader-heading-media">${attachedHtml}</div>` : '',
      ].filter(Boolean).join(''),
      type: 'heading',
    };
  }

  if (/docx-(ordered|bullet|unordered)-block/.test(block.className)) {
    const lines = normalizedText
      .split(/\r?\n/)
      .map(line => cleanText(line))
      .filter(Boolean);
    const ordered = /docx-ordered-block/.test(block.className);
    const markerPattern = ordered ? /^\d+[.．、)]$/ : /^[•·●◦▪-]$/;
    const marker = markerPattern.test(lines[0] || '') ? lines.shift() : (ordered ? '1.' : '•');
    const content = lines.join(' ').trim();

    if (content) {
      const listMarkdown = ordered ? `${marker} ${content}` : `- ${content}`;
      const attachedMarkdown = markdownMedia(effectiveMedia, inventory, false);
      const attachedHtml = htmlMedia(effectiveMedia, inventory, 'standalone').join('');
      return {
        markdown: [listMarkdown, ...attachedMarkdown].filter(Boolean).join('\n\n'),
        html:
          `<div class="reader-list-item ${ordered ? 'reader-list-item--ordered' : 'reader-list-item--bullet'}">` +
          `<span class="reader-list-marker">${escapeHtml(marker)}</span>` +
          `<div class="reader-list-content">${escapeHtml(content)}</div>` +
          `</div>` +
          attachedHtml,
        type: 'list',
      };
    }
  }

  if (block.table) {
    return {
      markdown: renderTableMarkdown(block.table, inventory),
      html: renderTableHtml(block.table, inventory),
      type: 'table',
    };
  }

  if (/docx-sheet-block/.test(block.className)) {
    return {
      markdown: '飞书内嵌表格（当前离线归档未提取单元格数据，请查看原文）',
      html:
        '<div class="reader-embed-fallback reader-sheet-fallback" data-embed-kind="sheet">' +
        '<strong>飞书内嵌表格</strong>' +
        '<span>当前离线归档未提取该 Sheet 的单元格数据，可从 Reader 顶部“原文”打开源文档查看。</span>' +
        '</div>',
      type: 'embed',
    };
  }

  const blockMedia = markdownMedia(effectiveMedia, inventory, false);
  const hasVideo = effectiveMedia.some(entry => findMedia(entry, inventory)?.kind === 'video');
  const hasImage = effectiveMedia.some(entry => findMedia(entry, inventory)?.kind === 'image');
  const isMediaShell =
    (/docx-(file|view|image)-block/.test(block.className) && blockMedia.length > 0) ||
    (hasImage && !normalizedText && /<img\b/i.test(block.html || '')) ||
    (hasVideo && /xgplayer|preview-type-video/.test(block.html));

  if (isMediaShell) {
    return {
      markdown: blockMedia.join('\n\n'),
      html: htmlMedia(effectiveMedia, inventory, 'standalone').join('\n'),
      type: 'media',
    };
  }

  if (/docx-(file|view|embed)-block/.test(block.className) || (block.attachments || []).length) {
    const attachments = Array.isArray(block.attachments) ? block.attachments : [];
    const display = attachments.length ? attachments : [{ name: normalizedText, status: 'unresolved' }];
    const details = display.map(item => {
      const label = cleanText(item.name || normalizedText || '飞书附件');
      const url = /^https:\/\//i.test(item.url || '') ? item.url : null;
      return {label, url, sizeText: item.sizeText || null, status: item.status || 'unresolved'};
    });
    const text = details.map(item => `- ${item.label}${item.sizeText ? `（${item.sizeText}）` : ''}${item.url ? `（[查看来源](${item.url})）` : ''}`).join('\n');
    const html = details.map(item => `<li>${escapeHtml(item.label)}${item.sizeText ? ` <small>${escapeHtml(item.sizeText)}</small>` : ''}${item.url ? ` <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看来源</a>` : ''}</li>`).join('');
    return {
      markdown: `> 飞书附件暂未离线保存（需人工确认下载权限）\n\n${text}`,
      html: `<div class="reader-embed-fallback reader-attachment-fallback" data-embed-kind="attachment"><strong>飞书附件未离线保存</strong><span>当前归档未验证附件下载权限，已保留来源记录。</span><ul>${html}</ul></div>`,
      type: 'embed', unresolved: true, attachmentCount: details.length,
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
        html: htmlMedia(effectiveMedia, inventory, 'standalone').join('\n'),
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
.reader-heading-media{margin:.8rem 0 1.25rem}
.reader-block--embed{max-width:var(--text-width);margin:1rem auto}
.reader-embed-fallback{display:flex;flex-direction:column;gap:.3rem;padding:.85rem 1rem;border:1px dashed color-mix(in srgb, CanvasText 24%, transparent);border-radius:8px;background:color-mix(in srgb, CanvasText 5%, Canvas)}
.reader-embed-fallback span{opacity:.72;font-size:.9rem}
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
  const audit = { totalBlocks: document.blocks.length, rendered: 0, emptyVerified: 0, unsupportedVisible: 0, failed: 0, failures: [], blockResults: [], attachmentCandidates: [] };

  for (const sourceBlock of document.blocks) {
    const block = { ...sourceBlock, attachments: inferAttachments(sourceBlock) };
    let rendered;
    try {rendered = renderBlock(block, inventory, turndown)}
    catch(error){
      const label=cleanText(block.text)||'此原文块存在无法确认的媒体对应关系';
      rendered={type:'fallback',failed:true,
        markdown:`> 原文转换待复核（Block ${block.id}）：${label}`,
        html:`<div class="reader-embed-fallback"><strong>原文转换待复核</strong><span>${escapeHtml(label)}</span></div>`,
        error:String(error.message||error).slice(0,150)};
    }
    const hasOutput = Boolean(rendered.markdown || rendered.html);
    const sourceHasContent = Boolean(cleanText(block.text) || (block.media || []).length || (block.attachments || []).length || block.table || /docx-(file|view|sheet|embed|image)-block/.test(block.className));
    const status = rendered.failed ? 'failed' : rendered.unresolved ? 'unsupported_visible' : hasOutput ? 'rendered' : sourceHasContent ? 'failed' : 'empty_verified';
    const record = { blockId: String(block.id), status, type: rendered.type };
    audit.blockResults.push(record);
    if (status === 'rendered') audit.rendered++;
    if (status === 'unsupported_visible') audit.unsupportedVisible++;
    if (status === 'empty_verified') audit.emptyVerified++;
    if (status === 'failed') { audit.failed++; audit.failures.push({ blockId: String(block.id), className: block.className, reason:rendered.error||'missing_content' }); }
    for (const attachment of block.attachments || []) {
      audit.attachmentCandidates.push({ blockId: String(block.id), name: attachment.name || '', url: attachment.url || null, sizeBytes: attachment.sizeBytes ?? null, sizeText: attachment.sizeText || null, status: attachment.status || 'unresolved' });
    }
    if (rendered.markdown) markdownBlocks.push(rendered.markdown);
    if (rendered.html) {
      htmlBlocks.push(
        `<section class="reader-block reader-block--${rendered.type}" data-block-id="${escapeHtml(block.id)}"${block.recordId?` data-record-id="${escapeHtml(block.recordId)}"`:''}>${rendered.html}</section>`
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

  return { markdown, html, audit };
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
