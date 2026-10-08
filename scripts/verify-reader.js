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
  const reportFolder = 'reader-report-fixture';
  const reportArchiveDir = path.join(libraryRoot, reportFolder);

  if (!keepFixture) fs.rmSync(libraryRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(archiveDir, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(path.join(denseArchiveDir, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(reportArchiveDir, { recursive: true });

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
      id: 'standalone-image-b',
      url: 'fixture:image-b',
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
      {
        id: '305',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '投放目的', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '判断依据', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '占比（在投口径）', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '转化（首要）', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '直播引流型 39,613 条＝68.2%；台词高频含“点击看看/进直播间/拍一发六”', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '主导', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '种草（次）', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '商品广告型 22,381 条＝38.5%（与直播引流重叠，一条素材多计划复用）', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '辅助', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '复购/囤货', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '买一次管一年、够你用一学期、多囤两瓶、第四瓶29.9', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '高频穿插', colspan: 1, rowspan: 1, media: [] },
          ],
        ],
      },
      {
        id: '306',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '编号', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '类型', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '核心创作思路', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '内容结构', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '转化引导', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: 'F1', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '手部操作＋口播', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '人不出镜、只有手，把预算集中在动作真实感和产品使用过程的可信度上；同时需要解释为什么这一动作可信、为什么该场景值得立即处理，以及用户在几秒内应该看到什么证据变化。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '恐惧断言→手持喷洒→前后对比→数字证据→促销机制，连续信息必须保持可扫描；镜头之间还要维持动作连续性、产品位置一致性和证据出现顺序，避免为了塞内容而让关键步骤挤在一列里。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '口语直推“你就买一瓶回去试试”，同时承接直播间机制和限时利益点', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: 'F2', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '无口播纯字幕', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '用多条广告语承担口播功能，通过低拍摄成本快速测试不同开场与利益点组合；每个版本都保留相同产品动作，只替换前3秒钩子、证据顺序与利益点表达，便于横向比较。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '恐惧字幕→功效字幕→使用场景→品牌背书→直播机制，长列应该获得明显更多空间；如果整张表超过 Reader 可用宽度，应压缩这些长列而不是把编号、状态等短列平均撑宽。', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '直播间承接，并保留可替换的促销机制和倒计时信息', colspan: 1, rowspan: 1, media: [] },
          ],
        ],
      },
      {
        id: '307',
        className: 'docx-table-block',
        text: '',
        html: '',
        media: [],
        table: [
          [
            { tag: 'td', text: '合并单元格示例', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '说明', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: '跨两列内容保持浏览器原生布局', colspan: 2, rowspan: 1, media: [] },
          ],
        ],
      },
      {
        id: '308',
        recordId: 'fixture-sheet-record',
        className: 'docx-sheet-block',
        text: '',
        html: '<div class="docx-sheet-block"><canvas class="spreadsheet-canvas"></canvas></div>',
        media: [],
        sheetExtraction: {
          extractionMethod: 'feishu-clipboard-html',
          rowCount: 3,
          columnCount: 3,
        },
        table: [
          [
            { tag: 'td', text: '插件', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '原生 H3', isHeader: true, colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: 'FastH3 V2', isHeader: true, colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: 'SageAttention', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '高', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '可用', colspan: 1, rowspan: 1, media: [] },
          ],
          [
            { tag: 'td', text: 'Sol-Attn', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '高', colspan: 1, rowspan: 1, media: [] },
            { tag: 'td', text: '不兼容', colspan: 1, rowspan: 1, media: [] },
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

  const denseInventory = inventory.filter(item => ['fixture:image', 'fixture:image-b'].includes(item.url));
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
    id: 'd-image-grid',
    className: 'docx-image-block',
    text: '',
    html: '<div class="docx-image-block"><img src="fixture:image" width="2400" height="1600"><img src="fixture:image-b" width="2400" height="1600"></div>',
    media: [{ url: 'fixture:image' }, { url: 'fixture:image-b' }],
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

  const reportBlocks = [];
  for (let section = 0; section < 4; section += 1) {
    reportBlocks.push({
      id: `r-h2-${section + 1}`,
      className: 'docx-heading1-block',
      text: `维度 ${section + 1} · 结构化报告章节`,
      html: '',
      media: [],
      table: null,
    });
    reportBlocks.push({
      id: `r-t-${section + 1}`,
      className: 'docx-text-block',
      text: '这是一段短正文，用来验证高结构密度报告仍保持连续、克制的阅读节奏。',
      html: '<div class="docx-text-block">这是一段短正文，用来验证高结构密度报告仍保持连续、克制的阅读节奏。</div>',
      media: [],
      table: null,
    });

    const subsectionCount = section === 3 ? 3 : 2;
    for (let subsection = 0; subsection < subsectionCount; subsection += 1) {
      reportBlocks.push({
        id: `r-h3-${section + 1}-${subsection + 1}`,
        className: 'docx-heading2-block',
        text: `${section + 1}.${subsection + 1} 报告小节`,
        html: '',
        media: [],
        table: null,
      });
      reportBlocks.push({
        id: `r-st-${section + 1}-${subsection + 1}`,
        className: 'docx-text-block',
        text: '短段落承接结论、数据与表格，避免每个信息块都成为新的视觉卡片。',
        html: '<div class="docx-text-block">短段落承接结论、数据与表格，避免每个信息块都成为新的视觉卡片。</div>',
        media: [],
        table: null,
      });
    }
  }

  [
    {
      id: 'r-table-1',
      rows: [
        ['阶段', '判断依据', '占比'],
        ['测试', '通过短周期验证素材方向是否值得继续', '42%'],
        ['放大', '将已验证方向复制到更多素材组合', '58%'],
      ],
    },
    {
      id: 'r-table-2',
      rows: [
        ['编号', '类型', '核心创作思路', '转化引导'],
        ['F1', '手部操作', '用真实动作与短口播快速建立使用可信度，并把证据顺序压缩到可扫读的结构中。', '进入直播间'],
        ['F2', '纯字幕', '保持产品动作不变，只替换前几秒钩子与利益点，便于横向比较。', '查看活动'],
      ],
    },
    {
      id: 'r-table-3',
      rows: [
        ['指标', '结果', '状态'],
        ['点击率', '12.4%', '高'],
        ['转化率', '4.8%', '中'],
      ],
    },
  ].forEach(spec => {
    reportBlocks.push({
      id: spec.id,
      className: 'docx-table-block',
      text: '',
      html: '',
      media: [],
      table: spec.rows.map((row, rowIndex) =>
        row.map(value => ({
          tag: rowIndex === 0 ? 'th' : 'td',
          text: value,
          isHeader: rowIndex === 0,
          colspan: 1,
          rowspan: 1,
          media: [],
        }))
      ),
    });
  });

  reportBlocks.push({
    id: 'r-flow',
    className: 'docx-code-block',
    text: [
      '- 报告转化五步链',
      '  - ① 发现问题',
      '    - 明确场景',
      '  - ② 命名问题',
      '    - 降低理解成本',
      '  - ③ 给出证据',
      '    - 数据与案例',
      '  - ④ 收束判断',
      '    - 形成结论',
      '  - ⑤ 指向行动',
      '    - 给出下一步',
    ].join('\n'),
    html: '',
    media: [],
    table: null,
  });

  const reportDocument = {
    documentId: 'report-fixture',
    title: 'Structured Report Reading Fixture',
    sourceUrl: '',
    blocks: reportBlocks,
  };
  const reportRendered = renderDocument({ document: reportDocument, inventory: [] });
  fs.writeFileSync(path.join(reportArchiveDir, 'article.html'), reportRendered.html, 'utf8');
  fs.writeFileSync(path.join(reportArchiveDir, 'fixture.md'), reportRendered.markdown, 'utf8');
  fs.writeFileSync(path.join(reportArchiveDir, 'archive.json'), JSON.stringify({
    version: 2,
    documentId: reportDocument.documentId,
    title: reportDocument.title,
    sourceUrl: '',
    savedAt: fixtureSavedAt,
    status: 'complete',
    markdownFile: 'fixture.md',
    htmlFile: 'article.html',
    storage: {
      logicalMediaCount: 0,
      physicalAssetCount: 0,
      logicalBytes: 0,
      physicalBytes: 0,
      deduplicatedBytes: 0,
    },
    media: [],
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
    title: 'Reader Fixture · 原文深度拆解',
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
    ':::compare',
    'title: 含数字的解释',
    'left-label: 原文口径',
    'right-label: 解释边界',
    'row: 品牌资产 | 医院出身 / 90 年 / 英国是原文使用的信任表达。 | 含年份的解释应保持正文层级，不是核心数值。',
    'row: 功效口径 | 99.99% 是源材料中的营销声明，不能直接扩张结论。 | 第3秒出现包装不代表对功效进行了独立验证。',
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
    'prompt: true',
    'tag: 产品广告',
    'tag: 未配对视频',
    'body: 验证深度拆解案例把分析与完整 Prompt 合并进同一个一级容器。',
    'analysis: 产品 → 人物 → 产品形成闭环。',
    'anatomy: Subject Definitions',
    'anatomy: Detailed Description',
    'constraint: 产品身份保持稳定。',
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
    assert.strictEqual(await page.locator('a.btn-secondary').count(), 3);

    assert.strictEqual((await page.locator('a.btn-primary').first().innerText()).includes('进入深度拆解'), true);
    assert.strictEqual((await page.locator('a.btn-secondary').first().innerText()).includes('查看原始文章'), true);
    assert.strictEqual(await page.locator('[data-theme-toggle]').count(), 1);

    const explainUrl = `http://127.0.0.1:${port}/explain/${encodeURIComponent(folder)}/`;
    const explainResponse = await page.goto(explainUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(explainResponse.status(), 200);
    assert.strictEqual(await page.locator('body.explain-chapter-reader.explain-single-page').count(), 1);
    assert.strictEqual(await page.locator('.chapter-nav-item').count(), 2);
    assert.strictEqual(await page.locator('.chapter-nav-item.is-active').count(), 1);
    assert.strictEqual(await page.locator('.chapter-nav-item.is-disabled').count(), 0);
    assert.strictEqual(await page.locator('.explain-chapter-section').count(), 2);
    assert.strictEqual(await page.locator('.chapter-pager').count(), 0);
    assert.strictEqual(await page.locator('.explain-lesson-card').count(), 0);
    assert.strictEqual(await page.locator('.explain-stat-grid').count(), 0);
    assert.strictEqual(await page.locator('.reader-toc').count(), 0);
    assert.strictEqual(await page.locator('.reader-article-title').count(), 2);
    assert.strictEqual((await page.locator('.reader-article-title').nth(0).innerText()).includes('00｜从这里开始'), true);
    assert.strictEqual((await page.locator('.reader-article-title').nth(1).innerText()).includes('01｜爆单系统'), true);
    assert.strictEqual(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(node => node.id).filter(Boolean);
      return ids.length - new Set(ids).size;
    }), 0);
    assert.strictEqual(await page.locator('.learning-hero').count(), 1);
    assert.strictEqual(await page.locator('.learning-split').count(), 1);
    assert.strictEqual(await page.locator('.learning-metric').count(), 2);
    assert.strictEqual(await page.locator('.learning-flow-step').count(), 6);
    assert.strictEqual(await page.locator('.learning-flow-stack').count(), 1);
    assert.strictEqual(await page.locator('.learning-flow-turn').count(), 1);
    assert.strictEqual(await page.locator('.learning-compare-row').count(), 3);
    assert.strictEqual(await page.locator('.learning-compare table.reader-smart-table').count(), 2);
    assert.strictEqual(await page.locator('.learning-compare th[scope="col"]').count(), 6);
    assert.strictEqual(await page.locator('.learning-compare th[scope="row"]').count(), 3);
    assert.strictEqual(await page.locator('.learning-compare').nth(0).locator('tbody td.reader-col-numeric').count(), 2);
    assert.strictEqual(await page.locator('.learning-compare').nth(1).locator('tbody .reader-col-numeric,tbody .reader-col-percent,.is-numeric').count(), 0);
    assert.strictEqual(await page.locator('.learning-card').count(), 2);
    assert.strictEqual(await page.locator('.learning-card-meta.is-numeric').count(), 0);
    assert.strictEqual(await page.locator('.learning-takeaway').count(), 1);
    assert.strictEqual(await page.locator('.learning-case').count(), 1);
    assert.strictEqual(await page.locator('.learning-case--prompt').count(), 1);
    assert.strictEqual(await page.locator('.learning-case-tag').count(), 2);
    assert.strictEqual(await page.locator('.learning-case-analysis').count(), 1);
    assert.strictEqual(await page.locator('.learning-case-anatomy li').count(), 2);
    assert.strictEqual(await page.locator('.learning-case-constraints').count(), 1);
    assert.strictEqual(await page.locator('.learning-case--prompt > .reader-prompt-card--embedded').count(), 1);
    assert.strictEqual(await page.locator('.explain-chapter-section > .reader-prompt-card').count(), 1);
    assert.strictEqual(await page.locator('.reader-prompt-card').count(), 2);
    assert.strictEqual(await page.locator('.reader-prompt-card.is-collapsed').count(), 1);
    assert.strictEqual(await page.locator('.reader-prompt-action').count(), 3);
    const embeddedPromptStyle = await page.evaluate(() => {
      const prompt = document.querySelector('.learning-case--prompt > .reader-prompt-card--embedded');
      const style = getComputedStyle(prompt);
      return {
        borderLeft: style.borderLeftWidth,
        borderRight: style.borderRightWidth,
        borderBottom: style.borderBottomWidth,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
      };
    });
    assert.strictEqual(embeddedPromptStyle.borderLeft, '0px');
    assert.strictEqual(embeddedPromptStyle.borderRight, '0px');
    assert.strictEqual(embeddedPromptStyle.borderBottom, '0px');
    assert.strictEqual(embeddedPromptStyle.borderRadius, '0px');
    assert.strictEqual(embeddedPromptStyle.boxShadow, 'none');
    const standaloneExplainPromptStyle = await page.evaluate(() => {
      const prompt = document.querySelector('.explain-chapter-section > .reader-prompt-card');
      const body = prompt?.querySelector('.reader-prompt-body');
      if (!prompt || !body) return null;
      const style = getComputedStyle(prompt);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        collapsedBodyHeight: Math.round(body.getBoundingClientRect().height),
      };
    });
    assert.ok(standaloneExplainPromptStyle);
    assert.strictEqual(standaloneExplainPromptStyle.borderRadius, '14px');
    assert.notStrictEqual(standaloneExplainPromptStyle.boxShadow, 'none');
    assert.ok(standaloneExplainPromptStyle.collapsedBodyHeight >= 330);
    const learningTypeScale = await page.evaluate(() => ({
      metric: parseFloat(getComputedStyle(document.querySelector('.learning-metric strong')).fontSize),
      flow: parseFloat(getComputedStyle(document.querySelector('.learning-flow-number')).fontSize),
      cardMeta: parseFloat(getComputedStyle(document.querySelector('.learning-card-meta')).fontSize),
      cardBody: parseFloat(getComputedStyle(document.querySelector('.learning-card p')).fontSize),
      compareProse: parseFloat(getComputedStyle(document.querySelectorAll('.learning-compare')[1].querySelector('tbody td')).fontSize),
      caseSummary: parseFloat(getComputedStyle(document.querySelector('.learning-case-summary')).fontSize),
      caseAnalysis: parseFloat(getComputedStyle(document.querySelector('.learning-case-analysis li')).fontSize),
      caseMeta: parseFloat(getComputedStyle(document.querySelector('.learning-case-meta')).fontSize),
      caseAnatomyMarker: getComputedStyle(document.querySelector('.learning-case-anatomy li'), '::after').content,
      caseAnatomyList: getComputedStyle(document.querySelector('.learning-case-anatomy ul')).listStyleType,
    }));
    assert.ok(learningTypeScale.metric >= 28);
    assert.ok(learningTypeScale.flow >= 26);
    assert.ok(learningTypeScale.cardBody >= 16);
    assert.ok(learningTypeScale.cardMeta < learningTypeScale.cardBody);
    assert.strictEqual(learningTypeScale.compareProse, 16);
    assert.strictEqual(learningTypeScale.caseSummary, 16);
    assert.strictEqual(learningTypeScale.caseAnalysis, 16);
    assert.ok(learningTypeScale.caseMeta < learningTypeScale.caseAnalysis);
    assert.strictEqual(learningTypeScale.caseAnatomyMarker, 'none');
    assert.strictEqual(learningTypeScale.caseAnatomyList, 'disc');
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

    await page.evaluate(() => { window.__singlePageSentinel = 17; });
    const secondChapterLink = page.locator('.chapter-nav-item').nth(1);
    const secondChapterHref = await secondChapterLink.getAttribute('href');
    await secondChapterLink.click();
    await page.waitForFunction(() => location.hash === '#chapter-01-system' && scrollY > 0);
    await page.waitForFunction(() => {
      const target = document.getElementById('chapter-01-system');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      return target && target.getBoundingClientRect().top <= topbar + 36;
    });
    const chapterScroll = await page.evaluate(() => {
      const target = document.getElementById('chapter-01-system');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      return {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        scrollY,
        targetTop: target?.getBoundingClientRect().top || 0,
        topbar,
        activeHref: document.querySelector('.chapter-nav-item.is-active')?.getAttribute('href') || '',
        sentinel: window.__singlePageSentinel || 0,
        sections: document.querySelectorAll('.explain-chapter-section').length,
        tables: document.querySelectorAll('.reader-content table').length,
      };
    });
    assert.strictEqual(chapterScroll.pathname, new URL(explainUrl).pathname);
    assert.strictEqual(chapterScroll.search, '');
    assert.strictEqual(chapterScroll.hash, '#chapter-01-system');
    assert.strictEqual(chapterScroll.sentinel, 17);
    assert.strictEqual(chapterScroll.sections, 2);
    assert.strictEqual(chapterScroll.tables, 3);
    assert.ok(chapterScroll.targetTop >= chapterScroll.topbar + 8);
    assert.ok(chapterScroll.targetTop <= chapterScroll.topbar + 36, JSON.stringify(chapterScroll));
    assert.ok(chapterScroll.activeHref.endsWith('#chapter-01-system'));
    assert.ok(secondChapterHref.endsWith('#chapter-01-system'));

    const chapterOneUrl = explainUrl + '?chapter=01-system';
    const chapterOneResponse = await page.goto(chapterOneUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(chapterOneResponse.status(), 200);
    await page.waitForFunction(() => location.hash === '#chapter-01-system' && scrollY > 0);
    await page.waitForFunction(() => {
      const target = document.getElementById('chapter-01-system');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      return target && target.getBoundingClientRect().top <= topbar + 36;
    });
    assert.ok(page.url().endsWith('/#chapter-01-system'));
    assert.strictEqual(await page.locator('.explain-chapter-section').count(), 2);
    assert.ok((await page.locator('.chapter-nav-item.is-active').getAttribute('href')).endsWith('#chapter-01-system'));

    const legacyLessonUrl = `http://127.0.0.1:${port}/explain/${encodeURIComponent(folder)}/00-overview/`;
    const legacyLessonResponse = await page.goto(legacyLessonUrl, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(legacyLessonResponse.status(), 404);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(explainUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.__mobileSinglePageSentinel = 31; });
    const mobileSelect = page.locator('[data-chapter-select]');
    await mobileSelect.selectOption({ index: 1 });
    await page.waitForFunction(() => location.hash === '#chapter-01-system' && scrollY > 0);
    await page.waitForFunction(() => {
      const target = document.getElementById('chapter-01-system');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      const mobileNav = document.querySelector('.chapter-mobile-nav')?.getBoundingClientRect().height || 0;
      return target && target.getBoundingClientRect().top <= topbar + mobileNav + 36;
    });
    const chapterMobile = await page.evaluate(() => {
      const target = document.getElementById('chapter-01-system');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      const mobileNav = document.querySelector('.chapter-mobile-nav')?.getBoundingClientRect().height || 0;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        sidebarDisplay: getComputedStyle(document.querySelector('.chapter-sidebar')).display,
        mobileNavDisplay: getComputedStyle(document.querySelector('.chapter-mobile-nav')).display,
        selected: document.querySelector('[data-chapter-select]')?.value || '',
        hash: location.hash,
        scrollY,
        targetTop: target?.getBoundingClientRect().top || 0,
        offset: topbar + mobileNav,
        sentinel: window.__mobileSinglePageSentinel || 0,
        tailSpace: getComputedStyle(document.documentElement).getPropertyValue('--reader-chapter-tail-space').trim(),
        articlePaddingBottom: getComputedStyle(document.querySelector('.explain-chapter-article')).paddingBottom,
        lastSectionHeight: Math.round(document.querySelector('.explain-chapter-section:last-child')?.getBoundingClientRect().height || 0),
        maxScroll: document.documentElement.scrollHeight - innerHeight,
      };
    });
    assert.strictEqual(chapterMobile.overflow, false);
    assert.strictEqual(chapterMobile.sidebarDisplay, 'none');
    assert.notStrictEqual(chapterMobile.mobileNavDisplay, 'none');
    assert.ok(chapterMobile.selected.includes('#chapter-01-system'), JSON.stringify(chapterMobile));
    assert.strictEqual(chapterMobile.hash, '#chapter-01-system');
    assert.strictEqual(chapterMobile.sentinel, 31);
    assert.ok(chapterMobile.targetTop >= chapterMobile.offset + 8);
    assert.ok(chapterMobile.targetTop <= chapterMobile.offset + 36);

    const compareMobile = await page.locator('.learning-compare').nth(1).evaluate(element => {
      const wrap = element.querySelector('.reader-table-wrap');
      const row = element.querySelector('tbody tr');
      const cells = [...row.cells];
      return {
        overflow: wrap.scrollWidth > wrap.clientWidth + 1,
        labels: cells.map(cell => cell.dataset.label),
        cellColumns: cells.map(cell => getComputedStyle(cell).gridTemplateColumns.split(' ').length),
        text: row.textContent,
      };
    });
    assert.strictEqual(compareMobile.overflow, false);
    assert.deepStrictEqual(compareMobile.labels, ['维度', '原文口径', '解释边界']);
    assert.ok(compareMobile.cellColumns.every(count => count === 1));
    assert.ok(compareMobile.text.includes('90 年') && compareMobile.text.includes('正文层级'));
    await page.locator('[data-theme-toggle]').click();
    const explainDark = await page.locator('.learning-compare').nth(1).evaluate(element => ({
      theme: document.documentElement.dataset.theme,
      cellColor: getComputedStyle(element.querySelector('tbody td')).color,
      textColor: getComputedStyle(document.querySelector('.reader-block--text p')).color,
      shadow: getComputedStyle(element.querySelector('tbody tr')).boxShadow,
    }));
    assert.strictEqual(explainDark.theme, 'dark');
    assert.strictEqual(explainDark.cellColor, explainDark.textColor);
    assert.strictEqual(explainDark.shadow, 'none');
    const caseDark = await page.locator('.learning-case--prompt').evaluate(element => ({
      analysisSize: parseFloat(getComputedStyle(element.querySelector('.learning-case-analysis li')).fontSize),
      analysisColor: getComputedStyle(element.querySelector('.learning-case-analysis li')).color,
      textColor: getComputedStyle(document.querySelector('.reader-block--text p')).color,
      overflow: element.scrollWidth > element.clientWidth + 1,
    }));
    assert.strictEqual(caseDark.analysisSize, 16);
    assert.strictEqual(caseDark.analysisColor, caseDark.textColor);
    assert.strictEqual(caseDark.overflow, false);
    await page.locator('[data-theme-toggle]').click();

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
      const tableProfile = blockId => {
        const block = document.querySelector('.reader-block--table[data-block-id="' + blockId + '"]');
        const wrap = block?.querySelector('.reader-table-wrap');
        const table = wrap?.querySelector('table');
        if (!block || !wrap || !table) return null;
        const headerRow = table.rows[0] || null;
        return {
          layout: wrap.dataset.tableLayout || '',
          preferredWidth: Number(wrap.dataset.preferredWidth || 0),
          wrapWidth: Math.round(wrap.getBoundingClientRect().width),
          blockWidth: Math.round(block.getBoundingClientRect().width),
          overflow: wrap.scrollWidth > wrap.clientWidth + 1,
          columns: headerRow ? [...headerRow.cells].map((cell, column) => ({
            label: cell.textContent.trim(),
            kind: cell.dataset.columnKind || '',
            width: Math.round(cell.getBoundingClientRect().width),
            maxLength: Math.max(
              0,
              ...[...table.rows].slice(1).map(row => row.cells[column]).filter(Boolean).map(item => item.textContent.trim().length)
            ),
          })) : [],
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
        naturalTableCount: document.querySelectorAll('.reader-table-wrap[data-table-layout="natural"]').length,
        clampedTableCount: document.querySelectorAll('.reader-table-wrap[data-table-layout="clamped"]').length,
        nativeTableCount: document.querySelectorAll('.reader-table-wrap[data-table-layout="native"]').length,
        tableProfiles: {
          media: tableProfile('301'),
          wide: tableProfile('302'),
          metrics: tableProfile('303'),
          short: tableProfile('304'),
          percentText: tableProfile('305'),
          shortKey: tableProfile('306'),
          spans: tableProfile('307'),
          sheet: tableProfile('308'),
        },
        sheetFallbacks: document.querySelectorAll('[data-block-id="308"] .reader-sheet-fallback').length,
        sheetRows: document.querySelectorAll('[data-block-id="308"] table tr').length,
        sheetColumns: document.querySelector('[data-block-id="308"] table tr')?.cells.length || 0,
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
    assert.ok(desktop1920.tocHrefs[0].startsWith('/note/'));
    assert.ok(desktop1920.tocHrefs[0].endsWith('#block-101'));
    assert.ok(desktop1920.tocHrefs[1].startsWith('/note/'));
    assert.ok(desktop1920.tocHrefs[1].endsWith('#block-102'));
    assert.strictEqual(desktop1920.tocLinks, desktop1920.headings);
    assert.strictEqual(desktop1920.mediaGrid.count, 2);
    assert.ok(desktop1920.mediaGrid.columns.split(' ').length >= 2);
    assert.strictEqual(desktop1920.tableTriggerCount, 3);
    assert.ok(desktop1920.maxTableTriggerHeight <= 56);
    assert.ok(desktop1920.maxTableVideoTriggerHeight <= 36);
    assert.ok(desktop1920.maxTableImageTriggerHeight <= 56);
    assert.strictEqual(desktop1920.tableVideos, 0);
    assert.strictEqual(desktop1920.tableFits, true);
    assert.ok(desktop1920.naturalTableCount >= 4);
    assert.ok(desktop1920.clampedTableCount >= 1);
    assert.ok(desktop1920.nativeTableCount >= 1);
    assert.strictEqual(desktop1920.tableProfiles.metrics.layout, 'natural');
    assert.ok(desktop1920.tableProfiles.metrics.wrapWidth < desktop1920.tableProfiles.metrics.blockWidth * 0.5);
    assert.strictEqual(desktop1920.tableProfiles.shortKey.layout, 'clamped');
    assert.ok(Math.abs(desktop1920.tableProfiles.shortKey.wrapWidth - desktop1920.tableProfiles.shortKey.blockWidth) <= 2);
    assert.strictEqual(desktop1920.tableProfiles.percentText.columns[1].kind, 'long');
    assert.ok(desktop1920.tableProfiles.percentText.columns[1].width > desktop1920.tableProfiles.percentText.columns[0].width * 2);
    assert.ok(desktop1920.tableProfiles.percentText.columns[1].width > desktop1920.tableProfiles.percentText.columns[2].width * 2);
    assert.ok(desktop1920.tableProfiles.shortKey.columns[0].width < desktop1920.tableProfiles.shortKey.columns[2].width * 0.5);
    assert.ok(desktop1920.tableProfiles.shortKey.columns[0].width < desktop1920.tableProfiles.shortKey.columns[3].width * 0.5);
    assert.strictEqual(desktop1920.tableProfiles.spans.layout, 'native');
    assert.ok(desktop1920.tableProfiles.sheet);
    assert.strictEqual(desktop1920.sheetFallbacks, 0);
    assert.strictEqual(desktop1920.sheetRows, 3);
    assert.strictEqual(desktop1920.sheetColumns, 3);
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

    await page.evaluate(() => { window.__noteSinglePageSentinel = 23; });
    const noteSecondToc = page.locator('.reader-toc-list a').nth(1);
    await noteSecondToc.click();
    await page.waitForFunction(() => location.hash === '#block-102' && scrollY > 0);
    await page.waitForFunction(() => {
      const target = document.getElementById('block-102');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      return target && target.getBoundingClientRect().top <= topbar + 36;
    });
    const noteScroll = await page.evaluate(() => {
      const target = document.getElementById('block-102');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      return {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        scrollY,
        targetTop: target?.getBoundingClientRect().top || 0,
        topbar,
        activeHref: document.querySelector('.reader-toc-list a.active')?.getAttribute('href') || '',
        sentinel: window.__noteSinglePageSentinel || 0,
      };
    });
    assert.strictEqual(noteScroll.pathname, new URL(url).pathname);
    assert.strictEqual(noteScroll.search, '');
    assert.strictEqual(noteScroll.hash, '#block-102');
    assert.strictEqual(noteScroll.sentinel, 23);
    assert.ok(noteScroll.targetTop >= noteScroll.topbar + 8);
    assert.ok(noteScroll.targetTop <= noteScroll.topbar + 36);
    assert.ok(noteScroll.activeHref.endsWith('#block-102'));
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname + location.search);
      scrollTo(0, 0);
    });
    await page.waitForTimeout(80);

    const splitterBox = await page.locator('[data-reader-splitter]').boundingBox();
    await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 140);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x + splitterBox.width / 2 + 220, splitterBox.y + 140, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const resized = await page.evaluate(() => {
      const wideWrap = document.querySelector('.reader-block--table[data-block-id="306"] .reader-table-wrap');
      return {
        tocWidth: Math.round(document.querySelector('.reader-toc').getBoundingClientRect().width),
        mainWidth: Math.round(document.querySelector('.reader-main').getBoundingClientRect().width),
        textWidth: Math.round(document.querySelector('.reader-block--text').getBoundingClientRect().width),
        tableWidth: Math.round(document.querySelector('.reader-block--table').getBoundingClientRect().width),
        wideWrapWidth: Math.round(wideWrap.getBoundingClientRect().width),
        wideLayout: wideWrap.dataset.tableLayout || '',
        wideOverflow: wideWrap.scrollWidth > wideWrap.clientWidth + 1,
        storedWidth: Number(localStorage.getItem('feishu-notes-toc-width')),
        ariaNow: Number(document.querySelector('[data-reader-splitter]').getAttribute('aria-valuenow')),
      };
    });
    assert.ok(resized.tocWidth >= desktop1920.toc.width + 180);
    assert.ok(resized.mainWidth < desktop1920.main.width - 170);
    assert.ok(Math.abs(resized.textWidth - desktop1920.text.width) <= 2);
    assert.ok(resized.tableWidth < desktop1920.table.width - 170);
    assert.strictEqual(resized.wideLayout, 'clamped');
    assert.strictEqual(resized.wideOverflow, false);
    assert.ok(resized.wideWrapWidth < desktop1920.tableProfiles.shortKey.wrapWidth - 170);
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

    const beforeCollapse = await page.evaluate(() => ({
      mainLeft: Math.round(document.querySelector('.reader-main').getBoundingClientRect().left),
      mainWidth: document.querySelector('.reader-main').getBoundingClientRect().width,
      height: document.documentElement.scrollHeight,
    }));
    await page.click('[data-toc-collapse]');
    await page.waitForTimeout(80);
    const collapsed = await page.evaluate(() => ({
      bodyCollapsed: document.body.classList.contains('toc-collapsed'),
      mainLeft: Math.round(document.querySelector('.reader-main').getBoundingClientRect().left),
      mainWidth: document.querySelector('.reader-main').getBoundingClientRect().width,
      height: document.documentElement.scrollHeight,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.strictEqual(collapsed.bodyCollapsed, true);
    assert.ok(collapsed.mainLeft < beforeCollapse.mainLeft);
    assert.ok(collapsed.mainWidth > beforeCollapse.mainWidth, JSON.stringify(collapsed));
    assert.ok(collapsed.height <= beforeCollapse.height * 1.1, JSON.stringify({ beforeCollapse, collapsed }));
    assert.strictEqual(collapsed.pageOverflow, false);
    await page.reload({ waitUntil: 'networkidle' });
    assert.strictEqual(await page.locator('body').evaluate(element => element.classList.contains('toc-collapsed')), true);
    assert.ok(await page.locator('.reader-main').evaluate(element => element.getBoundingClientRect().width) > beforeCollapse.mainWidth);
    await page.click('[data-toc-collapse]');
    assert.ok(Math.abs(await page.locator('.reader-main').evaluate(element => element.getBoundingClientRect().width) - beforeCollapse.mainWidth) < 1);

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
          cardLayoutCount: document.querySelectorAll('.reader-table-wrap[data-table-layout="card"]').length,
          tableCount: document.querySelectorAll('.reader-table-wrap').length,
        };
      });
      assert.strictEqual(result.pageOverflow, false);
      assert.strictEqual(result.tocToggleVisible, viewport.mobileToc);
      assert.strictEqual(result.tableFits, true);
      assert.strictEqual(result.tableCardMode, viewport.width <= 900);
      assert.strictEqual(result.cardLayoutCount === result.tableCount, viewport.width <= 900);
      responsive.push(result);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    const reportUrl = `http://127.0.0.1:${port}/note/${encodeURIComponent(reportFolder)}/`;
    const reportResponse = await page.goto(reportUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(reportResponse.status(), 200);
    await page.waitForTimeout(120);

    const reportDesktop = await page.evaluate(() => {
      const visible = element => getComputedStyle(element).display !== 'none';
      const articleStyle = getComputedStyle(document.querySelector('.reader-article'));
      const titleStyle = getComputedStyle(document.querySelector('.reader-article-title'));
      const h2 = document.querySelector('.reader-block--heading h2');
      const h3 = document.querySelector('.reader-block--heading h3');
      const tableWrap = document.querySelector('.reader-table-wrap');
      const percentCell = document.querySelector('.reader-percent-cell');
      const flowTrack = document.querySelector('.reader-structured-flow-track');
      const flowNumber = document.querySelector('.reader-structured-flow-number');
      const bodyStyle = getComputedStyle(document.body);
      return {
        structuredReport: document.body.classList.contains('reader-structured-report'),
        dense: document.body.classList.contains('reader-dense-note'),
        mode: document.querySelector('.reader-article')?.dataset.readerMode || '',
        headings: document.querySelectorAll('.reader-block--heading h2[id],.reader-block--heading h3[id]').length,
        tocLinks: document.querySelectorAll('.reader-toc-list a').length,
        visibleTocLinks: [...document.querySelectorAll('.reader-toc-list a')].filter(visible).length,
        primaryTocLinks: document.querySelectorAll('.reader-toc-list .is-toc-primary').length,
        secondaryTocLinks: document.querySelectorAll('.reader-toc-list .is-toc-secondary').length,
        tocScope: document.querySelector('[data-toc-scope-toggle]')?.textContent || '',
        structuredFlowSteps: document.querySelectorAll('.reader-structured-flow-step').length,
        articleFont: parseFloat(articleStyle.fontSize),
        titleFont: parseFloat(titleStyle.fontSize),
        h2Font: parseFloat(getComputedStyle(h2).fontSize),
        h3Font: parseFloat(getComputedStyle(h3).fontSize),
        h2AccentDisplay: getComputedStyle(h2, '::after').display,
        tableShadow: getComputedStyle(tableWrap).boxShadow,
        tableRadius: getComputedStyle(tableWrap).borderRadius,
        percentBackgroundImage: percentCell ? getComputedStyle(percentCell).backgroundImage : '',
        flowShadow: flowTrack ? getComputedStyle(flowTrack).boxShadow : '',
        flowNumberFont: flowNumber ? parseFloat(getComputedStyle(flowNumber).fontSize) : 0,
        bodyBackgroundImage: bodyStyle.backgroundImage,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });

    assert.strictEqual(reportDesktop.structuredReport, true);
    assert.strictEqual(reportDesktop.dense, false);
    assert.strictEqual(reportDesktop.mode, 'structured-report');
    assert.strictEqual(reportDesktop.headings, 13);
    assert.strictEqual(reportDesktop.tocLinks, 13);
    assert.strictEqual(reportDesktop.primaryTocLinks, 4);
    assert.strictEqual(reportDesktop.secondaryTocLinks, 9);
    assert.strictEqual(reportDesktop.visibleTocLinks, 4);
    assert.ok(reportDesktop.tocScope.includes('全部 13'));
    assert.strictEqual(reportDesktop.structuredFlowSteps, 5);
    assert.strictEqual(reportDesktop.articleFont, 16);
    assert.ok(reportDesktop.titleFont <= 38);
    assert.strictEqual(reportDesktop.h2Font, 24);
    assert.strictEqual(reportDesktop.h3Font, 19);
    assert.strictEqual(reportDesktop.h2AccentDisplay, 'none');
    assert.strictEqual(reportDesktop.tableShadow, 'none');
    assert.strictEqual(reportDesktop.tableRadius, '8px');
    assert.strictEqual(reportDesktop.percentBackgroundImage, 'none');
    assert.strictEqual(reportDesktop.flowShadow, 'none');
    assert.strictEqual(reportDesktop.flowNumberFont, 22);
    assert.strictEqual(reportDesktop.bodyBackgroundImage, 'none');
    assert.strictEqual(reportDesktop.pageOverflow, false);

    await page.evaluate(() => {
      const target = document.getElementById('block-r-h3-2-1');
      const topbar = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
      if (target) {
        const top = Math.max(0, scrollY + target.getBoundingClientRect().top - topbar - 10);
        scrollTo({ top, behavior: 'auto' });
      }
    });
    await page.waitForFunction(() =>
      document.querySelector('.reader-toc-list a.active')?.getAttribute('href')?.endsWith('#block-r-h2-2')
    );

    await page.click('[data-toc-scope-toggle]');
    const expandedReportTocCount = await page.evaluate(() =>
      [...document.querySelectorAll('.reader-toc-list a')].filter(link => getComputedStyle(link).display !== 'none').length
    );
    assert.strictEqual(expandedReportTocCount, 13);

    await page.click('[data-theme-toggle]');
    const reportDark = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      background: getComputedStyle(document.body).backgroundColor,
    }));
    assert.strictEqual(reportDark.theme, 'dark');
    assert.notStrictEqual(reportDark.background, 'rgb(255, 255, 255)');
    assert.notStrictEqual(reportDark.background, 'rgba(0, 0, 0, 0)');
    await page.click('[data-theme-toggle]');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(reportUrl, { waitUntil: 'networkidle' });
    const reportMobile = await page.evaluate(() => {
      const firstCard = document.querySelector('.reader-smart-table tbody>tr:not(.reader-table-head-row)');
      const wrap = document.querySelector('.reader-table-wrap');
      const h2 = document.querySelector('.reader-block--heading h2');
      const flowStep = document.querySelector('.reader-structured-flow-step');
      return {
        mode: document.querySelector('.reader-article')?.dataset.readerMode || '',
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        tableCardMode: firstCard ? getComputedStyle(firstCard).display === 'block' : false,
        tableWrapBorder: wrap ? getComputedStyle(wrap).borderTopWidth : '',
        cardShadow: firstCard ? getComputedStyle(firstCard).boxShadow : '',
        h2Font: h2 ? parseFloat(getComputedStyle(h2).fontSize) : 0,
        flowBorderRight: flowStep ? getComputedStyle(flowStep).borderRightWidth : '',
        flowBorderBottom: flowStep ? getComputedStyle(flowStep).borderBottomWidth : '',
      };
    });
    assert.strictEqual(reportMobile.mode, 'structured-report');
    assert.strictEqual(reportMobile.pageOverflow, false);
    assert.strictEqual(reportMobile.tableCardMode, true);
    assert.strictEqual(reportMobile.tableWrapBorder, '0px');
    assert.strictEqual(reportMobile.cardShadow, 'none');
    assert.strictEqual(reportMobile.h2Font, 22);
    assert.strictEqual(reportMobile.flowBorderRight, '0px');
    assert.strictEqual(reportMobile.flowBorderBottom, '1px');

    await page.setViewportSize({ width: 1920, height: 1080 });
    const denseUrl = `http://127.0.0.1:${port}/note/${encodeURIComponent(denseFolder)}/`;
    const denseResponse = await page.goto(denseUrl, { waitUntil: 'networkidle' });
    assert.strictEqual(denseResponse.status(), 200);
    await page.waitForTimeout(120);

    const denseDesktop = await page.evaluate(() => {
      const visible = element => getComputedStyle(element).display !== 'none';
      const promptCard = document.querySelector('.reader-prompt-card.is-collapsed');
      const promptBody = promptCard?.querySelector('.reader-prompt-body') || null;
      const promptMeta = document.querySelector('.reader-prompt-identity span');
      const promptAction = document.querySelector('.reader-prompt-action');
      const commentaryMeta = document.querySelector('.reader-commentary-label span');
      const major = document.querySelector('.reader-heading-major h2,.reader-heading-major h3');
      const note = document.querySelector('.reader-heading-note h2,.reader-heading-note h3');
      const long = document.querySelector('.reader-heading-long:not(.reader-commentary-item) h2,.reader-heading-long:not(.reader-commentary-item) h3');
      const mediaGrid = document.querySelector('.reader-block--media.is-media-grid');
      const mediaImage = mediaGrid?.querySelector('.reader-image,.reader-video') || null;
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
        promptCardShadow: promptCard ? getComputedStyle(promptCard).boxShadow : '',
        promptCardRadius: promptCard ? getComputedStyle(promptCard).borderRadius : '',
        promptFadeHeight: promptCard ? parseFloat(getComputedStyle(promptCard, '::after').height) : 0,
        promptMetaColor: promptMeta ? getComputedStyle(promptMeta).color : '',
        promptActionColor: promptAction ? getComputedStyle(promptAction).color : '',
        commentaryMetaColor: commentaryMeta ? getComputedStyle(commentaryMeta).color : '',
        headingMedia: document.querySelectorAll('.reader-heading-media .reader-media--image').length,
        visibleImages: [...document.querySelectorAll('.reader-content img[data-reader-zoomable]')].filter(image => image.getBoundingClientRect().width > 0).length,
        mediaGridCount: document.querySelectorAll('.reader-block--media.is-media-grid').length,
        mediaGridPadding: mediaGrid ? getComputedStyle(mediaGrid).padding : '',
        mediaGridBorder: mediaGrid ? getComputedStyle(mediaGrid).borderTopWidth : '',
        mediaGridBackground: mediaGrid ? getComputedStyle(mediaGrid).backgroundImage : '',
        mediaImageShadow: mediaImage ? getComputedStyle(mediaImage).boxShadow : '',
        sheetFallback: document.querySelectorAll('.reader-sheet-fallback').length,
        sheetFallbackVisible: Boolean(document.querySelector('.reader-sheet-fallback')?.getBoundingClientRect().width),
        majorFont: major ? parseFloat(getComputedStyle(major).fontSize) : 0,
        majorAccentDisplay: major ? getComputedStyle(major, '::after').display : '',
        noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : 0,
        longFont: long ? parseFloat(getComputedStyle(long).fontSize) : 0,
        longBackground: long ? getComputedStyle(long).backgroundColor : '',
        longRadius: long ? getComputedStyle(long).borderRadius : '',
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
    assert.ok(denseDesktop.promptBodyHeight >= 219 && denseDesktop.promptBodyHeight <= 221);
    assert.ok(denseDesktop.promptBodyScrollHeight > denseDesktop.promptBodyHeight);
    assert.strictEqual(denseDesktop.promptCardShadow, 'none');
    assert.strictEqual(denseDesktop.promptCardRadius, '10px');
    assert.ok(denseDesktop.promptFadeHeight >= 35 && denseDesktop.promptFadeHeight <= 37);
    assert.strictEqual(denseDesktop.promptMetaColor, denseDesktop.promptActionColor);
    assert.strictEqual(denseDesktop.commentaryMetaColor, denseDesktop.promptActionColor);
    assert.strictEqual(denseDesktop.headingMedia, 1);
    assert.ok(denseDesktop.visibleImages >= 4);
    assert.ok(denseDesktop.mediaGridCount >= 1);
    assert.strictEqual(denseDesktop.mediaGridPadding, '0px');
    assert.strictEqual(denseDesktop.mediaGridBorder, '0px');
    assert.strictEqual(denseDesktop.mediaGridBackground, 'none');
    assert.strictEqual(denseDesktop.mediaImageShadow, 'none');
    assert.strictEqual(denseDesktop.sheetFallback, 1);
    assert.strictEqual(denseDesktop.sheetFallbackVisible, true);
    assert.ok(denseDesktop.majorFont <= 24);
    assert.strictEqual(denseDesktop.majorAccentDisplay, 'none');
    assert.ok(denseDesktop.noteFont <= 18);
    assert.ok(denseDesktop.longFont <= 16.5);
    assert.ok(denseDesktop.longBackground.includes('0, 0, 0, 0'));
    assert.strictEqual(denseDesktop.longRadius, '0px');
    assert.strictEqual(denseDesktop.pageOverflow, false);

    await page.click('[data-toc-scope-toggle]');
    const expandedTocCount = await page.evaluate(() =>
      [...document.querySelectorAll('.reader-toc-list a')].filter(link => getComputedStyle(link).display !== 'none').length
    );
    assert.strictEqual(expandedTocCount, 22);

    await page.click('[data-theme-toggle]');
    const denseDark = await page.evaluate(() => {
      const prompt = document.querySelector('.reader-prompt-card');
      const body = getComputedStyle(document.body);
      const promptStyle = prompt ? getComputedStyle(prompt) : null;
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        bodyBackground: body.backgroundColor,
        promptBackground: promptStyle?.backgroundColor || '',
        promptBorder: promptStyle?.borderTopColor || '',
      };
    });
    assert.strictEqual(denseDark.theme, 'dark');
    assert.notStrictEqual(denseDark.promptBackground, denseDark.bodyBackground);
    assert.notStrictEqual(denseDark.promptBorder, 'rgba(0, 0, 0, 0)');
    await page.click('[data-theme-toggle]');

    const firstPromptToggle = page.locator('.reader-prompt-toggle').first();
    await firstPromptToggle.click();
    assert.strictEqual(await firstPromptToggle.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(await page.locator('.reader-prompt-card').first().evaluate(element => element.classList.contains('is-collapsed')), false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(denseUrl, { waitUntil: 'networkidle' });
    const denseMobile = await page.evaluate(() => {
      const action = document.querySelector('.reader-prompt-action');
      const body = document.querySelector('.reader-prompt-card.is-collapsed .reader-prompt-body');
      return {
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        docWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        visibleImages: [...document.querySelectorAll('.reader-content img[data-reader-zoomable]')].filter(image => image.getBoundingClientRect().width > 0).length,
        sheetFallbackVisible: Boolean(document.querySelector('.reader-sheet-fallback')?.getBoundingClientRect().width),
        promptActionHeight: action ? Math.round(action.getBoundingClientRect().height) : 0,
        promptBodyHeight: body ? Math.round(body.getBoundingClientRect().height) : 0,
      };
    });
    assert.strictEqual(denseMobile.pageOverflow, false);
    assert.strictEqual(denseMobile.docWidth, denseMobile.width);
    assert.ok(denseMobile.visibleImages >= 4);
    assert.strictEqual(denseMobile.sheetFallbackVisible, true);
    assert.ok(denseMobile.promptActionHeight >= 40);
    assert.ok(denseMobile.promptBodyHeight >= 219 && denseMobile.promptBodyHeight <= 221);

    console.log(JSON.stringify({ ok: true, desktop1920, collapsed, imageDialog, responsive, reportDesktop, reportDark, reportMobile, denseDesktop, denseDark, denseMobile }, null, 2));
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
