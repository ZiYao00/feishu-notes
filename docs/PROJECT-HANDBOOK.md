# feishu-notes 项目手册

## 1. 项目定位

`feishu-notes` 是一个本地优先（local-first）的飞书文档归档与离线阅读工具。

核心目标不是“保存网页截图”，而是：

```text
有权限访问的飞书文档
        ↓
完整加载结构化正文
        ↓
发现并预检媒体
        ↓
下载需要的图片 / 视频
        ↓
生成可长期保存的本地归档
        ↓
通过本地 Viewer 或任意 Markdown 工具阅读
```

项目保存的是用户当前账号本来就有权限查看的内容。不要把项目改造成绕过飞书访问授权的工具。

## 2. 核心能力

### 文档抓取

- 使用独立 Chrome Profile 保存登录状态。
- 使用 Playwright CDP 连接 Chrome。
- 支持飞书长文档的虚拟列表与懒加载。
- 扫描器会多轮滚动直到 Block 集合稳定。
- 正文按 `data-block-id` 和结构收集，不使用“全文字符串去重”。

### 媒体

- 扫描图片、视频等媒体，并记录可用的宽高、比例和 standalone / table-cell 上下文。
- 在批量下载前尽量获取媒体数量、类型和大小。
- 大文件/大量媒体使用软限制。
- 不允许因为预检而静默丢媒体。
- 完整归档使用本地相对资源路径。
- 媒体落盘后计算 SHA-256；单篇文章内相同内容只保存一份物理文件，但所有逻辑出现位置必须保留。
- 飞书播放器内部封面、临时 Blob UI 资源不能误算为正文媒体。

### 归档

每篇文档的标准产物：

```text
library/<safe-title>/
├─ <safe-title>.md
├─ article.html
├─ archive.json
└─ assets/
   ├─ images/
   └─ videos/
```

`library/` 是唯一正式资料源，不建立另一套 Obsidian 副本。

### Viewer

本地 Viewer：

```text
http://127.0.0.1:4173
```

必须先启动服务：

```bat
service.bat start
```

或者：

```bat
service.bat start-open
```

Viewer：

