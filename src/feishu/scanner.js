const { chromium } = require('playwright-core');

function cleanInvisible(text = '') {
  return String(text)
    .replace(/\p{Cf}/gu, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function documentIdFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function mediaIdentity(url) {
  if (!url) return '';
  const videoMatch = url.match(/\/video\/([^/?]+)/i);
  if (videoMatch) return `video:${videoMatch[1]}`;
  const coverMatch = url.match(/\/cover\/([^/?]+)/i);
  if (coverMatch) return `image:${coverMatch[1]}`;
  return url;
}

async function backupClipboard(page) {
  return page.evaluate(async () => {
    const state = { mode: 'none', items: null, text: '' };
    try {
      const items = await navigator.clipboard.read();
      const stored = [];
      for (const item of items) {
        const data = {};
        for (const type of item.types) data[type] = await item.getType(type);
        stored.push(data);
      }
      window.__feishuNotesClipboardBackup = stored;
      state.mode = 'items';
      return state;
    } catch {
      try {
        state.text = await navigator.clipboard.readText();
        state.mode = 'text';
      } catch {
        state.mode = 'none';
      }
      window.__feishuNotesClipboardBackupText = state.text;
      return state;
    }
  });
}

async function restoreClipboard(page, backupState) {
  if (!backupState || backupState.mode === 'none') return;
  await page.evaluate(async state => {
    try {
      if (state.mode === 'items' && Array.isArray(window.__feishuNotesClipboardBackup)) {
        const items = window.__feishuNotesClipboardBackup.map(data => new ClipboardItem(data));
        await navigator.clipboard.write(items);
      } else if (state.mode === 'text') {
        await navigator.clipboard.writeText(window.__feishuNotesClipboardBackupText || '');
      }
    } finally {
      delete window.__feishuNotesClipboardBackup;
      delete window.__feishuNotesClipboardBackupText;
    }
  }, backupState).catch(() => {});
}

async function locateVirtualBlock(page, blockId) {
  const selector = `.block[data-block-id="${blockId}"]`;
  if (await page.locator(selector).count()) return true;

  const dimensions = await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    if (!container) return null;
    return {
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
    };
  });
  if (!dimensions) return false;

  const step = Math.max(180, Math.floor(dimensions.clientHeight * 0.3));
  const maxTop = Math.max(0, dimensions.scrollHeight - dimensions.clientHeight);
  for (let pos = 0; pos <= maxTop; pos += step) {
    await page.evaluate(top => {
      const container = document.querySelector('.bear-web-x-container');
      if (!container) return;
      container.scrollTop = top;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, Math.min(pos, maxTop));
    await page.waitForTimeout(90);
    if (await page.locator(selector).count()) return true;
  }
  return false;
}

async function extractEmbeddedSheetTable(page, block) {
  const found = await locateVirtualBlock(page, block.id);
  if (!found) {
    return {
      ok: false,
      error: 'Sheet block was not mounted during extraction.',
    };
  }

  const selector = `.block[data-block-id="${block.id}"]`;
  await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await page.waitForTimeout(700);

  const ready = await page.waitForFunction(id => {
    const blockEl = document.querySelector(`.block[data-block-id="${id}"]`);
    const canvas = blockEl?.querySelector('.spreadsheet-canvas');
    const rect = canvas?.getBoundingClientRect();
    return Boolean(canvas && rect && rect.width > 100 && rect.height > 80);
  }, block.id, { timeout: 5000 }).then(() => true).catch(() => false);

  if (!ready) {
    return {
      ok: false,
      error: 'Embedded Sheet canvas did not become ready.',
    };
  }

  const sheetWrap = page.locator(`${selector} .spreadsheet-wrap`).first();
  const box = await sheetWrap.boundingBox();
  if (!box || box.width < 100 || box.height < 80) {
    return {
      ok: false,
      error: 'Embedded Sheet has no usable rendered bounds.',
    };
  }

  const clipboardBackup = await backupClipboard(page);
  try {
    await sheetWrap.click({
      position: {
        x: Math.max(16, Math.min(180, box.width * 0.16)),
        y: Math.max(16, Math.min(72, box.height * 0.2)),
      },
    });
    await page.waitForTimeout(120);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(80);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(180);

    const clipboard = await page.evaluate(async () => {
      const result = { text: '', html: '', table: null };
      try {
        result.text = await navigator.clipboard.readText();
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!item.types.includes('text/html')) continue;
          const blob = await item.getType('text/html');
          result.html = await blob.text();
          break;
        }
      } catch {
        return result;
      }

      if (!result.html) return result;
      const parsed = new DOMParser().parseFromString(result.html, 'text/html');
      const tableEl = parsed.querySelector('table');
      if (!tableEl) return result;

      result.table = [...tableEl.querySelectorAll('tr')].map((row, rowIndex) => {
        const cells = [...row.children].filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH');
        const formattedHeaderRow = cells.length > 0 && cells.every(cell => {
          const fontWeight = cell.style?.fontWeight || '';
          const numeric = Number(fontWeight);
          return cell.tagName === 'TH' || fontWeight === 'bold' || (Number.isFinite(numeric) && numeric >= 600);
        });
        return cells.map(cell => ({
          tag: cell.tagName.toLowerCase(),
          text: (cell.textContent || '').replace(/\u00a0/g, ' ').trim(),
          isHeader: cell.tagName === 'TH' || (rowIndex === 0 && formattedHeaderRow),
          colspan: Number(cell.getAttribute('colspan') || 1),
          rowspan: Number(cell.getAttribute('rowspan') || 1),
          media: [],
        }));
      }).filter(row => row.length);
      return result;
    });

    if (!Array.isArray(clipboard.table) || !clipboard.table.length) {
      return {
        ok: false,
        error: 'Feishu Sheet copy did not expose a table payload.',
      };
    }

    const columnCount = Math.max(...clipboard.table.map(row =>
      row.reduce((sum, cell) => sum + Math.max(1, cell.colspan || 1), 0)
    ));

    return {
      ok: true,
      table: clipboard.table,
      metadata: {
        blockId: block.id,
        recordId: block.recordId || null,
        extractionMethod: 'feishu-clipboard-html',
        rowCount: clipboard.table.length,
        columnCount,
        copiedTextLength: clipboard.text.length,
      },
    };
  } finally {
    await page.keyboard.press('Escape').catch(() => {});
    await restoreClipboard(page, clipboardBackup);
  }
}

