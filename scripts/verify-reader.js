const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright-core');
const { detectChrome } = require('../src/browser/browser-manager');
const { renderDocument } = require('../src/archive/render-document');
const { startViewer } = require('../src/viewer/server');

async function main() {
  const root = path.resolve(__dirname, '..');
  const libraryRoot = path.join(root, 'data', 'tmp', 'reader-fixture-library');
  const folder = 'reader-layout-fixture';
  const archiveDir = path.join(libraryRoot, folder);

  fs.rmSync(libraryRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(archiveDir, 'assets', 'images'), { recursive: true });

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z9sAAAAASUVORK5CYII=',
    'base64'
  );
  fs.writeFileSync(path.join(archiveDir, 'assets', 'images', 'sample.png'), tinyPng);

  const inventory = [
    {
      id: 'portrait-a',
      url: 'fixture:portrait-a',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/portrait-a.mp4',
      width: 720,
      height: 1280,
      aspectRatio: 720 / 1280,
      contexts: ['standalone'],
      actualSize: 1,
    },
    {
      id: 'portrait-b',
      url: 'fixture:portrait-b',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/portrait-b.mp4',
      width: 720,
      height: 1280,
      aspectRatio: 720 / 1280,
      contexts: ['standalone'],
      actualSize: 1,
    },
    {
      id: 'landscape',
      url: 'fixture:landscape',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/landscape.mp4',
      width: 1920,
      height: 1080,
      aspectRatio: 1920 / 1080,
      contexts: ['standalone'],
      actualSize: 1,
    },
    {
      id: 'square',
      url: 'fixture:square',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/square.mp4',
      width: 1080,
      height: 1080,
      aspectRatio: 1,
      contexts: ['standalone'],
      actualSize: 1,
    },
    {
      id: 'four-three',
      url: 'fixture:four-three',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/four-three.mp4',
      width: 1440,
      height: 1080,
      aspectRatio: 4 / 3,
      contexts: ['standalone'],
      actualSize: 1,
    },
    {
      id: 'standalone-image',
      url: 'fixture:image',
      kind: 'image',
      status: 'downloaded',
      localRelativePath: 'assets/images/sample.png',
      width: 2400,
      height: 1600,
      aspectRatio: 1.5,
      contexts: ['standalone'],
      actualSize: tinyPng.length,
    },
    {
      id: 'table-portrait',
      url: 'fixture:table-portrait',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/table-portrait.mp4',
      width: 720,
      height: 1280,
      aspectRatio: 720 / 1280,
      contexts: ['table-cell'],
      actualSize: 1,
    },
    {
      id: 'table-landscape',
      url: 'fixture:table-landscape',
      kind: 'video',
      status: 'downloaded',
      localRelativePath: 'assets/videos/table-landscape.mp4',
      width: 1920,
      height: 1080,
      aspectRatio: 1920 / 1080,
      contexts: ['table-cell'],
      actualSize: 1,
    },
    {
      id: 'table-image',
      url: 'fixture:table-image',
      kind: 'image',
      status: 'downloaded',
      localRelativePath: 'assets/images/sample.png',
      width: 1200,
      height: 1800,
      aspectRatio: 2 / 3,
      contexts: ['table-cell'],
      actualSize: tinyPng.length,
    },
  ];

  const document = {
    documentId: 'fixture',
    title: 'Reader Layout Fixture',
    sourceUrl: '',
    blocks: [
      { id: '101', className: 'docx-heading1-block', text: '重复标题', html: '', media: [], table: null },
      { id: '102', className: 'docx-heading1-block', text: '重复标题', html: '', media: [], table: null },
      {
        id: '150',
        className: 'docx-text-block',
        text: '正文基准线',
        html: '<div class="docx-text-block">正文基准线</div>',
        media: [],
        table: null,
      },
      {
        id: '201',
        className: 'docx-file-block',
        text: '',
        html: '',
        media: [{ url: 'fixture:portrait-a' }, { url: 'fixture:portrait-b' }],
        table: null,
      },
      { id: '202', className: 'docx-file-block', text: '', html: '', media: [{ url: 'fixture:landscape' }], table: null },
      { id: '203', className: 'docx-file-block', text: '', html: '', media: [{ url: 'fixture:square' }], table: null },
      { id: '204', className: 'docx-file-block', text: '', html: '', media: [{ url: 'fixture:four-three' }], table: null },
      { id: '205', className: 'docx-file-block', text: '', html: '', media: [{ url: 'fixture:image' }], table: null },
      { id: '206', className: 'docx-future-unknown-block', text: '未来 Block 降级文本', html: '', media: [], table: null },
      {
        id: '301',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '竖屏', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-portrait' }] },
            { tag: 'td', text: '横屏', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-landscape' }] },
            { tag: 'td', text: '图片', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-image' }] },
          ],
        ],
      },
    ],
  };

  const rendered = renderDocument({ document, inventory });
  fs.writeFileSync(path.join(archiveDir, 'article.html'), rendered.html, 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'fixture.md'), rendered.markdown, 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'archive.json'), JSON.stringify({
    version: 2,
    documentId: document.documentId,
    title: document.title,
    sourceUrl: '',
    savedAt: new Date().toISOString(),
    status: 'complete',
    markdownFile: 'fixture.md',
    htmlFile: 'article.html',
    storage: {
      logicalMediaCount: inventory.length,
      physicalAssetCount: inventory.length,
      logicalBytes: inventory.reduce((sum, item) => sum + item.actualSize, 0),
      physicalBytes: inventory.reduce((sum, item) => sum + item.actualSize, 0),
      deduplicatedBytes: 0,
    },
    media: inventory.map(item => ({
      id: item.id,
      kind: item.kind,
      localRelativePath: item.localRelativePath,
      actualSize: item.actualSize,
      status: item.status,
      contexts: item.contexts,
      width: item.width,
      height: item.height,
      aspectRatio: item.aspectRatio,
    })),
  }, null, 2), 'utf8');

  const { server, port } = await startViewer({ libraryRoot, host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: true, executablePath: detectChrome('auto') });

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const url = `http://127.0.0.1:${port}/note/${encodeURIComponent(folder)}/`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.strictEqual(response.status(), 200);
    await page.waitForTimeout(150);

    const desktop1920 = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          left: Math.round(box.left),
          right: Math.round(box.right),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      };
      const mediaGrid = document.querySelector('.reader-block--media.is-media-grid');
      const tableTriggers = [...document.querySelectorAll('.table-media-trigger')];
      const paper = getComputedStyle(document.querySelector('.reader-paper'));
      const h2 = getComputedStyle(document.querySelector('.reader-content h2'));
      return {
        toc: rect('.reader-toc'),
        splitter: rect('[data-reader-splitter]'),
        main: rect('.reader-main'),
        title: rect('.reader-article-title'),
        text: rect('.reader-block--text'),
        table: rect('.reader-block--table'),
        tocHrefs: [...document.querySelectorAll('.reader-toc-list a')].map(link => link.getAttribute('href')),
        tocLinks: document.querySelectorAll('.reader-toc-list a').length,
        headings: document.querySelectorAll('.reader-content h2[id],.reader-content h3[id],.reader-content h4[id]').length,
        mediaGrid: mediaGrid ? {
          count: mediaGrid.querySelectorAll(':scope > .reader-media--standalone').length,
          columns: getComputedStyle(mediaGrid).gridTemplateColumns,
          height: Math.round(mediaGrid.getBoundingClientRect().height),
        } : null,
        tableTriggerCount: tableTriggers.length,
        maxTableTriggerHeight: Math.max(0, ...tableTriggers.map(item => Math.round(item.getBoundingClientRect().height))),
        tableVideos: document.querySelectorAll('table video').length,
        fallbackBlocks: document.querySelectorAll('.reader-block--fallback .reader-fallback').length,
        zoomableImages: document.querySelectorAll('.reader-content img[data-reader-zoomable]').length,
        paper: {
          backgroundColor: paper.backgroundColor,
          borderTopWidth: paper.borderTopWidth,
          boxShadow: paper.boxShadow,
        },
        headingEnhancement: {
          borderLeftWidth: h2.borderLeftWidth,
          backgroundImage: h2.backgroundImage,
        },
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });

    assert.ok(desktop1920.toc.left <= 20);
    assert.ok(desktop1920.toc.width >= 200 && desktop1920.toc.width <= 216);
    assert.strictEqual(desktop1920.splitter.width, 12);
    assert.ok(desktop1920.main.width > 1200);
    assert.ok(desktop1920.text.width > 1000);
    assert.ok(Math.abs(desktop1920.title.left - desktop1920.text.left) <= 1);
    assert.ok(Math.abs(desktop1920.text.left - desktop1920.table.left) <= 1);
    assert.ok(Math.abs(desktop1920.text.width - desktop1920.table.width) <= 1);
    assert.deepStrictEqual(desktop1920.tocHrefs.slice(0, 2), ['#block-101', '#block-102']);
    assert.strictEqual(desktop1920.tocLinks, desktop1920.headings);
    assert.strictEqual(desktop1920.mediaGrid.count, 2);
    assert.ok(desktop1920.mediaGrid.columns.split(' ').length >= 2);
    assert.strictEqual(desktop1920.tableTriggerCount, 3);
    assert.ok(desktop1920.maxTableTriggerHeight <= 130);
    assert.strictEqual(desktop1920.tableVideos, 0);
    assert.strictEqual(desktop1920.fallbackBlocks, 1);
    assert.ok(desktop1920.zoomableImages >= 1);
    assert.ok(desktop1920.paper.backgroundColor.includes('0, 0, 0, 0'));
    assert.strictEqual(desktop1920.paper.borderTopWidth, '0px');
    assert.strictEqual(desktop1920.paper.boxShadow, 'none');
    assert.strictEqual(desktop1920.headingEnhancement.borderLeftWidth, '4px');
    assert.notStrictEqual(desktop1920.headingEnhancement.backgroundImage, 'none');
    assert.strictEqual(desktop1920.pageOverflow, false);

    const splitterBox = await page.locator('[data-reader-splitter]').boundingBox();
    await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 140);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x + splitterBox.width / 2 + 220, splitterBox.y + 140, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const resized = await page.evaluate(() => ({
      tocWidth: Math.round(document.querySelector('.reader-toc').getBoundingClientRect().width),
      mainWidth: Math.round(document.querySelector('.reader-main').getBoundingClientRect().width),
      textWidth: Math.round(document.querySelector('.reader-block--text').getBoundingClientRect().width),
      storedWidth: Number(localStorage.getItem('feishu-notes-toc-width')),
      ariaNow: Number(document.querySelector('[data-reader-splitter]').getAttribute('aria-valuenow')),
    }));
    assert.ok(resized.tocWidth >= desktop1920.toc.width + 180);
    assert.ok(resized.mainWidth < desktop1920.main.width - 170);
    assert.ok(resized.textWidth < desktop1920.text.width - 170);
    assert.ok(Math.abs(resized.storedWidth - resized.tocWidth) <= 1);
    assert.ok(Math.abs(resized.ariaNow - resized.tocWidth) <= 1);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(100);
    const persisted = await page.evaluate(() => Math.round(document.querySelector('.reader-toc').getBoundingClientRect().width));
    assert.ok(Math.abs(persisted - resized.tocWidth) <= 1);

    await page.dblclick('[data-reader-splitter]');
    await page.waitForTimeout(50);
    const resetWidth = await page.evaluate(() => Math.round(document.querySelector('.reader-toc').getBoundingClientRect().width));
    assert.ok(Math.abs(resetWidth - 208) <= 1);

    await page.focus('[data-reader-splitter]');
    await page.keyboard.press('ArrowRight');
    const keyboardWidth = await page.evaluate(() => Math.round(document.querySelector('.reader-toc').getBoundingClientRect().width));
    assert.ok(keyboardWidth > resetWidth);
    await page.keyboard.press('Home');

    const mainLeftBeforeCollapse = await page.evaluate(() => Math.round(document.querySelector('.reader-main').getBoundingClientRect().left));
    await page.click('[data-toc-collapse]');
    await page.waitForTimeout(80);
    const collapsed = await page.evaluate(() => ({
      bodyCollapsed: document.body.classList.contains('toc-collapsed'),
      mainLeft: Math.round(document.querySelector('.reader-main').getBoundingClientRect().left),
    }));
    assert.strictEqual(collapsed.bodyCollapsed, true);
    assert.ok(collapsed.mainLeft < mainLeftBeforeCollapse);
    await page.click('[data-toc-collapse]');

    const standaloneImage = page.locator('.reader-content img[data-reader-zoomable]').first();
    await standaloneImage.click();
    const imageDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-media-dialog]');
      const image = dialog.querySelector('img');
      const style = getComputedStyle(dialog);
      return {
        open: dialog.open,
        imageVisible: !image.hidden,
        videoVisible: !dialog.querySelector('video').hidden,
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
      };
    });
    assert.strictEqual(imageDialog.open, true);
    assert.strictEqual(imageDialog.imageVisible, true);
    assert.strictEqual(imageDialog.videoVisible, false);
    assert.ok(imageDialog.background.includes('0, 0, 0'));
    assert.strictEqual(imageDialog.borderTopWidth, '0px');
    assert.strictEqual(imageDialog.borderRadius, '0px');
    await page.click('[data-dialog-close]');

    const viewports = [
      { width: 1440, height: 900, mobileToc: false },
      { width: 1366, height: 768, mobileToc: false },
      { width: 390, height: 844, mobileToc: true },
    ];

    const responsive = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const result = await page.evaluate(() => ({
        width: innerWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        tocToggleVisible: getComputedStyle(document.querySelector('.reader-toc-toggle')).display !== 'none',
        tableScrollable: [...document.querySelectorAll('.reader-table-wrap')].every(table => table.scrollWidth >= table.clientWidth),
      }));
      assert.strictEqual(result.pageOverflow, false);
      assert.strictEqual(result.tocToggleVisible, viewport.mobileToc);
      assert.strictEqual(result.tableScrollable, true);
      responsive.push(result);
    }

    console.log(JSON.stringify({ ok: true, desktop1920, collapsed, imageDialog, responsive }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(libraryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