- 默认只监听 loopback。
- 只读取 `library/`。
- 不要求用户保持飞书登录。
- 使用统一 Reader Shell + 内容上下文渲染，而不是把用户直接跳转到裸 `article.html`。
- 长文提供 TOC、阅读进度、明暗主题、桌面 TOC 折叠和窄屏目录抽屉。TOC 必须是当前 Reader 页内锚点导航：点击后保持当前 `/note/` 路径，按 Sticky Topbar 偏移定位，并由 ScrollSpy 随手动滚动更新 Active；归档 `<base>` 只能服务媒体相对路径，不能把 TOC 导向 `/library/`。
- Desktop 在 TOC 与正文之间提供可拖动 Splitter：支持鼠标拖动、键盘左右键、双击恢复默认，并在本机记忆目录宽度。
- Reader 正文不使用固定 760px；桌面端采用约 880–960px 的自适应阅读列，表格和媒体等宽内容继续使用 Splitter 调整后剩余的安全空间，并共享左基准线。
- 取消整块白色 Paper 背景；视觉层次由章节、表格、引用、代码、链接、列表和媒体组的局部 CSS 增强建立。
- 正文视频保持原始横/竖比例并受视口高度限制；正文视频在 Reader 中作为媒体触发器，点击后进入统一媒体弹窗并自动播放。
- 同一个 Media Block 内允许多媒体 Grid；禁止跨 Block 聚合或重排媒体。
- 表格内视频不再保留缩略图卡高度，改为约 32px 高的“播放图标 + 视频”紧凑触发器；表格图片只保留小尺寸缩略图触发器。正文图片、正文视频和表格媒体统一进入透明 Media Dialog，不再使用黑色遮罩背景。
- Media Dialog 支持 Esc 或点击媒体外空白区域关闭，并在关闭后把键盘焦点还给原触发器。
- 桌面表格采用通用 AutoFit / Clamp：浏览器先按最终渲染内容测量每列自然宽度；整表能放进 Reader 时按自然宽度显示，不强行铺满；只有自然宽度超出可用空间时才铺满 Reader，并按“首选宽度 → 表头最小宽度”的可压缩空间分配列宽。禁止再用字段名、第一列身份、字符数、列数或固定语义权重决定列宽。numeric / percent / status / media 只控制视觉表达；包含百分号的长句不能因此被识别为百分比列。含 colspan / rowspan 或源 colgroup 的复杂表回退浏览器原生 auto layout；窄屏统一转为带字段标签的纵向记录卡。
- Original Reader 支持 Long-form / Structured Report / Dense Note 三种自动阅读策略，且只能由通用文档结构信号触发，禁止按具体文章名、URL 或 Block ID 写死。Dense Note 在信号重叠时优先；Structured Report 只在非 Dense Note 的多章节、多表格/列表、短解释块型报告中触发。
- Structured Report 不改源语义和顺序：H2 作为精简目录的 primary，H3/H4 作为 secondary 并可通过“全部”显式展开；正文采用低视觉噪声 Reading Visual Grammar，以字号、字重、间距和对齐建立层级，弱化表格阴影/斑马纹、Flow/Tier 卡片感与无必要强调色。桌面 AutoFit / Clamp、Splitter、媒体行为和窄屏记录卡契约保持不变。
- Dense Note 不改源语义和顺序：H2/H3/H4 仍保留原标签，但视觉角色会分为 major / note / long；目录默认只显示 major，可切换“全部”；长 Prompt 使用自动换行、默认折叠、完整复制的 Prompt Card。Dense Note 同样遵循低视觉噪声原则：Prompt 是功能容器而不是强装饰卡片，多媒体组不重复叠加外层 Surface，long note 只保留轻量层级，小字号 Meta 需保持足够对比度；这些规则只作用于 Dense Note，不通过修改全局 token 或 Explain Prompt 样式实现。
- 连续短 Heading / Text 若表现为直播讲解、群聊摘录或现场速记，可进入 Commentary Stream。该模式只改变视觉角色：禁止凭空增加人物、头像、时间戳、对话方向或回复关系；major heading、媒体、代码、表格与 embed 均作为自然断点。
- 原文深度拆解案例优先使用受控 `:::case` 指令展示标题、元信息、标签、摘要、可选本地媒体与证据边界；Prompt Library 必须保持“一案例一个一级矩形”，案例拆解、Prompt Anatomy、关键约束和完整 Prompt 处于同一 Case，Prompt 区不得再生成独立外框。未被源数据明确关联的视频与 Prompt 不得自动配对。
- 图片-only Block 与 Heading 附图必须保留；空块判断要区分“无文字”和“无内容”。飞书内嵌 Sheet 优先通过已登录页面的 Sheet Copy / Clipboard HTML 提取单元格为普通 table，并在抓取后恢复用户剪贴板；只有提取失败时才输出可见 fallback。
- 对未知/未来 Block 使用保守 fallback：优先保留文本或媒体，只有真正空块才跳过。
- 对 MP4 提供 Range 支持。
- 首页、原始 Reader、原文深度拆解统一使用单个亮/暗切换按钮；不再提供“跟随系统”的第三状态。
- 不执行原飞书页面中的脚本。

### Explain 派生深度拆解层

Explain 是可选能力，不改变归档主流程：

