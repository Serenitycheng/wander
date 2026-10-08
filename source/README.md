# 漫游应用

本目录是唯一开发源码，主产品版本为 v2.0.0。依赖锁文件和 pnpm 工作区配置位于上一层仓库根目录。

## 常用命令

从仓库根目录运行 `pnpm dev`、`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`。

## 功能位置

- `src/features/exploration/`：四类探索内容、随机生成、收藏、记录和本机存储。
- `src/features/exploration/content/`：首版及新增活动；`ideas.ts` 管理 50 个推荐活动，保留退出推荐池条目的稳定 ID。
- `src/features/exploration/styles/`：按页面和用途拆分的主产品样式。
- `src/features/beijing/`：原多人出行功能、活动库、路线与相关类型。
- `src/app/(exploration)/`：首页、探索、详情、收藏、记录、我的。
- `src/app/beijing/`：原北京模块页面和样式。
- `src/app/api/`、`src/lib/server/`：保留的第三方服务与原云空间接口。
- `src/components/auth/`：共用的账号登录界面。

新探索功能可离线生成建议，收藏和记录按账号保存在本机。北京模块沿用原来的登录、存储键和 Neon 云空间。

环境变量仍从应用目录读取。需要接入原服务时，依据 `.env.example` 配置 `source/.env.local`；没有实际配置时不声明实时服务正常。

更多说明见 [仓库首页](../README.md)、[架构](../docs/architecture.md)与[本次重构](../docs/implementation.md)。历史更新位于 [更新记录](../docs/CHANGELOG.md)。
