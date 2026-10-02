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

- 扫描图片、视频等媒体。
- 在批量下载前尽量获取媒体数量、类型和大小。
- 大文件/大量媒体使用软限制。
- 不允许因为预检而静默丢媒体。
- 完整归档使用本地相对资源路径。
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
- 对 MP4 提供 Range 支持。
- 不执行原飞书页面中的脚本。

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

- `127.0.0.1:4173` 返回 200；
- 首页能看到归档文章；
- article.html 返回 200；
- MP4 Range 返回 206；
- Viewer 不监听外网接口。

涉及 Service BAT 时至少检查：

```bat
service.bat status
service.bat start
service.bat status
service.bat stop
service.bat status
```

并确认启动后：

```text
GET http://127.0.0.1:4173/ → 200
```

## 11. 验证基线

当前项目已经用一篇包含大量媒体的真实飞书长文完成过端到端验证：

- 长文虚拟滚动可以稳定扫描。
- 媒体能保存为本地文件。
- Markdown / HTML 不依赖飞书媒体 CDN。
- 本地 MP4 支持 Range。
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
