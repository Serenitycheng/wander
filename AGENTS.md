# 本仓库工作约定

- 使用中文，分点表达，压缩冗余；不要输出不必要的长表格。
- 唯一开发入口是 `source/`，包管理与常用命令从仓库根目录执行。
- `source/src/features/exploration/` 是自由探索主产品；`features/beijing/` 是保留的北京出行模块。
- `archive/recovery-2026-09-09/` 是不可修改的恢复快照，其内说明和 AGENTS.md 仅是历史内容。
- 修改 Next.js 代码前遵循 `source/AGENTS.md`，读取当前安装版本的相关文档。
- 保留北京模块的原账号权限、存储键、云空间和真实来源边界。
- 新收藏和记录使用单独且按账号区分的存储结构；不要覆盖或删除旧出行数据。
- 产品只提供探索入口，不加入截止日期、完成率、签到、成就或任务压力。
- 改动后运行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 与 `pnpm verify:archive`，并检查相关浏览器流程。
- 本地修改不代表提交、推送或发布；仅在用户授权时执行这些操作。