- 原始 Markdown / HTML / `archive.json` / `assets/` 继续作为 Source of Truth；
- 派生拆解内容只放在 `library/<article>/explain/`，不把自定义字段写回 `archive.json`；
- Viewer 只有在 `explain/chapters/manifest.json` 存在至少一个 `ready` 且 Markdown 文件实际存在的章节时，才显示深度拆解入口；
- 首页以“进入深度拆解”为主入口、“查看原始文章”为次入口；`/explain/<folder>/` 直接渲染所有 `ready` 章节为一篇连续长页面，不再经过 Course Map、Lesson Landing 或上一章/下一章分页；
- 章节 Markdown 继续按文件拆分维护，但桌面左侧章节导航和窄屏章节选择都只做当前页面锚点滚动，并由 ScrollSpy 同步当前章节；旧 `?chapter=<id>` 链接重定向到对应 `#chapter-<id>` 以兼容历史收藏；
- 公开内容来自 `explain/chapters/`；历史 `explain/lessons/`、Evidence Cases、ASR 与 Frame 数据属于内部素材，不进入普通导航；
- `explain/manifest.json` 保存原文 `savedAt` 与 SHA-256 指纹，原归档更新后应提示深度拆解重新复核；
- 原文深度拆解默认从原文的观点、证据、技术路线、数据边界与案例结构出发。结构清晰的报告可沿用原主顺序；现场记录/碎片资料允许按概念与决策关系重组，但必须保留来源边界，避免教师式“怎么学/先记住”口吻。论证优先普通文档排版，分类与对比按信息关系选择列表或轻表格，真实顺序才使用 Flow；视频与 Prompt 案例库保留功能容器。组件选择、字号和版块留白的统一规范见 `docs/EXPLAIN-WORKFLOW.md`；
- 视频证据统一使用归档 `contentHash` 作为身份，`media-index.json` 负责回溯逻辑媒体 ID、Block、上下文和物理文件；
- ASR 是外部本地能力，Viewer 本身不能依赖 ASR 服务在线；
- 关键帧只按明确时间点少量抽取，并通过 `frames.json` 保存时间戳与图片 SHA-256；
- 完整规范见 `docs/EXPLAIN-WORKFLOW.md`。

## 3. 使用入口

新用户先按 `README.md` 的“第一次安装（Windows 源码）”完成 Node.js、npm 依赖和可选抓取所需 Chrome 的准备。README 是安装与首次登录流程的唯一维护入口，本手册保留开发、数据和验收契约。当前本机基线为 Node.js 24.20.0 / npm 11.19.0；系统 Chrome 由项目检测，源码不捆绑浏览器。

### Windows 用户

推荐双击：

```text
service.bat
```

菜单支持：

- Start viewer in background
- Stop viewer
- Restart viewer
- Open browser
- Start viewer and open browser
- Check status

命令模式：

```bat
service.bat start
service.bat stop
service.bat restart
service.bat status
service.bat open
service.bat start-open
```

### Agent 安全保存文章

V3 工程阶段收尾与遗留任务见 `docs/V3-CLOSEOUT.md`，工程代码验收不代表任一篇文章的媒体和附件已完整离线。

最新版 V3 还要求排除图片载入时 `.loading-placeholder-wrapper` 产生的重复媒体，同时核验 Reader 案例分组前后媒体数量一致，不能丢掉未下载媒体占位。源码及变更验收需运行 `node scripts/verify-pending-media-reader.js`。已下载的历史媒体可在**隔离预览**中按唯一稳定记录关系与 SHA-256 复用，但最新飞书源文件字节未重新核验时必须保持 `unverified`，不得升级为正式归档。详细规则见 `docs/ARCHIVE-QUALITY-V3.md`。

Agent 首先执行 `node scripts/agent-capture.js inspect "<feishu-url>"`。未归档时可调用 `capture`；已归档且状态为 `pending_confirmation` 或 `partial` 时，只有在确认媒体告警与原文版本后才能执行 `resume`，不能用普通 `capture` 覆盖。默认数量预警已改为 **100 个**（软限制）；单文件 300 MiB、已知合计 1 GiB 的原有预警值保持。即使用户确认未知大小，真实流式下载仍受每文件/总量硬性预算约束。

确认本篇未知体积媒体后可以调用：

```bash
node scripts/agent-capture.js resume "<feishu-url>" --profile default --confirm-unknown
```

扫描器必须完成文末与 Block 稳定性验证；正文、Block 或逻辑媒体关系发生变化时禁止自动续采。文件级日志保存在 `data/state/`，按哈希复用完整文件；下载全部成功后备份原 Markdown/HTML/Manifest，再受控更新相对媒体路径与状态，绝不自动删除旧资产。失败/网络中断不等同完整归档。共享采集锁覆盖传统 CLI，残留锁需人工检查，禁止自动清理。Skill 真源为 `skill/feishu-notes/`；Explain 仍遵从最新 `docs/EXPLAIN-WORKFLOW.md`。

