# 北京去哪儿玩恢复备份

恢复日期：2026-09-09。目标账号：Serenitycheng。仓库应保持 Private。

已导出 Neon 的全部 2 张 public 业务表：beijing_play_workspaces 1 行、beijing_play_workspace_versions 2 行。已保存列、约束及索引定义。线上源码正在恢复。

## 文件分类

- source/：从 Vercel 已部署版本恢复的源码。
- data/：数据库导出及结构说明，保留原表名、原始 JSON 内容。
- attachments/：文件存储对象，保留原路径，manifest.json 记录大小和 SHA-256。
- legacy/：既有 Git 仓库或旧版本资料（如有）。
- docs/：恢复说明和验证结果。

## 恢复范围

数据库是导出时间的快照；持续使用网站后产生的新内容不包含在本次快照中。源码来自服务器实际保留的部署文件，旧电脑未上传的文件与本地浏览器数据不等于已经恢复。

连接数据库和文件存储所用的明文服务密钥没有写入备份；重新运行应用时应在 Vercel 中重新配置。加密配置按原值保留，解密仍依赖原环境配置。
