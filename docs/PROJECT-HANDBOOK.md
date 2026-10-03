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
- 长文提供 TOC、阅读进度、明暗主题、桌面 TOC 折叠和窄屏目录抽屉。
- Desktop 在 TOC 与正文之间提供可拖动 Splitter：支持鼠标拖动、键盘左右键、双击恢复默认，并在本机记忆目录宽度。
- Reader 正文不使用固定 760px；桌面端采用约 880–960px 的自适应阅读列，表格和媒体等宽内容继续使用 Splitter 调整后剩余的安全空间，并共享左基准线。
- 取消整块白色 Paper 背景；视觉层次由章节、表格、引用、代码、链接、列表和媒体组的局部 CSS 增强建立。
- 正文视频保持原始横/竖比例并受视口高度限制；正文视频在 Reader 中作为媒体触发器，点击后进入统一媒体弹窗并自动播放。
- 同一个 Media Block 内允许多媒体 Grid；禁止跨 Block 聚合或重排媒体。
- 表格内图片/视频继续使用约 120px 高的紧凑触发卡；正文图片、正文视频和表格媒体统一进入透明 Media Dialog，不再使用黑色遮罩背景。
- Media Dialog 支持 Esc 或点击媒体外空白区域关闭，并在关闭后把键盘焦点还给原触发器。
- 表格在桌面 Reader 中自动分为 Compact / Standard / Wide：短内容小表按内容收缩，普通表限制在中等阅读宽度，复杂/媒体/多列表使用完整可用宽度；各模式继续配合内容感知列宽和自动换行，窄屏统一转为带字段标签的纵向记录卡，不再依赖横向滚动条。
- 对未知/未来 Block 使用保守 fallback：优先保留文本或媒体，只有真正空块才跳过。
- 对 MP4 提供 Range 支持。
- 首页、原始 Reader、学习版统一使用单个亮/暗切换按钮；不再提供“跟随系统”的第三状态。
- 不执行原飞书页面中的脚本。

### Explain 派生学习层

Explain 是可选能力，不改变归档主流程：

- 原始 Markdown / HTML / `archive.json` / `assets/` 继续作为 Source of Truth；
- 派生教学内容只放在 `library/<article>/explain/`，不把自定义字段写回 `archive.json`；
- Viewer 只有在 `explain/chapters/manifest.json` 存在至少一个 `ready` 且 Markdown 文件实际存在的章节时，才显示学习入口；
- 首页以“进入学习版”为主入口、“查看原始文章”为次入口；`/explain/<folder>/` 继续作为兼容路由并直接进入第一个可读章节，不再经过 Course Map / Lesson Landing；
- 公开内容来自 `explain/chapters/`；历史 `explain/lessons/`、Evidence Cases、ASR 与 Frame 数据属于内部素材，不进入普通导航；
- `explain/manifest.json` 保存原文 `savedAt` 与 SHA-256 指纹，原归档更新后应提示学习版重新复核；
- 学习版默认沿用结构清晰的原报告主顺序，并对每一块做高解析度学习重构；并列、因果、对比、数据、分类与执行信息使用不同视觉语义组件，避免把所有知识压成长段落。数字必须按信息价值分层，流程必须表现为连续关系而不是独立卡片堆叠；只有真实的概念依赖冲突才允许局部调整顺序；完整教学规范见 `docs/EXPLAIN-WORKFLOW.md`；
- 视频证据统一使用归档 `contentHash` 作为身份，`media-index.json` 负责回溯逻辑媒体 ID、Block、上下文和物理文件；
- ASR 是外部本地能力，Viewer 本身不能依赖 ASR 服务在线；
- 关键帧只按明确时间点少量抽取，并通过 `frames.json` 保存时间戳与图片 SHA-256；
- 完整规范见 `docs/EXPLAIN-WORKFLOW.md`。

## 3. 使用入口

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