### 保存文章

```bash
node src/cli.js capture "<feishu-url>" --profile default
```

其它 Profile：

```bash
node src/cli.js capture "<feishu-url>" --profile work
```

确认大媒体：

```bash
node src/cli.js capture "<feishu-url>" --profile default --confirm-large
```

### 环境检查

```bash
node src/cli.js check
```

### 清 Profile 缓存

先关闭该 Profile 的专用 Chrome：

```bash
node src/cli.js cleanup --profile default
```

## 4. 多账号模型

一个 Profile 对应一个独立 Chrome user-data 目录：

```text
data/profiles/
├─ default/
├─ work/
├─ personal/
└─ ...
```

原则：

- 不在配置文件里手工保存 Cookie。
- 不保存飞书密码。
- 不把 Cookie/Token 提交 Git。
- 每个 Profile 第一次由用户正常登录。
- 后续复用同一 Profile 的认证状态。
- 同一 Profile 已有专用 Chrome 时，Browser Manager 优先复用有效 CDP。
- CDP 失效时重新启动专用 Chrome。

当前“自动遍历所有 Profile 找到有权限账号”不是既有能力；需要用户指定 Profile。以后可以添加，但不能破坏当前 Profile 隔离模型。

## 5. 配置、Secrets 与 Git

### 可提交

```text
config/default.json
config/local.example.json
secrets/credentials.example.json
```

### 本机私有，不提交

```text
config/local.json
secrets/credentials.local.json
data/profiles/
data/cache/
data/state/
data/tmp/
data/logs/
data/styles/
data/backups/
library/
```

任何 Agent 在提交前必须确认 `.gitignore` 仍覆盖这些内容。

### 禁止硬编码

Tracked files 禁止出现：

- 用户机器绝对路径；
- 用户个人 Obsidian 路径；
- 飞书 Cookie；
- 私有 Token；
- 密码；
- API Key；
- 某一篇真实私有飞书文档 URL。

## 6. 媒体下载策略

默认阈值来自 `config/default.json`。

典型条件：

```text
单文件 > 300 MB
已知总量 > 1 GB
文件数量 > 100
存在未知大小
```

都是“提醒条件”，不是“自动丢弃条件”。

流程必须保持：

```text
扫描
↓
Media Inventory
↓
Preflight
↓
需要时等待确认
↓
下载
↓
校验
↓
写 archive.json
```

不能改成：

```text
边扫边盲目下载所有媒体
```

也不能：

```text
超过阈值 → 静默跳过
```

### 单篇媒体内容去重

下载后的物理媒体使用 SHA-256 内容哈希作为 canonical identity：

```text
Feishu Media A ─┐
                ├─→ assets/videos/sha256-<hash>.mp4
Feishu Media B ─┘
```

规则：

- 去重比较真实文件内容，不使用文件大小、文件名或 URL 代替哈希；
- 只去重物理文件，不能删除文章中的逻辑媒体出现位置；
- `archive.json` v2 使用 `contentHash` / `duplicateOf` 记录映射，并区分 logical / physical storage；
- 旧文件清理只能在新 Markdown、HTML 和 Manifest 成功写入之后执行；
- V1 去重范围限定在单篇文章目录，不做跨文章全局媒体池。

## 7. archive.json 状态语义

### complete

要求保存的媒体均已成功本地化。

### partial

至少一个要求保存的媒体失败或被显式跳过。

### pending_confirmation

媒体预检触发软限制，批量下载尚未开始。

重要规则：

> 已存在的 complete 归档，不允许因为之后一次预检触发警告而被覆盖成 pending_confirmation。

## 7.1 来源保真与真实文章验收

**最新 V3 规范：**见 `docs/ARCHIVE-QUALITY-V3.md`。新增 `quality-gate.js` 统一结果、`publish-transaction.js` 事务发布、`media-url-policy.js` 域名验证及下载重试预算。`archive.json` 旧状态仅供兼容，最终成功必须有 Reader QA 绑定三个文件哈希。真实受限文章可经审核进入 `partial_verified`，但发布需独立授权。候选报告必须从现有 Manifest 和磁盘资源实时生成，不能使用过时静态 JSON 数据。

