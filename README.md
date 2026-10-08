# feishu-notes

本地飞书笔记归档与离线阅读工具。

它把**当前飞书账号有权访问的文档**保存为本地 Markdown、HTML 和媒体文件，并提供一个本地浏览器入口统一阅读。完整归档后，即使退出飞书、原链接失效或电脑断网，本地文章仍可阅读和播放已下载的视频。

> 项目入口说明：`http://127.0.0.1:4173` 不是静态网页，必须先启动本地 Viewer 服务。

## 最常用的方式

### 1. 打开本地笔记库

Windows 下双击项目根目录的：

```text
service.bat
```

推荐选择：

```text
5. Start viewer and open browser
```

它会在后台启动 Viewer，并打开：

```text
http://127.0.0.1:4173
```

也可以在命令行执行：

```bat
service.bat start-open
```

常用服务命令：

```bat
service.bat start
service.bat stop
service.bat restart
service.bat status
service.bat open
service.bat start-open
```

Viewer 日志写入：

```text
data/logs/viewer.log
data/logs/viewer.log.err
```

### 2. 保存一篇飞书文章

命令行：

```bash
node src/cli.js capture "<飞书文档URL>" --profile default
```

例如不同账号可以使用不同 Profile：

```bash
node src/cli.js capture "<飞书文档URL>" --profile work
node src/cli.js capture "<飞书文档URL>" --profile personal
```

第一次使用某个 Profile 时，会打开该 Profile 专属的 Chrome 窗口。用户只需要在这个窗口登录一次飞书；之后登录状态保存在：

```text
data/profiles/<profile>/
```

这些 Profile 数据不会进入 Git。

如果平时通过 AI Agent 使用本项目，也可以直接把飞书链接交给 Agent，让 Agent 在本项目中执行 capture 流程。

## 项目能做什么

- 保存有权限访问的飞书文档。
- 处理飞书长文档的虚拟滚动/懒加载。
- 按稳定 Block ID 收集正文结构，而不是简单复制当前屏幕文本。
- 输出 Markdown。
- 输出经过清理和消毒的离线 HTML。
- 下载图片、视频和支持的本地媒体。
- 将文章中的媒体地址改写成本地相对路径。
- 在单篇文章内按 SHA-256 内容去重重复媒体；相同视频只保留一份物理文件，但保留文章中的全部出现位置。
- 在下载大量媒体前做数量与体积预检。
- 支持多个相互隔离的飞书账号 Profile。
- 提供自适应 Reader：长文目录、阅读进度、明暗主题、响应式布局、可折叠 TOC。
- Desktop 在 TOC 与正文之间提供可拖动 Splitter：目录宽度可在安全范围内调整、双击复位、键盘左右键微调，并自动记忆。
- 正文不再固定为 760px；桌面端采用自适应阅读列：普通正文在约 880–960px 的舒适阅读范围内流动，表格、图片、视频等宽内容可使用 Splitter 留出的更大空间，并保持统一左基准线。
- 取消“大白纸”容器视觉，改为透明 Reader Canvas；章节、表格、引用、代码、链接、媒体组等通过局部 Reading Enhancement CSS 建立阅读层次。
- 同一个 Media Block 内的多个媒体允许自动 Grid；绝不跨 Block 重排媒体。
- 正文视频按原始横/竖比例自适应；表格视频使用约 32px 高的“播放图标 + 视频”紧凑触发器，表格图片使用小缩略图触发器；这些媒体统一进入 Media Dialog，视频由用户点击后自动开始播放。
- 正文图片限制显示尺寸并支持点击放大；图片与视频共用透明背景的媒体弹窗，可用 Esc 或点击媒体外空白区域退出。
- 桌面表格采用 Excel 式 AutoFit / Clamp：先由浏览器测量最终内容的自然列宽，能放下时按内容宽度显示；超过 Reader 可用宽度时才铺满并按各列可压缩空间重新分配。列名、第一列、字符数、列数以及 numeric / percent / status / media 等语义类型都不再参与宽度决策；复杂合并单元格保守回退原生 auto layout。窄屏统一转换为带字段标签的记录卡，不依赖横向滚动条。
- Original Reader 会根据通用结构信号自动区分 Long-form / Structured Report / Dense Note。Dense Note 在信号重叠时优先；Structured Report 面向多章节、多表格/列表、短解释块型报告，H2 默认进入精简目录，H3/H4 可通过“全部”展开，并采用低视觉噪声 Reading Visual Grammar，以排版和留白建立层级、弱化表格/Flow/Tier 的卡片感，同时继续复用既有 AutoFit / Clamp、Splitter、媒体与移动端记录卡机制。
- Dense Note 面向高标题密度/Prompt-heavy 技术笔记：保留源语义不变，但视觉上把标题分成章节、知识点、长笔记，并默认只显示精简目录；长 Prompt 使用可换行、可折叠、可复制的 Prompt Card。连续的一句话式讲解记录可自动进入 Commentary Stream，但不虚构发言人、时间戳或聊天回复关系；章节、媒体、代码、表格和嵌入内容会主动断开记录流。
- 原文深度拆解支持 `:::case` 案例组件；Prompt Library 采用“一案例一个外框”，案例标题、摘要、标签、拆解、Prompt 结构、关键约束与完整 Prompt 都在同一 Case 内，Prompt 区只用分隔线/浅背景，不再形成第二张卡。视频与 Prompt 只有原文存在明确关系时才绑定，否则分别保留为 Video Gallery 与 Prompt Library。
- 图片-only Block 不再被误判为空；Heading 附带媒体继续保留；飞书内嵌 Sheet 会优先通过已登录页面的复制/剪贴板 HTML 提取为真实二维表格并离线保存，抓取后恢复原剪贴板；只有提取失败时才显示明确的 fallback。
- 对暂未识别的未来 Block 使用保守降级：优先保留文本或媒体，避免静默丢内容。
- 本地视频支持 HTTP Range，可在浏览器拖动播放进度。
- 可选建立 `explain/` 派生深度拆解层：技术目录与路由继续使用 Explain 命名，公开 UI 统一称“原文深度拆解”；保留原始归档不变，Viewer 首页以“进入深度拆解”为主入口、“查看原始文章”为次入口。
- 公开深度拆解内容使用 `explain/chapters/manifest.json + chapters/*.md`：章节 Markdown 继续分文件维护，但 Viewer 会按 manifest 顺序把全部 `ready` 章节合并成一篇从上到下的长页面，不再使用上一章/下一章或 `?chapter=` 分页。桌面左侧章节导航与窄屏顶部章节选择都只在当前页面滚动到对应锚点，并随手动滚动同步当前章节；旧 `?chapter=<id>` 链接兼容跳转到对应 `#chapter-<id>`。结构完整的原报告默认保留原维度顺序，并可使用受控的视觉语义块（对照、数据、流程、比较、分类、总结）减少连续长文阅读压力。
- Explain 证据链以视频 `contentHash` 为唯一身份，ASR、关键帧、案例等内部素材均可回溯到原始媒体及 Block 位置。
- Viewer 首页、原始文章与原文深度拆解统一使用单个亮/暗切换按钮，并通过 `feishu-notes-theme` 在本机持久化。
- 清理 Chrome 可重建缓存，同时保留登录状态。
- 输出格式不绑定 Obsidian；其它 Markdown 工具也可以读取。

