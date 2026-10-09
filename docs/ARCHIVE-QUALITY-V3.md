# Archive Quality V3 — 统一保真、验收与安全发布规范

此文件是 feishu-notes 所有采集入口、续采、Reader、候选报告与 Agent Skill 的共同完成标准。`library/` 是唯一正式资料库。仅在授权范围内访问飞书，源文档、Chrome 登录数据和候选快照始终保留在本地、Git-ignored 目录。

## 1. 三类事实不能混为一谈

1. **命令完成**：进程返回 0，仅说明命令成功执行，不代表一篇文章完整。
2. **归档内容状态**：旧 `archive.json.status` 保留 `pending_confirmation` / `partial` / `complete`，供旧版 Reader 使用；不应仅凭它宣布交付。
3. **质量与发布认证**：`archive.json.quality` schema 3 由 `src/archive/quality-gate.js` 唯一推导。CLI、Agent 和报告不可自行定义成功。

`quality.verdict` 在采集阶段是 `unverified` / `partial_candidate` / `complete_candidate`。仅当 Reader 验收记录与 Manifest、Markdown、HTML 三个 SHA-256 一致、所有已下载媒体 SHA-256 及物理存在性检查通过时，报告才可升级为 `partial_verified` / `complete_verified`。需要另外经过用户授权才允许发布 `partial_verified` 到正式库。

**重要：**旧版 `status=complete`、旧 Schema 2 的质量字段、旧 Snapshot schema 1，都不能追认为新的完整来源认证。浏览器测试通过也不能弥补来源内容身份不确定的风险。

## 2. 来源快照和资源身份

- 采集使用可靠的文末扫描和重复稳定检查，所有顶层 Block 必须有记录，不能默默省略。**特别是 Callout 内部仍有独立的虚拟列表**：滚动文末并不代表内部内容完整，必须汇总滚动过程中按 `data-record-id` 捕获的子节点，证明首尾和相邻关系构成无断层的完整链。存在未解析占位、冲突或丢失节点时，`scan.calloutCoverage.unresolved` 必须记录问题，`scan.verifiedComplete=false`，不得发布为已验证归档。
- Snapshot schema 2 分别记录正文、链接、图片/视频出现位置、附件元数据和完整内容指纹；新归档的 Manifest 额外保存 `sourceFingerprint`，安全续采必须核对这个指纹，防止正文相同但链接、附件或媒体关系已变化。HTML、原始签名 URL 只能留在私有来源快照。
- **优先使用飞书 `data-record-id`** 做内容身份，而不是 `data-block-id`：真实跨次扫描表明 555 个位置的 recordId 全部一致，但临时 block-id 只有 32 个同位置相同。图片与视频逻辑身份优先 `<image|video>:record:<record-id>:<ordinal>`；缺失 recordId 时使用 `<image|video>:block:<block-id>:<ordinal>` 作为低置信回退，不能未经核对就跨扫描重绑。资源不能仅按 URL、文件名或尺寸识别；相同内容仍按 SHA-256 做物理去重。
- 失效 Blob 的恢复必须精确匹配同一个稳定 recordId 和图片出现序号；若没有稳定身份，保守拒绝，不得回退到“第一张图片”来冒充成功。Callout 内的图片/视频应绑定最近的嵌套 recordId，而不是可见子块变化的外层容器。
- Feishu 文件附件保留文件名、已知大小、Block 和权限状态。下载按钮禁用时不得绕过权限；用明确的占位说明代替空白。
- 飞书图片块的 `.loading-placeholder-wrapper` 内可能出现额外 Blob 缩略图，该内容只是加载占位而非原始图片；必须同时从扫描清单与采集 HTML 中排除，并用真实文档两轮扫描确认媒体数量稳定。
- 图片、视频、压缩包、嵌入 Sheet 和外部链接要区别对待。外部链接不是“必须本地下载”的文件附件。

## 3. 统一资源安全规则