- 新采集保留结构化、可复核的私有 Source Snapshot（优先稳定 `data-record-id`，保留但不依赖临时 `data-block-id`、顺序、正文、子 Block、媒体/附件关系），不把 Cookie 或源文档资料放入 Git/Skill 发布包。
- `docx-view-block` 中的文件卡应保留文件名、可见体积、来源 Block 以及未下载原因；下载按钮被飞书禁用时不绕过权限，不再输出空白。
- Callout 内层存在独立虚拟列表（`bear-virtual-renderUnit-placeholder`）：不能仅以整页 Block 数和文末滚动判断完整。使用子节点稳定 `recordId` 汇总滚动片段，只有能证明完整连续顺序时才还原；任何内层缺口一律标记 `callout_incomplete`，不可自动发布。
- 文字、标题、附件和媒体都有覆盖记录：`rendered` / `empty_verified` / `unsupported_visible` / `failed`。顶层 Block 数与最终 HTML Section 数不必相等，但每个 Block 必须能解释。
- `archive.json.quality.verified` 与原 `status` 分开；新版完整交付要求质量审计、物理资源哈希、离线 Reader 实测全部通过。旧版 `complete` 不自动升级为新质量认证。
- 故障文章先到 `data/tmp/archive-candidates/` 生成独立候选，保留 `library/` 原件和 Explain。可批量尝试上限为 100 的媒体候选，超出的每个逻辑出现位置记录为 `skipped_by_media_limit`，不能伪装成完成。
- 复现/修复命令：`node scripts/audit-source.js "<飞书文档URL>"` 获取只读来源快照；`node scripts/verify-source-fidelity.js` 验证扫描转换回归。只把已验收的候选纳入正式资料库。

## 8. Chrome Profile 与缓存

Profile 既包含登录状态，也包含可重建缓存。

不能粗暴删除整个 Profile。

允许清理的缓存由：

```text
src/browser/profile-maintenance.js
```

中的白名单决定。

Cleanup 必须：

- 在 Profile Chrome 退出后运行；
- 拒绝清理活动 Profile；
- 不删除 Cookies；
- 不删除 Local Storage；
- 不删除 IndexedDB；
- 不删除其它认证会话存储。

## 9. 服务管理

`service.bat` 参考了本地项目的成熟 service 管理方式，但为本项目做了精简。

服务：

```text
node src/cli.js serve
```

默认：

```text
127.0.0.1:4173
```

`service.bat stop` 必须先验证监听该端口的 PID 确实属于本项目的 `src/cli.js serve`，不能按端口直接误杀其它应用。

日志：

```text
data/logs/viewer.log
data/logs/viewer.log.err
```

## 10. Agent 接手流程

任何 Agent 开始修改前：

1. 打开项目根目录。
2. 阅读 `AGENTS.md`。
3. 阅读本手册。
4. 阅读 `docs/ARCHITECTURE.md`。
5. 检查 `git status`。
6. 不覆盖用户已有未提交修改。
7. 明确本轮要改哪些文件以及原因。

涉及抓取逻辑时至少检查：

- 长文是否抓到尾部；
- Block 数是否稳定；
- 图片/视频数量是否稳定；
- 正文是否有飞书 UI 噪声；
- 完整归档是否还存在远程媒体依赖。

涉及 Viewer 时至少检查：

- `npm run verify:reader` 通过；
- `127.0.0.1:4173` 返回 200；
- 首页能看到归档文章；
- Reader 页面返回 200；
- TOC 数量与正文 Heading 数匹配；
- standalone 视频受视口边界约束；
- table-cell 视频转换为紧凑触发卡；
- Desktop 与窄屏无页面级横向溢出；
- MP4 Range 返回 206；
- Viewer 不监听外网接口。

涉及 Service BAT 或 Viewer 修复时至少检查：

```bat
service.bat status
service.bat restart
service.bat status
```

并确认重启后：

