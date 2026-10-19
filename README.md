# feishu-notes

本地飞书笔记归档与离线阅读工具。

它把**当前飞书账号有权访问的文档**保存为本地 Markdown、HTML 和媒体文件，并提供一个本地浏览器入口统一阅读。完整归档后，即使退出飞书、原链接失效或电脑断网，本地文章仍可阅读和播放已下载的视频。

> 项目入口说明：`http://127.0.0.1:4173` 不是静态网页，必须先启动本地 Viewer 服务。

## 第一次使用（Windows x64 便携包）

下载入口：[v0.1.1 Windows x64 预发布](https://github.com/ZiYao00/feishu-notes/releases/tag/v0.1.1)。在 **Assets** 中选择 `feishu-notes-0.1.1-windows-x64.zip`，同时下载 `SHA256SUMS.txt` 用于校验。GitHub 自动生成的 `Source code (zip)` / `Source code (tar.gz)` 仅含源码，不包含 Node 和依赖。

当前仓库为私有仓库，下载需要登录具有仓库访问权限的 GitHub 账号。本次 v0.1.1 为预发布：在 v0.1.0 便携交付基础上新增 V3 归档保真与安全预览修复，并通过本机自动回归；既有 Windows 10 x64 独立安装、便携包、离线播放与迁移证据属于 v0.1.0，v0.1.1 的实际 ZIP 仍需独立核验。真实新电脑/干净 Windows 系统及全新 Profile 首次飞书登录/抓取仍待验收。

便携 ZIP 包含 Node.js 运行时及锁定的 npm 依赖，无需安装 Node.js、npm 或 Git。包内没有文章、飞书账号、登录状态或本机配置。源码仓库本身不包含运行时和依赖，不能将源码 ZIP 当作便携包。

解压前可在 ZIP 下载目录执行以下命令，将输出的 Hash 与 `SHA256SUMS.txt` 中的值比较，忽略字母大小写：

```powershell
Get-FileHash .\feishu-notes-0.1.1-windows-x64.zip -Algorithm SHA256
```

1. 将完整便携 ZIP 解压到自己有写入权限的目录，不在压缩包内直接运行。路径可包含中文和空格；不要放在需要管理员写入权限的系统目录。
2. 双击 `service.bat`，选择菜单 5，或在该目录 PowerShell 执行 `.\service.bat start-open`。服务启动后打开 `http://127.0.0.1:4173/`。新安装显示空资料库是正常现象。
3. 需要采集时，先安装 [Google Chrome](https://www.google.com/chrome/)，然后执行 `.\notes.bat check`。阅读已有本地归档可使用其它浏览器，不依赖 Chrome 或飞书登录。`check` 只检查 Chrome 和本地目录，不验证账号权限或归档完整性。
4. 保存第一篇文章：

```powershell
.\notes.bat capture "<飞书文档URL>" --profile default
```

如果输出 `LOGIN_REQUIRED`，在新打开的专用 Chrome 窗口正常登录飞书，然后**重跑同一条 capture 命令**。日常 Chrome 的登录状态不会自动复制到这个 Profile。输出 `PERMISSION_DENIED` 时，确认文档已向该账号授权，或使用另一个有权限的 Profile。媒体软限制触发时，确认后才使用 `--confirm-large`。

抓取结束检查输出的 `Archive status`，再刷新首页：`complete` 表示要求保存的媒体已本地化；`partial` 表示存在失败/跳过，需要查看该文章 `archive.json`；`pending_confirmation` 表示预检等待确认。原始文章自动生成；“原文深度拆解”需要单独维护，不会自动生成完整分析。

`notes.bat` 与 `service.bat` 优先使用包内 `runtime/node.exe`，不修改系统 PATH。下文 CLI 示例统一使用 `notes.bat`；便携包不附带 npm，日常使用无需 npm。默认配置即可运行，不必创建 `config/local.json` 或填写 Secrets。

### 开发者从源码安装

从 [Node.js 官方下载页](https://nodejs.org/en/download)安装 **Node.js 24 LTS**，然后重新打开终端，在完整源码根目录执行：

```powershell
node --version
npm.cmd --version
npm.cmd ci
.\service.bat start-open
```

源码首次安装需要联网，采用 [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) 与随源码的锁文件。PowerShell 使用 `npm.cmd` 可避免 `npm.ps1` 执行策略问题。`npm ci` 在已有依赖目录中会重新安装依赖，不是日常启动命令。实际独立安装验证为 Node.js 24.21.0 / npm 11.19.0；依赖下限为 Node.js 22.12.0，较旧版本会被入口拒绝，其它版本不作为已验收承诺。源码入口 `notes.bat` 在没有包内 Node 时使用系统 Node。

## 启动排错与迁移

| 现象 | 处理方式 |
| --- | --- |
| Release 页面/附件无法访问 | 登录有仓库访问权限的 GitHub 账号；仓库当前为私有仓库 |
| 便携包缺少 `runtime/node.exe` 或依赖 | 重新解压完整便携 ZIP 到新目录；不要只复制 BAT 或源码。源码安装则安装 Node.js 24 LTS，再运行 `npm.cmd ci` |
| Viewer 无法启动 | 查看终端提示及 `data/logs/viewer.log.err`；确认目录可写、ZIP 完整 |
| npm 网络下载失败（源码安装） | 检查到 npm registry 的访问，保留锁文件并重试 |
| 系统 Chrome 未找到 | 采集需要安装 Chrome；非标准路径可通过 `config/local.json` 的 `browser.chromePath` 指定，JSON 使用 UTF-8 无 BOM，Windows 路径反斜杠需转义 |
| 端口被其它程序占用 | 在 `config/local.json` 设置 `viewer.port`，再启动；服务脚本不会停止无关进程 |
| 页面为空 / 找不到文章 | 先 capture 或迁入完整文章目录，而非只复制 Markdown |

自定义端口示例（新建或合并到 `config/local.json`，勿覆盖已有其它设置）：

```json
{"viewer":{"port":4174}}
```

`service.bat` 的启动、状态、重启和打开均读取同一配置，显示实际 URL。修改配置前先停止本项目 Viewer，再改端口并启动。手动前台启动也可使用 `.\notes.bat serve --port 4174`，该终端用 Ctrl+C 停止；临时 CLI 参数不会写回配置，BAT 只管理配置中的端口。

换电脑时，在新电脑解压便携包，将旧电脑 **完整 `library/`** 复制到新项目（包含 Markdown、HTML、`archive.json`、`assets/` 和可选 `explain/`）。已有文章无需飞书登录即可阅读；继续抓取需要安装 Chrome，并在新电脑专用 Profile 重新登录。不要把旧电脑的 Chrome Profile 当作可跨电脑复用的登录凭据；本机配置中的绝对路径也需要重新检查。

升级时先停止旧 Viewer，备份资料库和本机配置，再将新包解压到独立目录并迁入资料库；保留旧目录便于回退。不要直接解压覆盖私有数据。跨电脑迁移与首次登录仍需真实目标电脑验收，当前本机隔离测试不能代替这个步骤。

## Agent / ChatGPT 网页版使用

Canonical Skill 在 `skill/feishu-notes/`，不包含 Chrome 登录状态、归档资料库或 Node.js 运行时。ChatGPT 网页端通过已授权的 CodexPro 连接 Windows 工作区；Codex、Hermes、WorkBuddy 可按各自 Skill 安装机制读取同一规范，并使用本地 CLI。网页安装 Skill 不等于取得本机磁盘访问权限。

Agent 首先检查本地是否有同一篇文章：

```powershell
node scripts/agent-capture.js inspect "<飞书文档URL>"
```

只有目标没有归档时才运行安全采集：

```powershell
node scripts/agent-capture.js capture "<飞书文档URL>" --profile default
```

包装脚本输出 `AGENT_CAPTURE_RESULT` JSON。默认拒绝覆盖已有 `complete` 归档。媒体数量软预警为 **100 个**，单文件 300 MiB / 已知合计 1 GiB 的原有预警保留。对 `pending_confirmation` 或 `partial`，明确确认后才允许文件级安全续采：

```powershell
node scripts/agent-capture.js resume "<飞书文档URL>" --profile default --confirm-unknown
```

`--confirm-unknown` 仅确认未知媒体大小，不会解除真实传输的单文件/任务总量硬预算。若还有其它媒体软预警，应先复核，再单独授权使用 `--confirm-large`。`resume` 会重新验证文末与正文版本，只下载未通过 SHA-256 校验的资产，全部成功后备份并发布原文的本地媒体路径；不会重新编写文章正文、清理旧媒体或更新 Explain 章节。文档源版本改变时立即停止。此版本支持**文件级重试**，不支持 HTTP 字节级断点续传。

共享锁 `data/state/capture-global.lock` 由传统 CLI 与 Agent 一起使用；额外 `agent-capture.lock` 只约束 Agent 入口。未完成/失效的锁必须先核实进程归属，禁止自动删除。续采进度记录保存在 `data/state/`，回滚副本位于 `data/backups/`，二者都不是 Git 源码或 Skill ZIP 的一部分。

验证入口：`node scripts/verify-agent-capture.js` 和 `node scripts/verify-agent-resume.js`；Reader 回归按 AGENTS.md 设置 `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1`。完整规范见 `AGENTS.md`、`docs/PROJECT-HANDBOOK.md`、`docs/ARCHITECTURE.md`，Explain 另见 `docs/EXPLAIN-WORKFLOW.md`。下载本身不会生成 Explain 章节。

## 飞书长文档的来源保真与完成标准

**V3 工程阶段收尾与后续 Agent 接手：**见 [V3 阶段收尾记录](docs/V3-CLOSEOUT.md)。代码阶段可以收尾，但每篇文章的媒体、受限附件和来源验证仍需单独通过质量门禁，不能因为工程提交完成而宣称文章完整。

**V3 交付契约：**请先阅读 [归档保真、验收与安全发布规范](docs/ARCHIVE-QUALITY-V3.md)。`status=complete` 或命令成功不等于完整交付。使用 `node scripts/candidate-report.js <文档ID>` 查看当前物理资源和质量结果，使用 `node scripts/verify-candidate-reader.js <文档ID> [run]` 在本地生成与 HTML/Markdown/Manifest 哈希绑定的 Reader 验收记录。发布前检查原归档的 SHA-256 基线；中断事务会让 Reader 返回 503，禁止自行删除发布 Marker 或修改旧 Explain。`partial_verified` 必须获得单独发布授权。若需要核对完整正文但旧候选已有部分资源，可仅在私有候选空间使用 `node scripts/build-provisional-media-preview.js <文档ID> <旧live运行ID>`：新来源必须已完整扫描，旧媒体 SHA-256 和父 `recordId` 必须唯一匹配；这只是历史媒体隔离预览，`unverified` 不会被解除，也不得自动覆盖正式库。前端案例分组保留所有未下载媒体占位，专项回归为 `node scripts/verify-pending-media-reader.js`。

`pending_confirmation`、`partial` 和 CLI 测试通过都不等于整篇文章完整交付。新采集额外写入 `archive.json.quality`，用于追踪已扫描 Block、实际转换、空块、可见受限附件、未处理资源和 Sheet 错误；旧版 `complete` 不自动视作已通过这套质量认证。

飞书嵌入文件（如 ZIP、RAR、MD、HTML）可能属于 `docx-view-block`，与可播放图片/视频不同。若当前账号的飞书预览窗口把下载按钮设为禁用，程序不会通过隐藏 API 绕过限制，而是保留文件名和原文位置，并标记 `unresolved`。真正下载的媒体需有可校验本地文件与相应哈希。

执行正式修复前可先用 `node scripts/audit-source.js "<飞书链接>"` 备份原始三文件并生成私有结构化快照，再在 `data/tmp/archive-candidates/` 隔离制作候选；不默认覆盖 `library/`。新版备份使用原始字节 SHA-256；旧版错误保存的 Buffer-JSON 摘要由 `node scripts/verify-source-protection.js <文档ID>` 兼容核验，但必须同时校对备份与正式文件逐字节一致。保护逻辑可用 `node scripts/verify-source-protection-regression.js` 离线测试。对内容缺失的真实文章，先查采集和结构转换，再处理媒体。桌面与窄屏离线 Reader 都必须实测通过，才能宣布完整交付。源文档与本地快照、用户浏览器的授权数据不会进入 Skill ZIP。

### 查看隔离候选归档（不影响正式资料库）

在 Windows 项目根目录双击 `preview-candidate.bat`，会启动只监听 `127.0.0.1:4174` 的候选 Reader。浏览器打开 `http://127.0.0.1:4174/` 即可查看最新受控候选；关闭命令窗口或按 Ctrl+C 可结束预览。该入口只读取 `data/tmp/archive-candidates/`，**不会覆盖** `library/` 原文或 Explain；候选仍可能显示 `partial` 和未下载附件/媒体，请以其质量报告为准。

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

```powershell
.\service.bat start-open
```

常用服务命令：

```powershell
.\service.bat start
.\service.bat stop
.\service.bat restart
.\service.bat status
.\service.bat open
.\service.bat start-open
```

Viewer 日志写入：

```text
data/logs/viewer.log
data/logs/viewer.log.err
```

### 2. 保存一篇飞书文章

命令行：

```powershell
.\notes.bat capture "<飞书文档URL>" --profile default
```

例如不同账号可以使用不同 Profile：

```powershell
.\notes.bat capture "<飞书文档URL>" --profile work
.\notes.bat capture "<飞书文档URL>" --profile personal
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
- 原文深度拆解优先连续文档阅读；分类和重复字段采用列表或轻表格，真实顺序保留 Flow，视频与 Prompt 案例库保留播放、复制和展开的功能容器。组件选择及阅读验收以 `docs/EXPLAIN-WORKFLOW.md` 为准。
- 原始文章和原文深度拆解的独立版块共用 60px 留白；普通段落与案例内部维持紧凑阅读节奏。桌面目录收起后正文占据剩余宽度，不再挤入窄列导致页面异常增高。Case 分析正文采用 16px，元信息保持次级层次。
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
- 媒体文件超过 100 个：提醒。
- 存在未知大小媒体：提醒。

触发软限制时，不会静默跳过，也不会直接开始大批量下载。确认后可执行：

```powershell
.\notes.bat capture "<飞书文档URL>" --profile default --confirm-large
```

归档状态：

- `complete`：要求保存的媒体全部本地化。
- `partial`：有媒体失败或被跳过。
- `pending_confirmation`：媒体预检触发软限制，等待确认。

已有 `complete` 归档不会因为后续一次预检警告而被降级。

## Profile 缓存维护

飞书登录状态和浏览器缓存都位于 Profile 内，但项目严格区分二者。

关闭该 Profile 的专用 Chrome 后执行：

```powershell
.\notes.bat cleanup --profile default
```

源码安装也可使用 `npm.cmd run cleanup -- --profile default`。

Cleanup 只删除项目白名单中的可重建缓存。Cookies、Local Storage、IndexedDB、Network state 等认证/会话数据不在清理列表中。

## 项目目录

```text
feishu-notes/
├─ service.bat              # Windows Viewer 服务入口
├─ notes.bat                # CLI 入口，优先使用包内 Node
├─ runtime/                 # 便携包内 Node 与第三方许可（源码仓库忽略）
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
data/backups/
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

```powershell
$env:FEISHU_NOTES_VERIFY_KEEP_FIXTURE = '1'
npm.cmd run verify:reader
```

该测试需要系统 Chrome，使用项目内临时 fixture，不依赖真实飞书文档。上述环境变量保留测试数据于 `data/tmp/`，避免自动递归清理。覆盖：

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
- 桌面 TOC 收起后的正文宽度与页面高度、60px 版块间距、Compare 语义表格字段与窄屏标签，以及 Explain Case 正文字号、元信息层级、结构列表和手机暗色阅读；
- 大白 Paper 已取消；Long-form 保持既有 Reading Enhancement，Structured Report 与 Dense Note 都遵循低视觉噪声 Reading Visual Grammar，但 Dense Note 继续保留知识点 / Prompt / Commentary 的功能语义；原文深度拆解的 `hero / split / metrics / flow / compare / cards / case / takeaway` 语义块也必须正常渲染且不造成页面级横向溢出；Prompt Case 必须保持单外框结构；
- 未识别 Block 的文本 fallback。

## 开发与接手

开发者或 AI Agent 接手本项目时，先阅读：

1. `AGENTS.md`
2. `docs/PROJECT-HANDBOOK.md`
3. `docs/ARCHITECTURE.md`
4. `README.md`

详细项目边界、操作流程、测试规则和不可破坏约束见 `docs/PROJECT-HANDBOOK.md`。

发布前的制品范围、新环境验收和证据要求见 [项目手册：Release 准备与验收](docs/PROJECT-HANDBOOK.md#14-release-准备与验收)。当前仓库尚未完成新电脑从零安装验收，不能以本机 Reader 回归通过代替发布就绪。

## 本地构建便携包与许可

维护者在提交并检查源码后，下载官方 Windows x64 Node ZIP，从同版本 [SHASUMS256.txt](https://nodejs.org/dist/) 核对 SHA-256，然后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-portable.ps1 -NodeZip "<官方NodeZIP路径>" -NodeSha256 "<官方SHA256>" -Ref HEAD
```

脚本只从指定本地提交导出白名单源码，在独立目录按锁文件安装依赖，校验 Node 与依赖，并在 `dist/build-*/` 生成 ZIP、哈希及构建清单。构建需要 Git 和联网访问 npm registry，使用 Node ZIP 自带的 npm，不安装全局软件。构建不执行依赖安装脚本；依赖出现安装脚本时会中止要求重新审查。构建工作目录和缓存保留，不自动清理。

制品内 `BUILD-MANIFEST.json` 记录源码提交、Node 版本、输入 ZIP 校验值和逐文件哈希；`THIRD-PARTY-NOTICES.md` 列出依赖及许可文件。用户下载/解压后不再需要 npm registry。稳定版发布前必须按项目手册第 14 节完成目标环境验收；预发布也必须核验实际 ZIP，并明确尚未完成的验收项。

当前项目代码**暂不授予开源许可**，`package.json` 标记 `UNLICENSED`；不提供 MIT/Apache 等项目源码授权。Node 与第三方依赖继续适用各自许可，原始许可和 NOTICE 随便携包保留。源码仓库与预发布附件位于 [ZiYao00/feishu-notes](https://github.com/ZiYao00/feishu-notes)。Release 附件只包含经核验的便携包与校验文件，用户数据不随发布交付。