## 离线归档结构

每篇文章保存在：

```text
library/<文章目录>/
├─ <文章标题>.md
├─ article.html
├─ archive.json
└─ assets/
   ├─ images/
   └─ videos/
```

其中：

- Markdown：通用笔记格式。
- `article.html`：项目 Viewer 使用的离线阅读页面。
- `archive.json`：归档状态、来源、媒体完整性等机器可读信息。
- `assets/`：本地图片和视频。物理文件采用 `sha256-<content-hash>.<ext>` 的内容寻址命名，单篇文章内重复内容只保存一次。

`library/` 是唯一正式资料库（single source of truth）。

### 逻辑媒体与物理文件

飞书可能为同一段视频生成不同的媒体 ID 和下载 URL。项目不会只按 URL/文件名判断重复，而是在媒体落盘后计算 SHA-256：

- **逻辑媒体**：保留每个原文出现位置、Block 关系、媒体 ID 和尺寸；
- **物理资产**：相同内容只保留一份 canonical 文件；
- `archive.json` v2 会记录 `contentHash`、`duplicateOf`、逻辑/物理媒体数量及去重节省空间；
- V1 只做**单篇文章内部去重**，不建立跨文章的全局媒体池，保证每篇归档可独立移动和删除。

## 媒体预检与大文件保护

默认软限制位于 `config/default.json`：

- 单个媒体文件超过 300 MB：提醒。
- 已知媒体总量超过 1 GB：提醒。
- 媒体文件超过 40 个：提醒。
- 存在未知大小媒体：提醒。

触发软限制时，不会静默跳过，也不会直接开始大批量下载。确认后可执行：

```bash
node src/cli.js capture "<飞书文档URL>" --profile default --confirm-large
```

归档状态：

- `complete`：要求保存的媒体全部本地化。
- `partial`：有媒体失败或被跳过。
- `pending_confirmation`：媒体预检触发软限制，等待确认。

已有 `complete` 归档不会因为后续一次预检警告而被降级。

## Profile 缓存维护

飞书登录状态和浏览器缓存都位于 Profile 内，但项目严格区分二者。

关闭该 Profile 的专用 Chrome 后执行：

```bash
node src/cli.js cleanup --profile default
```

或：

```bash
npm run cleanup -- --profile default
```

Cleanup 只删除项目白名单中的可重建缓存。Cookies、Local Storage、IndexedDB、Network state 等认证/会话数据不在清理列表中。

## 项目目录