```text
GET http://127.0.0.1:4173/ → 200
```

修复/验收完成后默认保持 Viewer 为 `running`，让用户可以立即刷新页面测试最新结果。只有用户明确要求停止服务时，才执行 `service.bat stop`。

## 11. 验证基线

当前项目已经用一篇包含大量媒体的真实飞书长文完成过端到端验证：

- 长文虚拟滚动可以稳定扫描。
- 媒体能保存为本地文件。
- Markdown / HTML 不依赖飞书媒体 CDN。
- 本地 MP4 支持 Range。
- Reader 已用 9:16、16:9、1:1、4:3、同 Block Media Grid、table-cell、透明 Media Dialog、视频点击自动播放、重复标题以及 1920/1440/1366/390 四档视口 fixture 做自动回归。
- Reader 回归还覆盖 Splitter 拖动、宽度持久化、双击复位、键盘调整、流式正文宽度、透明 Reader Canvas、结构化 Flow/Tier 自动识别，以及桌面 Smart Table 无横向滚动与窄屏记录卡模式。
- 阅读收尾回归覆盖桌面目录收起后的宽度/高度、60px 独立版块留白、Compare 语义表格与手机字段标签，以及 Explain Case 的 16px 正文、次级元信息、普通结构列表和亮暗层级。章节参数与公开锚点顺序继续保留，完整 Prompt 与原始归档必须独立核验不变。
- 三模式 fixture 必须分别锁定 Long-form / Structured Report / Dense Note：Structured Report 专项覆盖通用结构判定、Dense Note 优先级、H2 primary + H3/H4 secondary Smart TOC、精简/全部切换、secondary ScrollSpy 回退、低噪声标题/表格/Flow、390px 记录卡与暗色模式；Dense Note 专项继续覆盖高标题密度、major/note/long、长 Prompt Card、长 URL 窄屏换行、Heading 附图、图片-only Block 与 Sheet fallback，并锁定 Quiet Pass 的约 220px Prompt 预览、无装饰性 Shadow、轻量 Long/Media、可读 Meta、390px 触控高度、暗色层级以及 Explain Prompt 不受 Dense Note scope 污染。真实测试文档只作为本地泛化验证，不把具体 URL/ID 写入 tracked 规范。
- 清理 Profile 可重建缓存后，登录会话仍可继续使用。

不要把某个真实测试文档 ID 或 URL 写进 tracked 文件。

## 12. 不属于核心项目的功能

以下内容不是强制依赖：

- Obsidian；
- 用户自己的知识库路径；
- Windows Junction；
- 云同步；
- 第三方 Markdown 软件。

这些都只能作为外部使用方式存在，不能反向污染核心数据模型。

## 13. 后续扩展原则

可以扩展：

- Viewer 搜索；
- 标签、收藏；
- 归档更新检测；
- 自动选择已登录 Profile；
- 批量队列；
- 更完整的飞书 Block 类型；
- GUI/桌面壳。

但扩展时必须保持：

```text
library = 唯一正式资料源
Profile = 认证运行数据
config/secrets = 本机可隔离
Viewer = 离线读取
Feishu = 采集来源，不是离线阅读依赖
```

## 14. Release 准备与验收

### 已确定的交付与许可

本轮用户决定首发采用 **包含 Node 的 Windows x64 便携 ZIP**，用户无需安装 Node/npm。采集需要用户自行安装 Chrome，离线 Viewer 不依赖 Chrome 或飞书登录。应用版本沿用 `package.json` 的 0.1.0。用户本次已授权创建 `v0.1.0` 预发布并上传便携 ZIP；稳定版发布仍需完成目标环境验收。

项目源码暂不授予开源许可，标记 `UNLICENSED`，不生成未经授权的 MIT/Apache LICENSE。Node 和依赖的许可、NOTICE 必须随制品保留。已配置 `origin` 为 `https://github.com/ZiYao00/feishu-notes.git`，`master` 跟踪 `origin/master`；仓库保持私有，不自行改变可见性。正式支持的 Windows 版本只能来自目标环境验收；当前证据来自 Windows 10 x64，不能承诺未经验证的 Windows 11/ARM64。