- 实际已下载字节使用流式累计，包含失败、取消及重试产生的字节。单文件/任务总量维持已批准的 300 MiB / 1 GiB 硬预算。
- 100 个媒体是软数量预警，超过已授权的候选处理数量时一律记录 `skipped_by_media_limit`，不得悄悄下载第 101 个。
- HTTP(S) 媒体下载只允许 `src/feishu/media-url-policy.js` 列出的飞书/CDN 域名；每次重定向都重新验证，不使用任意源文档 URL 发起带会话 Cookie 的请求。
- 正式媒体复用必须使用 SHA-256 校验；拒绝同大小不同内容、媒体 ID/Block 混淆及失效路径。下载失败仍留在清单。

## 4. 安全发布与故障恢复

- 首次归档、Agent resume 和候选重新渲染使用 `src/archive/publish-transaction.js`。任意已存在的正式归档不可通过普通 capture 隐式覆盖。
- 发布前备份原文件，写好三份临时数据及私有事务日志，并生成文章目录的 `.publish-state.json` 标记。
- Marker 存在期间，Reader 的原文、Explain、媒体访问返回 HTTP 503，拒绝阅读可能混合版本的内容。发布成功并通过文件哈希验证后，才能移除此 Marker。
- 中断后，禁止自动删除残留锁/Marker 或猜测性重试。只读检查后，使用明确的 `recoverPublication({dir,decision:'restore'})` 恢复私有备份。外部编辑或哈希不匹配时，必须停止。
- 事务日志、源快照和备份始终在项目内部被 Git 忽略的路径；不放入 Skill、Release 或 Git。旧媒体、Explain 与登录 Profile 不自动清理。
- `scripts/audit-source.js` 的备份描述符使用**原始文件字节 SHA-256**（`sha256-bytes`）。历史备份若写入过 `SHA256(JSON.stringify(Buffer))`，`scripts/verify-source-protection.js` 会识别历史格式，并额外核对备份与原文件逐字节相同；不改写旧备份描述符，不忽略哈希错误，也不把历史格式误认为标准字节哈希。
- 旧候选媒体若只验证了稳定来源 `recordId`/Block 位置与本地 SHA-256，但未和当前原文媒体字节重新比较，只允许在受控隔离预览中复用。必须保留 `policy.provisionalAssetReuse=true` 和 `historical_media_bytes_unverified`；即使 Reader QA 通过，质量结论仍为 `unverified`，不得自动发布。

## 5. 候选与验收

独立候选目录位于 `data/tmp/archive-candidates/<document-id>/<run>/`。动态读取当前候选状态：

`node scripts/candidate-report.js <document-id> [run]`

离线 Reader 验证：

`node scripts/verify-candidate-reader.js <document-id> [run]`

该命令会验证 1920×1080 和 390px、标题/附件/媒体占位数量、无远程媒体依赖、图片解码与本地视频 HTTP 206，然后把与三个文件哈希绑定的 QA 记录保存到候选内部 `.qa/`。不要使用旧报告的静态计数决定成功。Reader 的案例分组不得删掉未下载媒体：`reader-media--unavailable` 必须保留 `reader-media--standalone` 或 `reader-media--table-cell` 上下文，搬运失败不得删除原块。

执行修改后的回归：

- `node scripts/verify-source-protection-regression.js`（新旧备份哈希、备份/原文逐字节一致性、篡改/缺失文件拒绝）
- `node scripts/verify-quality-gate.js`
- `node scripts/verify-publish-transaction.js`
- `node scripts/verify-source-fidelity.js`
- `node scripts/verify-callout-collector.js`（涵盖内层虚拟占位、连续性、非单调文字变更和加载态恢复）
- `node scripts/verify-pending-media-reader.js`（检测案例分组不会丢失未下载媒体的可见占位）
- `node scripts/verify-agent-capture.js`
- `node scripts/verify-agent-resume.js`
- 设置 `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1` 后运行 `npm run verify:reader`
- `npm run verify:release`
- 有正式归档且已建立本机 V3 基线时，运行 `node scripts/verify-fidelity-v3-baseline.js`，核对被保护文章的关键文件未改变；新克隆且尚无归档/私有基线的环境不能把这一项当作必须通过的部署前提

测试成功 ≠ 人工验收通过。对于资源受限的真实文章，报告必须保留所有未知/受限项；不可为了结束任务而擅自标记完整。发布 `partial_verified` 需要用户单独明确授权。