```text
feishu-notes/
├─ service.bat              # Windows Viewer 服务入口
├─ src/                     # 程序源码
├─ config/                  # 默认配置 + 本机配置模板
├─ secrets/                 # 本地凭据模板
├─ data/
│  ├─ profiles/             # 飞书账号 Chrome Profile
│  ├─ cache/
│  ├─ state/
│  ├─ tmp/
│  └─ logs/
├─ library/                 # 唯一正式离线资料库
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ PROJECT-HANDBOOK.md
├─ AGENTS.md                # Agent 接手必须遵守的规则
├─ package.json
└─ README.md
```

## 本机配置与敏感信息

允许本机存在：

```text
config/local.json
secrets/credentials.local.json
data/profiles/
```

但这些文件/目录全部被 Git 忽略。

仓库只提交：

```text
config/local.example.json
secrets/credentials.example.json
```

禁止在源码、README、架构文档或默认配置中写入：

- 用户机器绝对路径；
- Cookie；
- Token；
- 密码；
- API Key；
- 私有飞书文档 URL；
- 某个用户专属 Obsidian 路径。

## Obsidian 与其它笔记软件

Obsidian **不是项目依赖**。

`library/` 使用普通 Markdown + 相对本地资源，因此可以：

- 用项目 Viewer 阅读；
- 用 Obsidian 阅读；
- 用 Typora / VS Code 等工具读取。

如果某个用户希望让 Obsidian 直接看到这些文件，可以自行通过操作系统目录链接将 `library/` 暴露到自己的 Vault。项目代码不记录或管理该用户的 Obsidian 路径。

浏览器 Reader 与 Obsidian 的 CSS 运行时保持独立。其它 CSS 仓库可以作为视觉参考，但不是 Viewer 依赖。

### 本机 Reader CSS 覆盖

可选创建：

```text
data/styles/reader.user.css
```

如果文件存在，Viewer 会在官方 `reader.css` 之后加载它。该文件被 Git 忽略，适合本机调整字体、颜色、间距、圆角、媒体尺寸等个人视觉偏好；不要用它改变 Reader DOM 契约或隐藏关键功能。

## Reader 回归验证

修改 Reader、媒体布局或 Viewer 后运行：

```bash
npm run verify:reader
```

该测试使用项目内临时 fixture，不依赖真实飞书文档，覆盖：

- 9:16、16:9、1:1、4:3 视频布局；
- standalone 与 table-cell 两种媒体上下文；
- 同一 Media Block 多媒体 Grid，且不跨 Block 重排；
- 表格视频转约 32px 高的图标/文字触发器，表格图片转小缩略图触发器，正文视频也作为统一媒体触发器；
- 透明 Media Dialog、视频点击后自动播放、Esc/空白区域关闭与焦点返回；
- 原始文章中的结构化伪代码可自动识别为 Flow / Tier；重复标题继续使用稳定 Block Anchor；
- 三模式 fixture 分别锁定 Long-form / Structured Report / Dense Note：Structured Report 专项覆盖通用结构判定、Dense Note 优先级、H2 primary + H3/H4 secondary Smart TOC、精简/全部切换与 secondary ScrollSpy 回退；Dense Note 专项继续覆盖高标题密度、长 URL、Prompt Card、Heading 附图、图片-only Block 与 Sheet fallback；
- 1920 / 1440 / 1366 / 390 四档视口均不得出现页面级横向溢出；Smart Table 回归覆盖短表自然收宽、长表超宽后 Clamp、长句内含百分号不误判、短编号列不抢宽、合并单元格原生 fallback、Splitter 改宽后重新适配，以及 390px 下全部转为记录卡；Structured Report 还要验证低噪声桌面表格、移动端记录卡、纵向 Flow 和暗色模式；
- Dense Note 回归另外锁定 Quiet Pass：折叠 Prompt 保持约 220px 预览、无装饰性阴影、Major 不重复使用短强调线、Long Note 与 Media Grid 保持轻量 Surface、Meta 使用可读对比度，390px Prompt 操作按钮保持约 40px 触控高度，并验证暗色模式及 Explain Prompt 样式不受 Dense Note 局部覆盖影响；
- TOC 靠左、折叠状态、Splitter 拖动/持久化/双击复位，以及正文随剩余空间流式变化；
- 大白 Paper 已取消；Long-form 保持既有 Reading Enhancement，Structured Report 与 Dense Note 都遵循低视觉噪声 Reading Visual Grammar，但 Dense Note 继续保留知识点 / Prompt / Commentary 的功能语义；原文深度拆解的 `hero / split / metrics / flow / compare / cards / case / takeaway` 语义块也必须正常渲染且不造成页面级横向溢出；Prompt Case 必须保持单外框结构；
- 未识别 Block 的文本 fallback。

## 开发与接手

开发者或 AI Agent 接手本项目时，先阅读：

1. `AGENTS.md`
2. `docs/PROJECT-HANDBOOK.md`
3. `docs/ARCHITECTURE.md`
4. `README.md`

详细项目边界、操作流程、测试规则和不可破坏约束见 `docs/PROJECT-HANDBOOK.md`。