### 制品与私有数据边界

- 从已审查的本地提交导出源码，使用 `scripts/package-portable.ps1` 的白名单构建，不能压缩整个工作目录。`.gitignore` 不能代替 ZIP 内容检查。
- 输入官方 Windows x64 Node ZIP 及来自同版本官方 SHASUMS256.txt 的 SHA-256；校验后才解压/执行。构建使用 ZIP 自带 npm，在独立目录与独立缓存运行 `npm ci --ignore-scripts`，保留锁文件；出现依赖安装脚本时停止重新审查。
- 便携包包含源码/默认配置/示例配置/文档、Node executable/LICENSE、完整锁定依赖与其许可、空数据目录占位、`BUILD-MANIFEST.json`、`THIRD-PARTY-NOTICES.md`。不附带 npm、Chrome、Node 的系统安装辅助脚本。
- 排除 `.git/`、真实 `library/` 文章、Profile、Secrets、本机配置、日志、缓存、样式覆盖、临时验证数据与 `data/backups/`。`node_modules/` 和 `runtime/` 仅在经过独立安装与检查的便携制品中纳入，源码仓库仍忽略。
- 记录制品 SHA-256、来源提交、Node 版本及逐文件清单，检查 ZIP 路径与内容。检查已提交源码中的真实私有文档 URL、常见凭证、用户机器路径和业务材料；声称 Git 历史可公开前另审历史。
- 构建脚本本身只准备本地候选包。用户本次已授权推送、创建 Release 与上传附件；具体发布必须指向源码提交、使用已核验制品，并保留预发布标记与验收边界。

### 新用户、新电脑的必过路径

在经授权的干净 Windows 环境或隔离虚拟机，用实际候选 ZIP 执行 README；不得复用维护者依赖、配置、归档或 Profile。

1. 完整解压便携包，无系统 Node/npm 的环境下用 BAT 启动；检查包内 runtime/dependencies，不要求用户运行 npm。源码开发安装另测声明版本 Node/npm 的全新 `npm ci`，锁文件不变。
2. 无本机配置、空资料库时首页 200；启动、重启、状态、打开、停止和后台日志一致。
3. 普通、中文、含空格可写路径都验证；缺 Node/依赖/Chrome 时提示可操作；无关进程占用端口时不误杀；服务管理和配置端口一致。修改端口前停止旧配置上的服务。
4. 在新专用 Profile 首次登录，按提示重跑 capture，验收无权限与媒体确认分支；至少一篇获授权的测试文档 complete 后可读。不得用既有登录、合成归档或扫描器模拟替代。
5. 用独立浏览器上下文阻断外网，验证首页、原文、图片、真实可播放视频及 Range；有 ready 章节的 Explain 验证导航/Prompt/窄屏。此项是应用请求隔离；物理断网/新系统浏览器环境另验，不能扰动维护者网络。
6. 完整文章目录迁到另一套无 Profile 的安装，核对媒体哈希、相对资源和派生章节；跨电脑继续抓取需重新登录。升级先备份并在独立目录迁移，回退保留私有数据。

Reader 自动回归按 `AGENTS.md` 执行，设置 `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1`，保留 fixture；Range/Node 约束回归为 `npm.cmd run verify:release`。本机隔离安装、模拟请求离线和真实新电脑/首次登录分别记账。

### 2026-10-08 修复与当前证据

前次审查 `c2e37e2` 的 BAT 含空格路径失败、固定端口、suffix Range、旧草稿名称及 Node 约束缺口本轮已修复：

