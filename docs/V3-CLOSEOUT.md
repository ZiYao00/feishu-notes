# feishu-notes V3 阶段收尾与 Agent 接手记录

> 本文记录 **V3 归档保真及安全预览代码阶段** 的验收边界。它不意味着某一篇飞书文章已经下载全部媒体/附件，也不授权将隔离候选覆盖正式资料库。具体实现和裁决规则仍以 [ARCHIVE-QUALITY-V3.md](ARCHIVE-QUALITY-V3.md)、[PROJECT-HANDBOOK.md](PROJECT-HANDBOOK.md) 和根目录 `AGENTS.md` 为准。

## 阶段结论

- **代码阶段可以收尾**：完成虚拟化长文及 Callout 内层稳定扫描、来源 `recordId` 对齐、加载占位过滤、媒体逻辑位置保护、附件可见降级、统一质量门禁、私有候选、故障安全发布、备份新旧哈希兼容与多端 Reader 回归。
- **正式文章交付单独验收**：命令退出码 0、Reader 正常显示、历史文件 SHA-256 校验成功，都不能替代当前来源的字节级媒体认证或附件权限检查。以动态 `candidate-report.js` 和三文件哈希绑定的 Reader QA 为准。
- **保持源数据不可变**：`library/` 是正式归档唯一来源；`data/tmp/archive-candidates/` 是私有候选；`data/backups/` 为私有回退副本；候选与历史媒体不能因为“代码收尾”自动升级为正式归档。
- **Git 边界**：提交源码、脚本、模板、规范和 Skill 源文件；不提交配置、Chrome Profile、私有文章、备份、日志、候选快照或生成的 `release/*.zip`。本地提交不等于推送或发布 Release。

## 验证和交接

后续 Agent 应先打开根目录 `AGENTS.md`，阅读本记录和 `ARCHIVE-QUALITY-V3.md`，然后检查 Git 工作区是否存在其它未提交修改。

常用的非破坏性回归入口（在项目根目录执行）：

```text
node scripts/verify-source-protection-regression.js
node scripts/verify-quality-gate.js
node scripts/verify-publish-transaction.js
node scripts/verify-source-fidelity.js
node scripts/verify-callout-collector.js
node scripts/verify-pending-media-reader.js
node scripts/verify-agent-capture.js
node scripts/verify-agent-resume.js
npm run verify:release
```

Reader 全套回归在 Windows/PowerShell 中要**先设置环境变量** `FEISHU_NOTES_VERIFY_KEEP_FIXTURE=1`，再运行 `npm run verify:reader`，以防旧脚本的临时数据清理影响用户文件。对已有正式归档的本机，使用 `node scripts/verify-fidelity-v3-baseline.js` 核对私有备份基线；**全新克隆没有本机私有备份时，不应把该检查当成必须通过的安装前提**。

对具体文章的状态，使用：

```text
node scripts/agent-capture.js inspect "<已授权飞书文档 URL>"
node scripts/candidate-report.js <文档 ID> [run]
node scripts/verify-candidate-reader.js <文档 ID> [run]
```

最后一项会生成/更新候选中的验收记录；不是对正式归档的自动发布。所有校验结果按实际运行的时间和文件哈希判定，不复用旧报告中的静态计数。涉及私人文章 URL/ID 的执行记录只保存在忽略 Git 的私有工作区。

## Viewer 与预览

- **正式 Reader**：项目目录运行 `service.bat start`，默认 `http://127.0.0.1:4173/`。用 `service.bat status` 检查，Viewer 与媒体播放均只使用本地 loopback。
- **隔离预览**：`preview-candidate.bat`，默认 `http://127.0.0.1:4174/`，只读取最新符合选择规则的候选，不覆盖 `library/`。预览的实际候选名称应以启动日志/动态 Manifest 为准。
- **连接器边界**：曾在 CodexPro 嵌套调用 Windows PowerShell 服务管理脚本时遇到子进程输出异常，不能仅凭该现象断言普通 Windows 终端上的 `service.bat` 也故障。优先在本机直接运行原服务脚本确认；若服务已占端口，不要强杀或重复启动陌生进程。
- **服务进程不是交付凭据**：HTTP 200 只证明服务在响应，文章质量由来源与归档门禁独立确定。

## 后续独立事项（不阻断 V3 代码收尾）

1. 复核特定受限文章中尚未离线的媒体、文件附件和权限。**禁用下载按钮的附件不得使用隐藏接口绕过授权**。
2. 对从历史候选复制的媒体执行与当前飞书来源字节一致性的独立验证。在完成之前，保留 `policy.provisionalAssetReuse=true`、`historical_media_bytes_unverified` 以及 `unverified` 结论。
3. 需要将 `partial_verified` 候选正式发布到 `library/` 时，须另行获得明确授权，并先验证回退备份、发布事务、Reader 和 Explain 兼容性。
4. 如普通 Windows 控制台也能复现服务管理异常，单独立项修复并增加服务归属/重启回归；不得为消除错误绕开进程归属检查。

**收尾定义**：V3 工程改动通过测试、正式资料未被越权修改、规范和运行入口可供下一个 Agent 接手、本地 Git 提交独立完成；用户特定文章的资源补全和人工验收不随本阶段一同宣布完成。