async function scanFeishuDocument({ cdpEndpoint, targetUrl }) {
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No browser context is available.');

  const context = contexts[0];
  const documentId = documentIdFromUrl(targetUrl);
  let page = contexts.flatMap(c => c.pages()).find(p => documentId && p.url().includes(documentId));

  if (!page) page = await context.newPage();

  // Reuse the authenticated profile, but always refresh document state.
  // Feishu virtualizes long documents aggressively; a stale open tab can expose
  // fewer blocks/media than a clean navigation of the same authorized URL.
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2200);

  const gate = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').slice(0, 5000),
  }));

  const normalizedGate = cleanInvisible(gate.text);
  const loginRequired =
    /passport|accounts|login/i.test(gate.url) ||
    /扫码登录|手机号登录|登录飞书|sign in|log in/i.test(normalizedGate);
  const permissionDenied = /没有权限访问|申请访问权限|暂无权限|permission denied|access denied/i.test(normalizedGate);

  if (loginRequired || permissionDenied) {
    return {
      browser,
      context,
      page,
      document: {
        sourceUrl: targetUrl,
        finalUrl: gate.url,
        documentId,
        title: cleanInvisible(gate.title.replace(/\s*-\s*飞书云文档\s*$/i, '')),
        loginRequired,
        permissionDenied,
        blocks: [],
        media: [],
      },
    };
  }

  await page.waitForFunction(() => {
    const el = document.querySelector('.bear-web-x-container');
    return el && el.scrollHeight > el.clientHeight;
  }, null, { timeout: 20000 });

  const initial = await page.evaluate(() => {
    const el = document.querySelector('.bear-web-x-container');
    return { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  });

  const blocks = new Map();
  const media = new Map();
  const embeddedSheets = [];
  const extractedSheetIds = new Set();
  let clipboardPermissionsGranted = false;
  const ensureClipboardPermissions = async () => {
    if (clipboardPermissionsGranted) return;
    const origin = new URL(page.url()).origin;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
    clipboardPermissionsGranted = true;
  };
  const visibleLength = value => String(value || '').replace(/\p{Cf}/gu, '').trim().length;
  const mergeTableSnapshots = (previousTable, nextTable) => {
    if (!previousTable) return nextTable;
    if (!nextTable) return previousTable;

    const rowCount = Math.max(previousTable.length, nextTable.length);
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const previousRow = previousTable[rowIndex] || [];
      const nextRow = nextTable[rowIndex] || [];
      const cellCount = Math.max(previousRow.length, nextRow.length);

      return Array.from({ length: cellCount }, (_, cellIndex) => {
        const previousCell = previousRow[cellIndex];
        const nextCell = nextRow[cellIndex];
        if (!previousCell) return nextCell;
        if (!nextCell) return previousCell;

        const richerText =
          visibleLength(nextCell.text) >= visibleLength(previousCell.text)
            ? nextCell.text
            : previousCell.text;
        const richerMedia =
          (nextCell.media || []).length >= (previousCell.media || []).length
            ? nextCell.media
            : previousCell.media;

        return {
          ...previousCell,
          ...nextCell,
          text: richerText,
          media: richerMedia,
          isHeader: Boolean(previousCell.isHeader || nextCell.isHeader),
          colspan: Math.max(previousCell.colspan || 1, nextCell.colspan || 1),
          rowspan: Math.max(previousCell.rowspan || 1, nextCell.rowspan || 1),
        };
      }).filter(Boolean);
    });
  };
  const step = Math.max(450, Math.floor(initial.clientHeight * 0.72));
  let scans = 0;
  let maxHeightSeen = initial.scrollHeight;
  let pass = 0;
  let stablePasses = 0;

  while (pass < 4 && stablePasses < 1 && scans < 400) {
    const blocksBeforePass = blocks.size;
    let pos = 0;

    while (scans < 400) {
    const state = await page.evaluate(({ pos }) => {
      const container = document.querySelector('.bear-web-x-container');
      if (!container) return null;
      container.scrollTop = pos;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
      return {
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
      };
    }, { pos });

    if (!state) throw new Error('Feishu scroll container disappeared during scan.');
    await page.waitForTimeout(220);

    const pendingVideoPlayers = await page.evaluate(() =>
      [...document.querySelectorAll('.docx-file-block.is-in-video-v2')]
        .filter(block => {
          const video = block.querySelector('video');
          return !video || !(video.currentSrc || video.src || video.getAttribute('src'));
        }).length
    );
    if (pendingVideoPlayers > 0) await page.waitForTimeout(850);

    const snapshot = await page.evaluate(() => {
      const pageBlock = document.querySelector('.docx-page-block.block[data-block-id]');
      if (!pageBlock) return [];

      const candidates = [...document.querySelectorAll('.block[data-block-id]')].filter(el => {
        if (el === pageBlock) return false;
        const parentBlock = el.parentElement?.closest('.block[data-block-id]');
        return parentBlock === pageBlock;
      });

      return candidates.map(el => {
        const clone = el.cloneNode(true);
        const originalMedia = [...el.querySelectorAll('img, video, source, a[href]')];
        const clonedMedia = [...clone.querySelectorAll('img, video, source, a[href]')];

        originalMedia.forEach((node, index) => {
          const copy = clonedMedia[index];
          if (!copy) return;
          if (node.tagName === 'IMG') {
            const src = node.currentSrc || node.src || node.getAttribute('src');
            if (src) copy.setAttribute('src', src);
          } else if (node.tagName === 'VIDEO' || node.tagName === 'SOURCE') {
            const src = node.currentSrc || node.src || node.getAttribute('src');
            if (src) copy.setAttribute('src', src);
          } else if (node.tagName === 'A') {
            if (node.href) copy.setAttribute('href', node.href);
          }
        });

        const mediaFrom = root => [...root.querySelectorAll('img, video, source')]
          .map(node => {
            if (
              node.tagName === 'IMG' &&
              node.closest('.docx-file-block.is-in-video-v2, .preview-type-video, .xgplayer, .box-preview-wrap')
            ) {
              return null;
            }

            const tag = node.tagName.toLowerCase();
            const mediaNode = tag === 'source' ? node.closest('video') || node : node;
            const isVideo = tag === 'video' || tag === 'source';
            const width = Number(
              isVideo
                ? mediaNode.videoWidth || mediaNode.getAttribute?.('width') || 0
                : mediaNode.naturalWidth || mediaNode.getAttribute?.('width') || 0
            ) || null;
            const height = Number(
              isVideo
                ? mediaNode.videoHeight || mediaNode.getAttribute?.('height') || 0
                : mediaNode.naturalHeight || mediaNode.getAttribute?.('height') || 0
            ) || null;

            return {
              tag,
              url: node.currentSrc || node.src || node.getAttribute('src') || '',
              width,
              height,
              aspectRatio: width && height ? width / height : null,
              context: node.closest('td,th') ? 'table-cell' : 'standalone',
            };
          })
          .filter(item => item && item.url && !item.url.startsWith('data:'));

        const media = mediaFrom(el);
        let table = null;

        if (el.classList.contains('docx-table-block')) {
          table = [...el.querySelectorAll('tr')].map(row => {
            const cells = [...row.children]
              .filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH');
            const formattedHeaderRow = cells.length > 0 && cells.every(cell =>
              Boolean(cell.querySelector(
                'b, strong, [style*="font-weight:bold"], [style*="font-weight: bold"], [style*="font-weight:700"], [style*="font-weight: 700"]'
              ))
            );

            return cells.map(cell => {
              const textClone = cell.cloneNode(true);
              textClone.querySelectorAll(
                '.docx-file-block, .docx-view-block, .docx-block-zero-space, .bear-virtual-renderUnit-placeholder'
              ).forEach(node => node.remove());

              return {
                tag: cell.tagName.toLowerCase(),
                text: (textClone.textContent || '').replace(/\s+/g, ' ').trim(),
                isHeader: cell.tagName === 'TH' || formattedHeaderRow,
                colspan: Number(cell.getAttribute('colspan') || 1),
                rowspan: Number(cell.getAttribute('rowspan') || 1),
                media: mediaFrom(cell),
              };
            });
          });
        }

        return {
          id: el.getAttribute('data-block-id'),
          recordId: el.getAttribute('data-record-id') || null,
          className: typeof el.className === 'string' ? el.className : '',
          text: el.innerText || '',
          html: clone.outerHTML,
          media,
          table,
        };
      });
    });

    for (const item of snapshot) {
      if (/docx-sheet-block/.test(item.className || '') && !extractedSheetIds.has(item.id)) {
        await ensureClipboardPermissions();
        let extracted = null;
        try {
          extracted = await extractEmbeddedSheetTable(page, item);
        } catch {
          extracted = null;
        }
        if (extracted?.ok) {
          item.table = extracted.table;
          item.sheetExtraction = extracted.metadata;
          extractedSheetIds.add(item.id);
          embeddedSheets.push({
            ...extracted.metadata,
            status: 'extracted',
          });
        }
      }

      const previous = blocks.get(item.id);
      if (!previous) {
        blocks.set(item.id, item);
      } else {
        blocks.set(item.id, {
          ...previous,
          ...item,
          text: visibleLength(item.text) >= visibleLength(previous.text) ? item.text : previous.text,
          html: item.html.length >= previous.html.length ? item.html : previous.html,
          media: item.media.length >= previous.media.length ? item.media : previous.media,
          table: mergeTableSnapshots(previous.table, item.table),
        });
      }

      let imageOrdinal = 0;
      for (const entry of item.media) {
        if (entry.url.startsWith('data:')) continue;
        const isImage = entry.tag === 'img';
        const identity =
          isImage && entry.url.startsWith('blob:')
            ? `image:block:${item.id}:${imageOrdinal++}`
            : mediaIdentity(entry.url);
        const current = media.get(identity) || {
          identity,
          url: entry.url,
          kind: entry.tag === 'video' || entry.tag === 'source' ? 'video' : 'image',
          blockIds: [],
          contexts: [],
          width: null,
          height: null,
          aspectRatio: null,
        };
        if (!current.blockIds.includes(item.id)) current.blockIds.push(item.id);
        if (entry.context && !current.contexts.includes(entry.context)) current.contexts.push(entry.context);
        if (entry.width && entry.height) {
          const currentPixels = (current.width || 0) * (current.height || 0);
          const nextPixels = entry.width * entry.height;
          if (!current.width || nextPixels >= currentPixels) {
            current.width = entry.width;
            current.height = entry.height;
            current.aspectRatio = entry.aspectRatio;
          }
        }
        current.url = entry.url;
        media.set(identity, current);
      }
    }

    maxHeightSeen = Math.max(maxHeightSeen, state.scrollHeight);
    scans += 1;

    const maxTop = Math.max(0, state.scrollHeight - state.clientHeight);
    if (state.scrollTop >= maxTop - 3 || pos >= maxTop) {
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => {
        const container = document.querySelector('.bear-web-x-container');
        if (!container) return null;
        return {
          scrollTop: container.scrollTop,
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
        };
      });

      if (after) {
        maxHeightSeen = Math.max(maxHeightSeen, after.scrollHeight);
        const afterMaxTop = Math.max(0, after.scrollHeight - after.clientHeight);
        if (after.scrollHeight > state.scrollHeight + 4 && after.scrollTop < afterMaxTop - 3) {
          pos = Math.min(afterMaxTop, after.scrollTop + step);
          continue;
        }
      }
      break;
    }

    pos = Math.min(maxTop, pos + step);
    }

    const addedThisPass = blocks.size - blocksBeforePass;
    stablePasses = addedThisPass === 0 ? stablePasses + 1 : 0;
    pass += 1;

    if (pass < 4 && stablePasses < 1) {
      await page.evaluate(() => {
        const container = document.querySelector('.bear-web-x-container');
        if (container) {
          container.scrollTop = 0;
          container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);
    }
  }

  const sheetBlocks = [...blocks.values()].filter(block =>
    /docx-sheet-block/.test(block.className || '')
  );

  if (sheetBlocks.length) {
    await ensureClipboardPermissions();

    for (const block of sheetBlocks) {
      if (extractedSheetIds.has(block.id)) continue;

      let extracted;
      try {
        extracted = await extractEmbeddedSheetTable(page, block);
      } catch (error) {
        extracted = { ok: false, error: error.message };
      }

      if (extracted.ok) {
        const next = {
          ...block,
          table: extracted.table,
          sheetExtraction: extracted.metadata,
        };
        blocks.set(block.id, next);
        extractedSheetIds.add(block.id);
        embeddedSheets.push({
          ...extracted.metadata,
          status: 'extracted',
        });
      } else {
        embeddedSheets.push({
          blockId: block.id,
          recordId: block.recordId || null,
          extractionMethod: 'feishu-clipboard-html',
          status: 'failed',
          error: extracted.error || 'Unknown Sheet extraction error.',
        });
      }
    }
  }

  await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) {
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });

  const orderedBlocks = [...blocks.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const rawTitle = await page.title();
  const title = cleanInvisible(rawTitle.replace(/\s*-\s*飞书云文档\s*$/i, ''));

  return {
    browser,
    context,
    page,
    document: {
      sourceUrl: targetUrl,
      finalUrl: page.url(),
      documentId,
      title,
      loginRequired: false,
      permissionDenied: false,
      scan: { scans, maxHeightSeen, blockCount: orderedBlocks.length },
      blocks: orderedBlocks,
      media: [...media.values()],
      embeddedSheets,
    },
  };
}

module.exports = {
  cleanInvisible,
  documentIdFromUrl,
  scanFeishuDocument,
};
