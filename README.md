# 自由探索

给日常一点新的可能：出去走走、在家探索、学点东西、做点东西，或者完全随机。

每次只给几个可立即开始的小入口。收藏留给以后，记录留给想记住的片刻。“北京去哪儿玩”保留为独立的北京出行子模块。

首页集中展示随机开始按钮和四个探索方向。右上角可单独调整当前页面颜色；“我的”可设置整个空间的底色，支持七种预设与自定义颜色。

当前有 50 个推荐活动，涉及具体书籍、纪录片、音乐、运动、烹饪、桌游、手作、自然和技术等领域。活动提供明确的开始方式；部分作品和教程可直接打开。

## 本地运行

需要 Node.js 24+ 与 pnpm 11。所有命令从这个仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://localhost:3000 。主产品的探索、收藏和记录可直接在本机使用，无需配置第三方密钥。

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:archive
```

## 从哪里改

- `source/`：唯一开发应用；包含 Next.js 16、React 19 和 TypeScript。
- `source/src/features/exploration/`：新探索内容、推荐生成、收藏、记录及页面组件。
- `source/src/features/exploration/content/`：探索活动内容；`ideas.ts` 管理推荐池及旧条目查询。
- `source/src/features/exploration/styles/`：基础布局、首页、探索、内容页与配色控件的独立样式。
- `source/src/features/beijing/`：保留的原北京出行功能。
- `docs/`：产品原文、架构说明、更新记录、验证结果和界面参考。
- `archive/recovery-2026-09-09/`：完整原始恢复快照，只做保存与核验。
- `scripts/`：恢复快照校验工具。

详细结构见 [架构说明](docs/architecture.md)，本次范围见 [重构实现](docs/implementation.md)，验证结果见 [验证记录](docs/validation.md)。

## 数据与账号

- 新收藏和记录按 Serenity/zzz 分别保存在本机浏览器中；“我的”支持导入、导出。
- 原北京浏览器草稿和 Neon 云空间保留，新的探索数据不会覆盖它们。
- 北京模块的天气、地图、AI 检索和云同步需要原服务配置，模板在 `source/.env.example`。
- 登录沿用原 scrypt 密码验证；启用 `NEXT_PUBLIC_REQUIRE_AUTH=true` 后继续限制账号访问。
- 本地密钥放在 `source/.env.local`，不要提交；本次重构没有读取或更改线上密钥、生产数据。

## 关于恢复备份

原 `data/`、`history/`、`recovered/`、压缩包和校验文件均集中到带日期的恢复目录，并保留重构前的 `source/` 完整副本。

原清单 310 个文件可继续逐个核验。恢复细节见 [备份说明](archive/README.md)；历史快照中的线上状态属于 2026-09-09，不能等同于今天的部署状态。
