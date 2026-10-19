# v0.1.1 Windows x64 便携版（预发布）

发布类型：**Pre-release**。保留既有 v0.1.0，不覆盖旧包，也不标记稳定版 Latest。GitHub 私有仓库，仅授权账号可下载。

## 主要变化

- V3 飞书归档来源保真：加强虚拟化长文与 Callout 内层连续性校验，以稳定 recordId 保留内容与媒体位置，过滤加载占位图。
- 保留未下载媒体和受限附件的可见占位；不将不完整内容误报为完成。
- 统一质量门禁、候选隔离预览、事务式发布与备份恢复；旧媒体未经当前源字节核验不升级为 verified。
- 补充 V3 收尾文档与回归测试；保留原文、账号配置及用户资料，不执行迁移或覆盖。

## 使用与范围

从 Assets 下载 `feishu-notes-0.1.1-windows-x64.zip` 与 `SHA256SUMS.txt`，对 ZIP 核验 SHA-256，再解压到独立可写目录。便携包包含 Node.js Windows x64 运行时与锁定依赖，无需用户另外安装 Node/npm。采集飞书文档需要安装 Chrome，按照 README 登录专用 Profile；离线 Reader 不要求联网或飞书登录。

## 验收与限制

本项目已完成 Windows 10 x64 主机上的自动回归（包括 Archive Quality、Reader、Range、Agent、事务恢复和私有资料基线）。v0.1.0 曾完成本机独立解压安装、模拟离线播放与迁移；**这些历史测试不可直接替代 v0.1.1 ZIP 验收**，实际发行包必须按其 BUILD-MANIFEST 与 SHA-256 单独核对。

**尚未完成**：真正全新 Windows 系统或新电脑的首次安装；全新 Chrome Profile 的真实飞书首次登录、抓取、权限与媒体确认；Windows 11、ARM64 的支持认证。不得描述为稳定版，也不得保证所有受权限限制的媒体可下载。源归档的完整性必须按具体文章质量门禁独立判断。

升级请先备份资料库与配置，把新版本解压到新目录，迁入完整 `library/` 并保留旧安装回退。不要复制 Chrome Profile 作为跨电脑凭据。

构建验收的具体提交、Node 版本、ZIP 大小与哈希以 GitHub Release 正文以及包内 `BUILD-MANIFEST.json` 为准；未核验制品前不得发布。
