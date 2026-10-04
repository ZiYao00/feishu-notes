const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright-core');
const { detectChrome } = require('../src/browser/browser-manager');
const { renderDocument } = require('../src/archive/render-document');
const { startViewer } = require('../src/viewer/server');

async function main() {
  const root = path.resolve(__dirname, '..');
  const keepFixture = process.env.FEISHU_NOTES_VERIFY_KEEP_FIXTURE === '1';
  const libraryRoot = path.join(
    root,
    'data',
    'tmp',
    keepFixture ? `reader-fixture-library-${process.pid}` : 'reader-fixture-library'
  );
  const folder = 'reader-layout-fixture';
  const archiveDir = path.join(libraryRoot, folder);
  const denseFolder = 'reader-dense-fixture';
  const denseArchiveDir = path.join(libraryRoot, denseFolder);

  if (!keepFixture) fs.rmSync(libraryRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(archiveDir, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(path.join(denseArchiveDir, 'assets', 'images'), { recursive: true });

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z9sAAAAASUVORK5CYII=',
    'base64'
  );
  fs.writeFileSync(path.join(archiveDir, 'assets', 'images', 'sample.png'), tinyPng);
  fs.writeFileSync(path.join(denseArchiveDir, 'assets', 'images', 'sample.png'), tinyPng);

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
      { id: '207', className: 'docx-ordered-block', text: '1.\n编号正文同行', html: '', media: [], table: null },
      {
        id: '208',
        className: 'docx-code-block',
        text: [
          '- 转化五步链',
          '  - ① 制造问题',
          '    - 反常识断言',
          '    - 场景锚定',
          '  - ② 命名敌人',
          '    - 让抽象问题可传播',
          '  - ③ 给出后果',
          '    - 身体与体面代价',
          '  - ④ 数字收口',
          '    - 数据与检测建立确定性',
          '  - ⑤ 行动与机制',
          '    - 零门槛动作 + 机制收口',
        ].join('\n'),
        html: '',
        media: [],
        table: null,
      },
      {
        id: '209',
        className: 'docx-code-block',
        text: [
          '- 爆量效率分层',
          '  - 高爆量层 · 必做',
          '    - F1 手部操作+口播：约55% → 单位产能最高',
          '    - F5 菌种拟人自白：5% → 命中率高',
          '    - S2 反常识脚本：18% → 全部进入爆量池',
          '  - 中量级层 · 择优做',
          '    - F2 无口播字幕：20% → 成本低',
          '    - F3 双人冲突：8% → 大促效率高',
          '  - 低效层 · 避坑',
          '    - F8 纯图文字：3% → 不适合转化',
          '    - 品宣向：<2% → 与转化逻辑背离',
        ].join('\n'),
        html: '',
        media: [],
        table: null,
      },
      {
        id: '301',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '媒体类型', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '画幅', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '参考素材', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '竖屏', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-portrait' }] },
            { tag: 'td', text: '横屏', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-landscape' }] },
            { tag: 'td', text: '图片', colspan: 1, rowspan: 1, media: [{ url: 'fixture:table-image' }] },
          ],
        ],
      },
      {
        id: '302',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '段落', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '时间', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '文案模板', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '画面镜头', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '字幕规则', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '配音', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: 'BGM', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '开篇', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '0–3s', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '这是一个需要自动换行的长文案模板，用来验证宽表不会依赖横向滚动条。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '特写镜头配合手部动作，同时保留足够空间给主体和文字信息。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '关键词放大并保持两行以内', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '急促', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '低频', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '实证', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '14–22s', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '数字与检测报告同时出现，文本较长但必须在当前可用宽度内正常换行。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '推进镜头靠近产品标签，再切到检测报告局部。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '数字单独强调', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '稳定', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '明快', colspan: 1, rowspan: 1, media: [] },
          ],
        ],
      },
      {
        id: '303',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '指标', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '结果', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '状态', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '点击率', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '12.4%', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '高', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '转化率', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '4.8%', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '中', colspan: 1, rowspan: 1, media: [] },
          ],
        ],
      },
      {
        id: '304',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '渠道', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '曝光', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '点击', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '转化', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '备注', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '直播间', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '12000', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '620', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '84', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '主力', colspan: 1, rowspan: 1, media: [] },
          ],
        ],
      },
    ],
  };

  const rendered = renderDocument({ document, inventory });
  fs.writeFileSync(path.join(archiveDir, 'article.html'), rendered.html, 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'fixture.md'), rendered.markdown, 'utf8');
  const fixtureSavedAt = new Date().toISOString();
  fs.writeFileSync(path.join(archiveDir, 'archive.json'), JSON.stringify({
    version: 2,
    documentId: document.documentId,
    title: document.title,
    sourceUrl: '',
    savedAt: fixtureSavedAt,
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

  const denseInventory = inventory.filter(item => item.url === 'fixture:image');
  const densePrompt = [
    'subject_definitions:',
    '<Subject 1> is the same reference character and must remain visually consistent.',
    'integrated_multimodal_description:',
    ...Array.from({ length: 26 }, (_, index) =>
      `[Shot ${index + 1}] Preserve identity, scene continuity, lighting direction, camera axis, spatial causality and natural body mechanics. The subject performs a controlled action with precise timing while the camera follows smoothly and all reference details remain stable.`
    ),
    'overall_soundscape: restrained environmental detail with synchronized physical sounds.',
    'non_diegetic_music: subtle cinematic pulse, never overpowering dialogue.',
  ].join('\n');
  const denseHeadingTitles = [
    '模型测试',
    '分镜提示词Skill：https://github.com/eternityspring/shuohao-skills',
    'FastH3 V2 + HypeFlow Lora 8步 + 加速插件',
    '视频案例',
    'QuantFunc INT8 与 BF16 速度质量对比',
    '官方基础 H3 400-500秒',
    '产品广告',
    'Seedance 2.5 优秀提示词转 MinimaxH3',
    'Refface 远景人脸修复测试',
    '工作流结论',
    'Block Sparse Attention 与 DMD2 蒸馏',
    'SAM3 人物替换实验',
    '模型安装',
    'ComfyUI 节点兼容性',
    '显存与速度',
    '提示词案例',
    '参考图一致性',
    '最终建议',
  ];
  const denseBlocks = [];
  denseHeadingTitles.forEach((title, index) => {
    denseBlocks.push({
      id: `d-h-${index + 1}`,
      className: 'docx-heading1-block',
      text: title,
      html: '',
      media: index === 6 ? [{ url: 'fixture:image' }] : [],
      table: null,
    });
    denseBlocks.push({
      id: `d-t-${index + 1}`,
      className: 'docx-text-block',
      text: `这是第 ${index + 1} 条高密度技术笔记，用于验证知识点标题不会全部按大章节排版。`,
      html: `<div class="docx-text-block">这是第 ${index + 1} 条高密度技术笔记，用于验证知识点标题不会全部按大章节排版。</div>`,
      media: [],
      table: null,
    });
  });
  [
    'FastH3 V2 速度观察 58-88秒',
    'QuantFunc INT8 与 BF16 取舍',
    'HyperFlow LoRA 兼容性记录',
    'Refface 远景人脸修复记录',
  ].forEach((title, index) => {
    denseBlocks.push({
      id: `d-commentary-${index + 1}`,
      className: 'docx-heading1-block',
      text: title,
      html: '',
      media: [],
      table: null,
    });
  });
  denseBlocks.push({
    id: 'd-image',
    className: 'docx-image-block',
    text: '',
    html: '<div class="docx-image-block"><img src="fixture:image" width="2400" height="1600"></div>',
    media: [{ url: 'fixture:image' }],
    table: null,
  });
  denseBlocks.push({
    id: 'd-sheet',
    className: 'docx-sheet-block',
    text: '',
    html: '<div class="docx-sheet-block"><div class="sheet-block-container"><div class="spreadsheet"></div></div></div>',
    media: [],
    table: null,
  });
  for (let index = 0; index < 5; index += 1) {
    denseBlocks.push({
      id: `d-code-${index + 1}`,
      className: 'docx-code-block',
      text: densePrompt + `\nPrompt variant ${index + 1}`,
      html: '',
      media: [],
      table: null,
    });
  }

  const denseDocument = {
    documentId: 'dense-fixture',
    title: 'Dense Note Prompt Library Fixture',
    sourceUrl: '',
    blocks: denseBlocks,
  };
  const denseRendered = renderDocument({ document: denseDocument, inventory: denseInventory });
  fs.writeFileSync(path.join(denseArchiveDir, 'article.html'), denseRendered.html, 'utf8');
  fs.writeFileSync(path.join(denseArchiveDir, 'fixture.md'), denseRendered.markdown, 'utf8');
  fs.writeFileSync(path.join(denseArchiveDir, 'archive.json'), JSON.stringify({
    version: 2,
    documentId: denseDocument.documentId,
    title: denseDocument.title,
    sourceUrl: '',
    savedAt: fixtureSavedAt,
    status: 'complete',
    markdownFile: 'fixture.md',
    htmlFile: 'article.html',
    storage: {
      logicalMediaCount: denseInventory.length,
      physicalAssetCount: denseInventory.length,
      logicalBytes: denseInventory.reduce((sum, item) => sum + item.actualSize, 0),
      physicalBytes: denseInventory.reduce((sum, item) => sum + item.actualSize, 0),
      deduplicatedBytes: 0,
    },
    media: denseInventory.map(item => ({
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

  const explainRoot = path.join(archiveDir, 'explain');
  fs.mkdirSync(path.join(explainRoot, 'lessons'), { recursive: true });
  fs.mkdirSync(path.join(explainRoot, 'evidence', 'asr'), { recursive: true });
  fs.mkdirSync(path.join(explainRoot, 'evidence', 'frames'), { recursive: true });
  fs.writeFileSync(path.join(explainRoot, 'manifest.json'), JSON.stringify({
    version: 1,
    status: 'draft',
    title: 'Reader Fixture · 讲解专题',
    description: 'Explain fixture',
    source: {
      documentId: document.documentId,
      savedAt: fixtureSavedAt,
    },
    evidence: {
      casesFile: 'evidence/cases.json',
      asrDir: 'evidence/asr',
      framesDir: 'evidence/frames',
    },
    lessons: [
      {
        id: '00-overview',
        title: '先看懂系统',
        summary: '验证 Explain Landing 与 Lesson Reader。',
        file: 'lessons/00-overview.html',
        status: 'ready',
        caseCount: 1,
      },
    ],
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(explainRoot, 'evidence', 'cases.json'), JSON.stringify({
    version: 1,
    identity: 'contentHash',
    cases: [{ id: 'case-001', contentHash: 'fixture' }],
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(explainRoot, 'lessons', '00-overview.html'), `
    <article class="reader-article" data-reader-article>
      <h1 class="reader-article-title">先看懂系统</h1>
      <section class="reader-block reader-block--heading"><h2 id="lesson-system">系统</h2></section>
      <div class="reader-block reader-block--text"><p>原始报告 → 视频证据 → 方法论。</p></div>
      <div class="explain-callout" data-kind="insight"><div class="explain-callout-title">核心理解</div><p>Explain 不覆盖原始归档。</p></div>
      <script>window.__unsafe_lesson_script__ = true;</script>
    </article>
  `, 'utf8');

  const chaptersRoot = path.join(explainRoot, 'chapters');
  fs.mkdirSync(chaptersRoot, { recursive: true });
  fs.writeFileSync(path.join(chaptersRoot, 'manifest.json'), JSON.stringify({
    version: 1,
    title: 'Reader Fixture · 学习版',
    chapters: [
      {
        id: '00-start',
        number: '00',
        label: '导读',
        title: '从这里开始',
        file: '00-start.md',
        status: 'ready',
      },
      {
        id: '01-system',
        number: '01',
        label: '爆单系统',
        title: '系统怎么工作',
        file: '01-system.md',
        status: 'ready',
      },
      {
        id: '02-planned',
        number: '02',
        label: '后续章节',
        title: '后续章节',
        file: '02-planned.md',
        status: 'planned',
      },
    ],
  }, null, 2), 'utf8');

  const markdownFence = String.fromCharCode(96).repeat(3);
  fs.writeFileSync(path.join(chaptersRoot, '00-start.md'), [
    '# 00｜从这里开始',
    '',
    '先看懂整个系统。',
    '',
    '## 为什么不是一条爆款',
    '',
    '> 重点是持续找到赢家。',
    '',
    ':::hero',
    'eyebrow: VISUAL LEARNING',
    'title: 样板总览',
    'body: 用结构帮助理解。',
    'tag: 原文顺序',
    ':::',
    '',
    ':::split',
    'title: 双栏关系',
    'left-title: 原文',
    'left-body: 来源判断。',
    'right-title: 学习',
    'right-body: 学习解释。',
    ':::',
    '',
    ':::metrics',
    'title: 数据',
    'metric: 92.7% | 新素材 | 样板',
    'metric: 5.1% | 爆量池 | 样板',
    ':::',
    '',
    ':::flow',
    'title: 流程',
    'step: 01 | 做 | 提交候选',
    'step: 02 | 测 | 获得反馈',
    'step: 03 | 淘汰 | 停止弱项',
    'step: 04 | 放大 | 裂变赢家',
    'step: 05 | 复盘 | 记录变量',
    'step: 06 | 继续 | 进入下一轮',
    ':::',
    '',
    ':::compare',
    'title: 对比',
    'left-label: A',
    'right-label: B',
    'row: 曝光 | 30万 | 100万',
    ':::',
    '',
    ':::cards',
    'title: 分类',
    'card: 卡片A | 约 88% | 数字标签',
    'card: 卡片B | 普通标签 | 说明',
    ':::',
    '',
    ':::takeaway',
    'title: 总结',
    'item: 记住结构。',
    ':::',
    '',
    ':::case',
    'title: Prompt 案例组件',
    'meta: 15s · 9:16',
    'tag: 产品广告',
    'tag: 未配对视频',
    'body: 验证学习版案例卡可以独立展示案例元信息。',
    'note: 视频与 Prompt 不做无证据强绑定。',
    ':::',
    '',
    markdownFence + 'text',
    '做',
    '↓',
    '测',
    markdownFence,
    '',
    markdownFence + 'text',
    'integrated_multimodal_description:',
    ...Array.from({ length: 12 }, (_, index) => `[Shot ${index + 1}] Keep the same subject, scene, action continuity, lighting direction and camera axis while the motion remains physically coherent and easy to verify.`),
    'overall_soundscape: synchronized environmental detail and restrained physical effects.',
    'non_diegetic_music: subtle cinematic pulse.',
    markdownFence,
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(chaptersRoot, '01-system.md'), [
    '# 01｜爆单系统',
    '',
    '系统的核心是 **测试**。',
    '',
    '## 四个步骤',
    '',
    '| 阶段 | 作用 |',
    '|---|---|',
    '| 做 | 提交候选 |',
    '| 测 | 获得反馈 |',
  ].join('\n'), 'utf8');

  const { server, port } = await startViewer({ libraryRoot, host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: true, executablePath: detectChrome('auto') });

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const homeUrl = `http://127.0.0.1:${port}/`;
    const homeResponse = await page.goto(homeUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(homeResponse.status(), 200);
    assert.strictEqual(await page.locator('a.btn-primary').count(), 1);
    assert.strictEqual(await page.locator('a.btn-secondary').count(), 2);

    assert.strictEqual((await page.locator('a.btn-primary').first().innerText()).includes('进入学习版'), true);
    assert.strictEqual((await page.locator('a.btn-secondary').first().innerText()).includes('查看原始文章'), true);
    assert.strictEqual(await page.locator('[data-theme-toggle]').count(), 1);

    const explainUrl = `http://127.0.0.1:${port}/explain/${encodeURIComponent(folder)}/`;
    const explainResponse = await page.goto(explainUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(explainResponse.status(), 200);
    assert.strictEqual(await page.locator('body.explain-chapter-reader').count(), 1);
    assert.strictEqual(await page.locator('.chapter-nav-item').count(), 2);
    assert.strictEqual(await page.locator('.chapter-nav-item.is-active').count(), 1);
    assert.strictEqual(await page.locator('.chapter-nav-item.is-disabled').count(), 0);
    assert.strictEqual(await page.locator('.explain-lesson-card').count(), 0);
    assert.strictEqual(await page.locator('.explain-stat-grid').count(), 0);
    assert.strictEqual(await page.locator('.reader-toc').count(), 0);
    assert.strictEqual((await page.locator('.reader-article-title').innerText()).includes('00｜从这里开始'), true);
    assert.strictEqual(await page.locator('.learning-hero').count(), 1);
    assert.strictEqual(await page.locator('.learning-split').count(), 1);
    assert.strictEqual(await page.locator('.learning-metric').count(), 2);
    assert.strictEqual(await page.locator('.learning-flow-step').count(), 6);
    assert.strictEqual(await page.locator('.learning-flow-stack').count(), 1);
    assert.strictEqual(await page.locator('.learning-flow-turn').count(), 1);
    assert.strictEqual(await page.locator('.learning-compare-row').count(), 1);
    assert.strictEqual(await page.locator('.learning-compare-row .is-numeric').count(), 2);
    assert.strictEqual(await page.locator('.learning-card').count(), 2);
    assert.strictEqual(await page.locator('.learning-card-meta.is-numeric').count(), 1);
    assert.strictEqual(await page.locator('.learning-takeaway').count(), 1);
    assert.strictEqual(await page.locator('.learning-case').count(), 1);
    assert.strictEqual(await page.locator('.learning-case-tag').count(), 2);
    assert.strictEqual(await page.locator('.reader-prompt-card').count(), 1);
    assert.strictEqual(await page.locator('.reader-prompt-card.is-collapsed').count(), 1);
    assert.strictEqual(await page.locator('.reader-prompt-action').count(), 2);
    const learningTypeScale = await page.evaluate(() => ({
      metric: parseFloat(getComputedStyle(document.querySelector('.learning-metric strong')).fontSize),
      flow: parseFloat(getComputedStyle(document.querySelector('.learning-flow-number')).fontSize),
      cardNumeric: parseFloat(getComputedStyle(document.querySelector('.learning-card-meta.is-numeric')).fontSize),
      compareNumeric: parseFloat(getComputedStyle(document.querySelector('.learning-compare-row .is-numeric')).fontSize),
    }));
    assert.ok(learningTypeScale.metric >= 28);
    assert.ok(learningTypeScale.flow >= 26);
    assert.ok(learningTypeScale.cardNumeric >= 20);
    assert.ok(learningTypeScale.compareNumeric >= 16);
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.strictEqual(await page.locator('[data-theme-toggle]').count(), 1);
    const learningPromptToggle = page.locator('.reader-prompt-toggle').first();
    await learningPromptToggle.click();
    assert.strictEqual(await learningPromptToggle.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(await page.locator('.reader-prompt-card').first().evaluate(element => element.classList.contains('is-collapsed')), false);

    await page.click('[data-theme-toggle]');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('feishu-notes-theme')), 'dark');
    assert.strictEqual(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'true');
    await page.click('[data-theme-toggle]');
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('feishu-notes-theme')), 'light');

    const chapterOneUrl = explainUrl + '?chapter=01-system';
    const chapterOneResponse = await page.goto(chapterOneUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(chapterOneResponse.status(), 200);
    assert.strictEqual((await page.locator('.reader-article-title').innerText()).includes('01｜爆单系统'), true);
    assert.strictEqual(await page.locator('.reader-content table').count(), 1);
    assert.strictEqual(await page.locator('.chapter-nav-item.is-active').getAttribute('href'), chapterOneUrl.replace(`http://127.0.0.1:${port}`, ''));

    const legacyLessonUrl = `http://127.0.0.1:${port}/explain/${encodeURIComponent(folder)}/00-overview/`;
    const legacyLessonResponse = await page.goto(legacyLessonUrl, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(legacyLessonResponse.status(), 404);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(explainUrl, { waitUntil: 'networkidle' });
    const chapterMobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      sidebarDisplay: getComputedStyle(document.querySelector('.chapter-sidebar')).display,
      mobileNavDisplay: getComputedStyle(document.querySelector('.chapter-mobile-nav')).display,
      selected: document.querySelector('[data-chapter-select]')?.value || '',
    }));
    assert.strictEqual(chapterMobile.overflow, false);
    assert.strictEqual(chapterMobile.sidebarDisplay, 'none');
    assert.notStrictEqual(chapterMobile.mobileNavDisplay, 'none');
    assert.ok(chapterMobile.selected.includes('00-start'));

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      window.__readerPlayCalls = 0;
      HTMLMediaElement.prototype.play = function playForReaderVerification() {
        window.__readerPlayCalls += 1;
        return Promise.resolve();
      };
    });
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
        maxTableVideoTriggerHeight: Math.max(0, ...tableTriggers.filter(item => item.dataset.mediaKind === 'video').map(item => Math.round(item.getBoundingClientRect().height))),
        maxTableImageTriggerHeight: Math.max(0, ...tableTriggers.filter(item => item.dataset.mediaKind === 'image').map(item => Math.round(item.getBoundingClientRect().height))),
        tableVideos: document.querySelectorAll('table video').length,
        tableFits: [...document.querySelectorAll('.reader-table-wrap')].every(item => item.scrollWidth <= item.clientWidth + 1),
        compactTable: rect('.reader-table-wrap--compact'),
        standardTable: rect('.reader-table-wrap--standard'),
        wideTableCount: document.querySelectorAll('.reader-table-wrap--wide').length,
        inferredHeaderRows: document.querySelectorAll('.reader-table-head-row.is-inferred').length,
        structuredFlowSteps: document.querySelectorAll('.reader-structured-flow-step').length,
        structuredTierGroups: document.querySelectorAll('.reader-tier-group').length,
        standaloneVideoTriggers: document.querySelectorAll('.reader-media--standalone.is-dialog-trigger').length,
        fallbackBlocks: document.querySelectorAll('.reader-block--fallback .reader-fallback').length,
        zoomableImages: document.querySelectorAll('.reader-content img[data-reader-zoomable]').length,
        paper: {
          backgroundColor: paper.backgroundColor,
          borderTopWidth: paper.borderTopWidth,
          boxShadow: paper.boxShadow,
        },
        headingEnhancement: {
          borderLeftWidth: h2.borderLeftWidth,
          borderBottomWidth: h2.borderBottomWidth,
          backgroundImage: h2.backgroundImage,
          accentWidth: getComputedStyle(document.querySelector('.reader-content h2'), '::after').width,
        },
        tableHeaders: [...document.querySelectorAll('.reader-table-wrap thead th')].map(cell => cell.textContent.trim()),
        orderedRows: [...document.querySelectorAll('.reader-block--list .reader-list-item')].map(item => ({
          marker: item.querySelector('.reader-list-marker')?.textContent.trim(),
          content: item.querySelector('.reader-list-content')?.textContent.trim(),
          height: Math.round(item.getBoundingClientRect().height),
        })),
        contentGutter: Math.round(document.querySelector('.reader-block--text').getBoundingClientRect().left - document.querySelector('.reader-main').getBoundingClientRect().left),
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });

    assert.ok(desktop1920.toc.left <= 20);
    assert.ok(desktop1920.toc.width >= 200 && desktop1920.toc.width <= 216);
    assert.strictEqual(desktop1920.splitter.width, 12);
    assert.ok(desktop1920.main.width > 1200);
    assert.ok(desktop1920.text.width >= 900 && desktop1920.text.width <= 962);
    assert.ok(Math.abs(desktop1920.title.left - desktop1920.text.left) <= 1);
    assert.ok(Math.abs(desktop1920.text.left - desktop1920.table.left) <= 1);
    assert.ok(desktop1920.table.width > desktop1920.text.width + 250);
    assert.deepStrictEqual(desktop1920.tocHrefs.slice(0, 2), ['#block-101', '#block-102']);
    assert.strictEqual(desktop1920.tocLinks, desktop1920.headings);
    assert.strictEqual(desktop1920.mediaGrid.count, 2);
    assert.ok(desktop1920.mediaGrid.columns.split(' ').length >= 2);
    assert.strictEqual(desktop1920.tableTriggerCount, 3);
    assert.ok(desktop1920.maxTableTriggerHeight <= 56);
    assert.ok(desktop1920.maxTableVideoTriggerHeight <= 36);
    assert.ok(desktop1920.maxTableImageTriggerHeight <= 56);
    assert.strictEqual(desktop1920.tableVideos, 0);
    assert.strictEqual(desktop1920.tableFits, true);
    assert.ok(desktop1920.compactTable.width >= 220 && desktop1920.compactTable.width < 420);
    assert.ok(desktop1920.standardTable.width > desktop1920.compactTable.width);
    assert.ok(desktop1920.standardTable.width <= 1080);
    assert.strictEqual(desktop1920.wideTableCount, 1);
    assert.strictEqual(desktop1920.inferredHeaderRows, 1);
    assert.strictEqual(desktop1920.structuredFlowSteps, 5);
    assert.strictEqual(desktop1920.structuredTierGroups, 3);
    assert.ok(desktop1920.standaloneVideoTriggers >= 4);
    assert.strictEqual(desktop1920.fallbackBlocks, 1);
    assert.ok(desktop1920.zoomableImages >= 1);
    assert.ok(desktop1920.paper.backgroundColor.includes('0, 0, 0, 0'));
    assert.strictEqual(desktop1920.paper.borderTopWidth, '0px');
    assert.strictEqual(desktop1920.paper.boxShadow, 'none');
    assert.strictEqual(desktop1920.headingEnhancement.borderLeftWidth, '0px');
    assert.strictEqual(desktop1920.headingEnhancement.borderBottomWidth, '1px');
    assert.strictEqual(desktop1920.headingEnhancement.backgroundImage, 'none');
    assert.strictEqual(desktop1920.headingEnhancement.accentWidth, '72px');
    assert.deepStrictEqual(desktop1920.tableHeaders.slice(0, 3), ['媒体类型', '画幅', '参考素材']);
    assert.deepStrictEqual(desktop1920.orderedRows[0], { marker: '1.', content: '编号正文同行', height: desktop1920.orderedRows[0].height });
    assert.ok(desktop1920.orderedRows[0].height < 60);
    assert.ok(Math.abs(desktop1920.contentGutter - 80) <= 1);
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
      tableWidth: Math.round(document.querySelector('.reader-block--table').getBoundingClientRect().width),
      storedWidth: Number(localStorage.getItem('feishu-notes-toc-width')),
      ariaNow: Number(document.querySelector('[data-reader-splitter]').getAttribute('aria-valuenow')),
    }));
    assert.ok(resized.tocWidth >= desktop1920.toc.width + 180);
    assert.ok(resized.mainWidth < desktop1920.main.width - 170);
    assert.ok(Math.abs(resized.textWidth - desktop1920.text.width) <= 2);
    assert.ok(resized.tableWidth < desktop1920.table.width - 170);
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

    const standaloneVideo = page.locator('.reader-media--standalone.is-dialog-trigger').first();
    await standaloneVideo.click();
    const videoDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-media-dialog]');
      const video = dialog.querySelector('video');
      return {
        open: dialog.open,
        videoVisible: !video.hidden,
        imageVisible: !dialog.querySelector('img').hidden,
        playCalls: window.__readerPlayCalls || 0,
        background: getComputedStyle(dialog).backgroundColor,
        backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
      };
    });
    assert.strictEqual(videoDialog.open, true);
    assert.strictEqual(videoDialog.videoVisible, true);
    assert.strictEqual(videoDialog.imageVisible, false);
    assert.ok(videoDialog.playCalls >= 1);
    assert.ok(videoDialog.background.includes('0, 0, 0, 0'));
    assert.ok(videoDialog.backdrop.includes('0, 0, 0, 0'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-media-dialog]').open);

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
        backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
      };
    });
    assert.strictEqual(imageDialog.open, true);
    assert.strictEqual(imageDialog.imageVisible, true);
    assert.strictEqual(imageDialog.videoVisible, false);
    assert.ok(imageDialog.background.includes('0, 0, 0, 0'));
    assert.ok(imageDialog.backdrop.includes('0, 0, 0, 0'));
    assert.strictEqual(imageDialog.borderTopWidth, '0px');
    assert.strictEqual(imageDialog.borderRadius, '0px');
    await page.locator('.reader-dialog-stage').click({ position: { x: 6, y: 6 } });
    await page.waitForFunction(() => !document.querySelector('[data-media-dialog]').open);

    const viewports = [
      { width: 1440, height: 900, mobileToc: false },
      { width: 1366, height: 768, mobileToc: false },
      { width: 390, height: 844, mobileToc: true },
    ];

    const responsive = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const result = await page.evaluate(() => {
        const firstCard = document.querySelector('.reader-smart-table tbody>tr:not(.reader-table-head-row)');
        return {
          width: innerWidth,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          tocToggleVisible: getComputedStyle(document.querySelector('.reader-toc-toggle')).display !== 'none',
          tableFits: [...document.querySelectorAll('.reader-table-wrap')].every(table => table.scrollWidth <= table.clientWidth + 1),
          tableCardMode: firstCard ? getComputedStyle(firstCard).display === 'block' : false,
        };
      });
      assert.strictEqual(result.pageOverflow, false);
      assert.strictEqual(result.tocToggleVisible, viewport.mobileToc);
      assert.strictEqual(result.tableFits, true);
      assert.strictEqual(result.tableCardMode, viewport.width <= 900);
      responsive.push(result);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    const denseUrl = `http://127.0.0.1:${port}/note/${encodeURIComponent(denseFolder)}/`;
    const denseResponse = await page.goto(denseUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(denseResponse.status(), 200);
    await page.waitForTimeout(120);

    const denseDesktop = await page.evaluate(() => {
      const visible = element => getComputedStyle(element).display !== 'none';
      const promptBody = document.querySelector('.reader-prompt-card .reader-prompt-body');
      const major = document.querySelector('.reader-heading-major h2,.reader-heading-major h3');
      const note = document.querySelector('.reader-heading-note h2,.reader-heading-note h3');
      const long = document.querySelector('.reader-heading-long h2,.reader-heading-long h3');
      return {
        dense: document.body.classList.contains('reader-dense-note'),
        promptHeavy: document.body.classList.contains('reader-prompt-heavy'),
        mode: document.querySelector('.reader-article')?.dataset.readerMode || '',
        headings: document.querySelectorAll('.reader-block--heading h2[id],.reader-block--heading h3[id]').length,
        majorHeadings: document.querySelectorAll('.reader-heading-major').length,
        noteHeadings: document.querySelectorAll('.reader-heading-note').length,
        longHeadings: document.querySelectorAll('.reader-heading-long').length,
        commentaryRuns: Number(document.querySelector('.reader-article')?.dataset.commentaryRuns || 0),
        commentaryItems: document.querySelectorAll('.reader-commentary-item').length,
        commentaryLabels: document.querySelectorAll('.reader-commentary-label').length,
        commentaryFont: parseFloat(getComputedStyle(document.querySelector('.reader-commentary-item h2,.reader-commentary-item h3')).fontSize || '0'),
        tocLinks: document.querySelectorAll('.reader-toc-list a').length,
        visibleTocLinks: [...document.querySelectorAll('.reader-toc-list a')].filter(visible).length,
        tocScope: document.querySelector('[data-toc-scope-toggle]')?.textContent || '',
        promptCards: document.querySelectorAll('.reader-prompt-card').length,
        collapsedPrompts: document.querySelectorAll('.reader-prompt-card.is-collapsed').length,
        promptBodyHeight: promptBody ? Math.round(promptBody.getBoundingClientRect().height) : 0,
        promptBodyScrollHeight: promptBody?.scrollHeight || 0,
        headingMedia: document.querySelectorAll('.reader-heading-media .reader-media--image').length,
        visibleImages: [...document.querySelectorAll('.reader-content img[data-reader-zoomable]')].filter(image => image.getBoundingClientRect().width > 0).length,
        sheetFallback: document.querySelectorAll('.reader-sheet-fallback').length,
        sheetFallbackVisible: Boolean(document.querySelector('.reader-sheet-fallback')?.getBoundingClientRect().width),
        majorFont: major ? parseFloat(getComputedStyle(major).fontSize) : 0,
        noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
        longFont: long ? parseFloat(getComputedStyle(long).fontSize) : 0,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });

    assert.strictEqual(denseDesktop.dense, true);
    assert.strictEqual(denseDesktop.promptHeavy, true);
    assert.strictEqual(denseDesktop.mode, 'dense-note');
    assert.strictEqual(denseDesktop.headings, 22);
    assert.ok(denseDesktop.majorHeadings >= 4);
    assert.ok(denseDesktop.noteHeadings >= 8);
    assert.ok(denseDesktop.longHeadings >= 1);
    assert.ok(denseDesktop.commentaryRuns >= 1);
    assert.ok(denseDesktop.commentaryItems >= 4);
    assert.strictEqual(denseDesktop.commentaryLabels, 1);
    assert.ok(denseDesktop.commentaryFont <= 15.5);
    assert.strictEqual(denseDesktop.tocLinks, 22);
    assert.ok(denseDesktop.visibleTocLinks < denseDesktop.tocLinks);
    assert.ok(denseDesktop.tocScope.includes('全部 22'));
    assert.strictEqual(denseDesktop.promptCards, 5);
    assert.strictEqual(denseDesktop.collapsedPrompts, 5);
    assert.ok(denseDesktop.promptBodyHeight <= 341);
    assert.ok(denseDesktop.promptBodyScrollHeight > denseDesktop.promptBodyHeight);
    assert.strictEqual(denseDesktop.headingMedia, 1);
    assert.ok(denseDesktop.visibleImages >= 2);
    assert.strictEqual(denseDesktop.sheetFallback, 1);
    assert.strictEqual(denseDesktop.sheetFallbackVisible, true);
    assert.ok(denseDesktop.majorFont <= 24);
    assert.ok(denseDesktop.noteFont <= 18);
    assert.ok(denseDesktop.longFont <= 16.5);
    assert.strictEqual(denseDesktop.pageOverflow, false);

    await page.click('[data-toc-scope-toggle]');
    const expandedTocCount = await page.evaluate(() =>
      [...document.querySelectorAll('.reader-toc-list a')].filter(link => getComputedStyle(link).display !== 'none').length
    );
    assert.strictEqual(expandedTocCount, 22);

    const firstPromptToggle = page.locator('.reader-prompt-toggle').first();
    await firstPromptToggle.click();
    assert.strictEqual(await firstPromptToggle.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(await page.locator('.reader-prompt-card').first().evaluate(element => element.classList.contains('is-collapsed')), false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(denseUrl, { waitUntil: 'networkidle' });
    const denseMobile = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      docWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      visibleImages: [...document.querySelectorAll('.reader-content img[data-reader-zoomable]')].filter(image => image.getBoundingClientRect().width > 0).length,
      sheetFallbackVisible: Boolean(document.querySelector('.reader-sheet-fallback')?.getBoundingClientRect().width),
    }));
    assert.strictEqual(denseMobile.pageOverflow, false);
    assert.strictEqual(denseMobile.docWidth, denseMobile.width);
    assert.ok(denseMobile.visibleImages >= 2);
    assert.strictEqual(denseMobile.sheetFallbackVisible, true);

    console.log(JSON.stringify({ ok: true, desktop1920, collapsed, imageDialog, responsive, denseDesktop, denseMobile }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (!keepFixture) fs.rmSync(libraryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
