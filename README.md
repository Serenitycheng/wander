# 漫游

给日常一点新的可能：出去走走、在家探索、学点东西、做点东西，或者随机开始。每次提供几个可参与的入口，收藏留给以后，记录留给想记住的片刻。原“北京去哪儿玩”保留为独立出行子模块。

## 现有能力与边界

- 四个探索方向、每组三个选择、随机推荐、收藏与记录；支持偏好、反馈、排除领域和空间配色。
- 联网发现视频、书目、食谱和地点资料，提供实际来源；可选 DeepSeek 筛选与原生网页搜索，失败时使用公共来源与本地活动。
- 探索收藏、记录、偏好、配色和历史按账号保存在当前浏览器，支持导入、导出；尚无跨设备云同步。北京模块沿用独立云空间。
- 来源可能暂时不可用；书目不保证全文可读，地点资料不代表当天开放，推荐仍需使用者判断。
- 开启个性化会使用偏好、收藏标题与反馈摘要。账号访问限制取决于部署配置；当前不提供公开注册流程。

## 技术栈与运行

Next.js 16、React 19、TypeScript、pnpm 工作区；北京云空间使用 Neon PostgreSQL 与 Drizzle，地图使用高德服务。

需要 Node.js 24+ 与 pnpm 11。所有命令从仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

访问 `http://localhost:3000`。验证与生产运行：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:archive
pnpm start
```

## 环境变量与部署

参考 [`source/.env.example`](source/.env.example)，自己的值放在 `source/.env.local`，不要提交。

- 可选在线 AI：`DEEPSEEK_API_KEY`；`EXPLORATION_DEEPSEEK_MODEL`、`EXPLORATION_DEEPSEEK_BASE_URL` 单独覆盖探索接口，默认模型为 `deepseek-flash`。
- 北京地图：`NEXT_PUBLIC_AMAP_JS_KEY`、`AMAP_SECURITY_JS_CODE`、`AMAP_WEB_SERVICE_KEY`。
- 北京 AI：`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`，与服务端 `DEEPSEEK_API_KEY` 配合。
- 北京云空间：`DATABASE_URL`。
- 登录：`AUTH_SECRET`、`NEXT_PUBLIC_REQUIRE_AUTH`、`SERENITY_PASSWORD_SCRYPT`、`ZZZ_PASSWORD_SCRYPT`。密码配置只保存 scrypt 哈希。

本地探索流程不依赖第三方密钥；地图、AI、云空间与限制登录需相应配置。不要用 `NEXT_PUBLIC_` 变量保存服务端密钥。

已有 Vercel 项目名为 `beijing-qu-na-er-wan`。应用在 `source/`，依赖锁文件与 pnpm 工作区在仓库根目录；部署使用 Next.js 和现有 Git 关联，需保留仓库根目录的工作区文件。以仓库根目录构建时执行 `pnpm install --frozen-lockfile` 与 `pnpm build`，Next.js 输出位于 `source/.next`。现有项目的 Root Directory 与构建覆盖项应在部署前核对，本次没有改动这些设置。仓库改名不要求更改项目名或域名；环境变量改动需通过新部署生效。

代码入口为 `source/src/features/exploration/` 与 `source/src/features/beijing/`；详见[架构说明](docs/architecture.md)和[云同步检查](docs/cloud-sync-audit.md)。`archive/recovery-2026-09-09/` 保留原源码及出行数据库快照，另有个人偏好文档；公开前需要确认这些内容的公开范围。
