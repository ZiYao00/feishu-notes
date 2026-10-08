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
文件数量 > 40
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

### 发布范围与交付选择

当前代码形态是 Windows 本地源码工具，源码 ZIP 不包含运行时、依赖和用户数据；是否制作便携包、正式支持哪些 Windows 版本/架构、版本号、发布仓库及许可证，需要在正式发布前确定。只允许将实际验收过的环境写成支持承诺。当前机器上的功能验证不等于新电脑环境认证。

首次发布优先评估源码 ZIP：它复用现有 CLI、锁文件与 BAT，不额外引入桌面壳或运行时打包。若目标是无需安装 Node.js 的开箱即用包，必须另立打包、升级、依赖许可与环境验收工作，不能直接把开发目录压缩称为便携版。

发布说明至少给出版本/提交、支持环境、安装入口、首次登录方式、空库预期、已知限制、升级/迁移与回退方式。不要把维护者机器上的飞书文章和登录状态作为示例数据一起交付。

### 制品与私有数据边界

- 源码制品从选定的本地提交导出；不要打包整个工作目录。`.gitignore` 防止常规误提交，不能代替 ZIP 内容检查。
- 源码包保留 `package.json`、`package-lock.json`、默认配置、示例配置、脚本、源码、文档与数据目录占位文件。
- 排除 `node_modules/`、`.git/`、`library/` 的实际文章、所有 Profile、Secrets、本机配置、日志、缓存、样式覆盖、临时验证数据与 `data/backups/`。
- 记录制品 SHA-256、来源提交及清单；核对已提交源码不含真实私有文档 URL、Cookie、Token、用户机器路径和业务材料。若要声称完整 Git 历史可公开，另审历史，不能以当前树检查替代。
- 当前 `package.json` 的 `private: true` 与源码 ZIP 交付不冲突，但没有配置 npm 包发布。未配置 remote 时不猜测发布仓库，不自动增加远程地址或推送。

### 新用户、新电脑的必过路径

在经授权的干净 Windows 环境或隔离虚拟机，用实际候选 ZIP 执行 README；不得复用维护者的 `node_modules`、全局模块、配置、归档或 Profile。

1. 从源码 ZIP 解压，安装声明版本的 Node.js/npm 和抓取所需 Chrome；首次 `npm.cmd ci` 成功，锁文件不变。不能用已安装依赖的回归代替这个步骤。
2. 无本机配置、空资料库时启动，首页 HTTP 200 且没有维护者文章；启动/重启/状态/打开/停止流程与后台日志一致。
3. 覆盖普通、中文、含空格的可写安装路径；Node/Chrome/依赖缺失时有可执行的处理方式；4173 被无关进程占用时不误杀；声明自定义端口支持时，CLI 与服务管理入口一致。
4. 专用 Profile 首次登录后按提示重跑 capture，测试无权限账号与媒体确认分支；一篇获授权、可公开用于测试的文章完整归档后可刷新进入原文。保留原始文件、记录失败媒体，不强制所有文章带 Explain。
5. 安装与归档完成后断网/退出飞书，验证首页、原文、本地图片、视频播放与 Range；有 ready 章节的 Explain 再验证连续导航、复制/展开和窄屏阅读。使用独立测试环境断网，不影响维护者当前网络或服务。
6. 将完整文章目录迁入第二套无 Profile 的安装，确认相对资源与派生章节仍可读；继续抓取需要该电脑重新登录。更新前备份资料库、本机配置，回退源码时保留这些私有数据。

Reader 自动回归仍按 `AGENTS.md` 执行；在本工作区设置 `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1`，保留临时 fixture，不进行递归删除。自动布局回归、复用依赖的隔离运行、真实新电脑安装应分别记录结果。

### 2026-10-08 收尾审查的已知发布缺口

- `service.bat` 的 `Start-Process -ArgumentList` 未保护入口路径中的空格，等价参数探针和完整 BAT 测试副本均复现 `MODULE_NOT_FOUND`；README 暂提供无空格路径和前台 CLI 的绕行方式，正式新用户发布前应修复并验收 BAT。参数处理应遵循 [Microsoft 的 Start-Process 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1#-argumentlist)。
- BAT 固定管理 4173，而 CLI 可读配置或 `--port`；当前不能声称 BAT 支持自定义端口。README 已注明使用前台 CLI 的限制。
- HTTP Range 的尾部区间处理错误：对 2048 字节文件请求 `bytes=-16`，实际返回 `bytes 0-16/2048`（17 字节），应返回最后 16 字节；普通 `bytes=0-15` 正常返回 206。越界请求目前回退到 200 整文件，未实现 [RFC 9110 推荐的 416 分支](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2)。应先修尾部区间并补充边界回归，不把一次正常 Range 通过当作所有 Range 语义正确。
- `init:explain` 草稿生成器仍包含旧“讲解版”措辞；作者将草稿变为 ready 前应统一公开名称。后续应同步生成器与规范，避免新资料沿用旧措辞。
- 当前依赖有锁文件，但 `package.json` 未声明 Node engines；安装说明已写明实际依赖下限和本机基线，后续可评估补充机器可校验的版本约束。
- 尚无仓库许可证文件、正式发布制品或新电脑从零安装的通过记录；发布仓库、交付形式和许可选择仍待确定。

### 本轮已完成的检查与证据边界

审查基于本地阅读收尾提交 `0b9e5c5` 的源码导出；后续本节补充只改变文档。当前结论为 **NOT READY**：项目阅读改动可收尾，正式面向新用户发布仍需解决上述启动缺陷、Range 尾部区间问题和新环境验收缺口，并确定交付与许可。

| 检查 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| Reader 全量回归、当前 CLI check、运行中首页 | 通过，首页 200 | 现有 Windows 10 x64 / Node.js 24.20.0 / npm 11.19.0 环境 |
| 提交导出的源码 ZIP | 38 个文件，未包含私有运行数据，17 个 JS 语法检查通过 | 本地审查候选包，未发布 |
| npm 依赖树与 audit | 依赖树有效，audit 报告 0 个已知漏洞 | 本次 registry 响应，不是所有安全问题的证明 |
| 可达 Git 历史隐私检查 | 14 次提交、133 个文本对象未命中限定规则，未发现私有运行文件 | 限定于私有飞书 URL、常见凭证前缀、机器工作目录路径；不等同完整秘密扫描 |
| 空库与默认配置、可选 Explain | 200；无 Explain/ASR 时原文可读，draft 不公开，缺文件章节不公开 | 从导出源码运行，复用已有 npm 依赖 |
| 迁移到含空格和中文的路径 | 原文与 ready Explain 200，媒体 SHA-256 保持一致 | 合成文章；直接 CLI 启动，不是 BAT 路径验收 |
| 完整 BAT 测试副本 | 普通路径启动/状态/停止与 HTTP 200 正常；含空格路径启动失败 | 副本仅调整端口与本机配置以隔离现有服务，依赖复用；正式 BAT 未改 |
| 新电脑首次安装、首次授权登录、断网完整链路 | 未执行 | 仍需使用正式候选包在经授权的干净环境验收 |

详细脚本、日志、ZIP 清单、哈希与检查报告留在 Git 忽略的 `data/tmp/release-audit-20261008/`，不进入源码制品。测试服务均已停止，维护者现有 Viewer 保持运行；未安装/升级依赖，未更改远程或发布。

这些是本次审查时点的状态；修复后应更新对应记录与验证证据，不能仅凭文档补齐宣布 READY。正式安装依赖、改发布相关实现、设置远程、打 Tag、推送或发布 Release 均按用户的明确授权执行。