- BAT 简化为 PowerShell 脚本入口；使用带引号的绝对 CLI 路径，读取真实配置端口，启动前检查运行时与本地依赖，拒绝误杀外部占用者。实测路径包含中文、空格、`&`、`!`、单引号和括号。
- 尾部 Range 返回最后 N 字节；越界/空文件/零后缀返回 416；错误语法和多区间忽略 Range；HEAD 返回完整头部。15 个边界用例通过。
- 草稿生成统一为“原文深度拆解”；已有文章和草稿不自动改写。
- `engines` 与入口约束落实 Node >=22.12.0；缺项目依赖不能借用父目录或全局模块伪装成功。
- 官方 Node.js 24.21.0 Windows x64 ZIP 与官方 SHA-256 一致。独立源目录、独立 Node/npm、空缓存、独立 npm 配置下首次 npm ci 成功，安装 21 个包、锁文件未变；Reader 全量回归、CLI check 和 Range 回归通过。本次 npm audit 为 0 已知漏洞，不等于全面安全保证。
- 独立 BAT 启动/状态/重启/打开/停止全部通过；无 Chrome 时 Viewer 仍运行；无 Node、本地依赖缺失、配置端口非法和外部占用分支通过。

- 从本地提交构建包含 Node 的实际 ZIP，1964 个文件（含构建清单），约 39.75 MiB；两次 Windows PowerShell 5.1 构建兼容问题已定位并修复，最终构建成功。1963 个清单文件哈希核对通过，ZIP 不含真实资料、本机配置、Profile 或日志；第三方许可保留。
- 实际 ZIP 解压到中文/空格/特殊字符路径，测试进程 PATH 不含 Node/npm，`where node.exe` 返回不可用；包内 Node 完成全部服务命令、CLI check、Range 回归，解压包 Reader 全量回归通过。这仍是现有 Windows 主机上的隔离验收，不是卸载系统 Node 或新系统认证。
- 浏览器上下文阻断外网请求后，合成文章原文、图片、两章拆解与窄屏通过，2 秒 MP4 实际播放且 readyState=4；应用外部请求尝试为 0。迁入第二套无 Profile 解压目录后图片/视频/原文/拆解文件哈希一致，视频再次播放成功。维护者网络未断开。
- 日常 Viewer 已用新入口重启并保持运行，首页 200；既有本地 MP4 的 `bytes=-16` 返回 206 和最后 16 字节。

详细日志、独立安装报告、ZIP 检查与实际播放/迁移结果留在 Git 忽略的 `data/tmp/release-fixes-20261008/`，汇总入口为其中的 `REPORT.md`；前次审查记录与未完成的测试尝试保留。构建制品及哈希位于 `dist/build-*/`，源码提交与逐文件哈希由各包 BUILD-MANIFEST 记录。正式候选的文档更新后再构建时，应核对非文档文件与已验收包一致；有运行代码变化则重跑受影响验收。

**稳定版发布仍为 NOT READY**：新电脑/干净 Windows 系统、全新 Profile 首次登录与真实飞书抓取/权限/媒体确认尚无通过记录。当前未找到可直接使用的 Windows Sandbox/虚拟机入口，用户尚未提供目标测试电脑与测试文档。这些缺口不得用本机隔离测试替代，也不得在 Release 中省略。

### v0.1.0 预发布交付

发布目标为 [v0.1.0 Windows x64 便携版](https://github.com/ZiYao00/feishu-notes/releases/tag/v0.1.0)，使用 GitHub prerelease 标记，不标为稳定版 Latest。仓库为私有仓库，下载者需要访问权限。

- README 提供版本固定的 Release 入口、Assets 文件选择、SHA-256 校验、解压/启动/首次登录步骤，并区分 GitHub 自动源码归档与包含 Node 的便携 ZIP。
- 文档更新先本地提交，推送后从该提交重新构建；非文档文件逐项与已验收包比对，运行代码/配置/依赖/运行时/许可发生变化时重新验收。
- 附件为 `feishu-notes-0.1.0-windows-x64.zip` 与 `SHA256SUMS.txt`；ZIP 内记录 BUILD-MANIFEST 和 THIRD-PARTY-NOTICES。发布说明记录完整源码提交、Node 版本、包哈希、Windows/Chrome 条件、已知未完成验收、升级和回退。
- 先准备草稿与附件，下载远端附件核对哈希后再发布为预发布；最终核对 Release 不是 draft、仍为 prerelease，Tag 指向实际构建提交。发布回执与下载验证留在 Git 忽略的 `data/tmp/`，不将本机路径或私有材料写入公开说明。
