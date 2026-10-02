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
            return {
              tag: node.tagName.toLowerCase(),
              url: node.currentSrc || node.src || node.getAttribute('src') || '',
            };
          })
          .filter(item => item && item.url && !item.url.startsWith('data:'));

        const media = mediaFrom(el);
        let table = null;

        if (el.classList.contains('docx-table-block')) {
          table = [...el.querySelectorAll('tr')].map(row =>
            [...row.children]
              .filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH')
              .map(cell => {
                const textClone = cell.cloneNode(true);
                textClone.querySelectorAll(
                  '.docx-file-block, .docx-view-block, .docx-block-zero-space, .bear-virtual-renderUnit-placeholder'
                ).forEach(node => node.remove());

                return {
                  text: (textClone.textContent || '').replace(/\\s+/g, ' ').trim(),
                  colspan: Number(cell.getAttribute('colspan') || 1),
                  rowspan: Number(cell.getAttribute('rowspan') || 1),
                  media: mediaFrom(cell),
                };
              })
          );
        }

        return {
          id: el.getAttribute('data-block-id'),
          className: typeof el.className === 'string' ? el.className : '',
          text: el.innerText || '',
          html: clone.outerHTML,
          media,
          table,
        };
      });
    });

    for (const item of snapshot) {
      const previous = blocks.get(item.id);
      if (!previous || item.html.length > previous.html.length || item.media.length > previous.media.length) {
        blocks.set(item.id, item);
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
        };
        if (!current.blockIds.includes(item.id)) current.blockIds.push(item.id);
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
    },
  };
}

module.exports = {
  cleanInvisible,
  documentIdFromUrl,
  scanFeishuDocument,
};
