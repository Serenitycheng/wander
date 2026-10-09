# 漫游

给日常一点新的可能：出去走走、在家探索、学点东西、做点东西，或者完全随机。

每次只给几个可立即开始的小入口。收藏留给以后，记录留给想记住的片刻。“北京去哪儿玩”保留为独立的北京出行子模块。

首页集中展示随机开始按钮和四个探索方向。右上角和“我的”都可调整整个空间的配色，所有页面保持一致，支持七种预设、自定义颜色和命名保存的配色方案，并按账号保存。

推荐优先联网发现作品、教程和活动，附可打开的来源；每组给出 3 个选择，混合具体推荐与可以自行选题的活动。换组时立即显示三个选择，后台查找新内容；在线结果不足时，从已发现内容和 72 个本地活动中补足。按账号记住展示历史，换组和刷新优先避开重复。

公开来源包含 B 站视频、书目、食谱和地点资料，先交错汇总再限制数量。播客和博客默认关闭；在“我的”主动开启后，每组合计最多 1 条，出现后休息两组。推荐区显示本轮真实来源与数量，登录失效或搜索失败时显示对应原因。

“我的”可以编辑兴趣、阅读清单和推荐开关。Serenity 预填已有书单的简短摘要；推荐结合这些线索与收藏标题，也保留陌生领域，另一账号不继承这些偏好。

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
- `source/src/features/exploration/online-discovery.ts`：在线来源解析；`discovery-client.ts`：联网优先与本地回退；`src/lib/server/exploration-discovery.ts`：服务端检索。
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

## 在线发现

- 有 `DEEPSEEK_API_KEY` 时，使用 DeepSeek 的 Anthropic 兼容接口调用原生网页搜索；推荐网址必须出现在本轮检索结果中。新接口不使用旧北京模块的 Responses 搜索实现。
- 没有密钥或模型搜索失败时，继续查询 B 站、Open Library、TheMealDB 与维基百科地点资料；主动允许播客后才查询 Apple Podcasts。视频标题、创作者与 BV 链接来自实际公开检索结果。每组固定 3 条，混合具体作品与阅读、唱歌、手工等开放方向，并分散活动形式。
- 公共书目不保证全文可读，英文食谱会明确标注语言；地点资料不代表当天开放。在线来源也可能暂时不可访问。
- 开启个性化时，发送已保存的兴趣、阅读清单和当前账号收藏标题；探索条件与最近展示标题用于筛选和去重。关闭个性化后不发送偏好与收藏；始终不发送记录里的感受、账号姓名或出发地址。
- 在线条目、收藏和展示历史保存在当前浏览器对应账号中，随备份导出/导入；跨设备打开在线详情需要导入包含该条目的备份。
- 新检索默认模型为 `deepseek-flash`；如需覆盖，使用独立的 `EXPLORATION_DEEPSEEK_MODEL`，避免影响北京模块。接口、超时与来源边界见 [架构说明](docs/architecture.md)。

### Vercel 配置入口

打开 [本项目的环境变量设置](https://vercel.com/sereni1/beijing-qu-na-er-wan/settings/environment-variables)，添加或更新服务端变量 `DEEPSEEK_API_KEY`，勾选需要使用的 Production / Preview 环境。探索默认使用 `deepseek-flash`，可选覆盖为 `EXPLORATION_DEEPSEEK_MODEL`；官方接口地址默认无需另填。

保存环境变量后重新部署，设置才会应用到新部署；见 [Vercel 环境变量说明](https://vercel.com/docs/environment-variables)。不要使用公开给浏览器的 `NEXT_PUBLIC_` 前缀存放密钥。

## 关于恢复备份

原 `data/`、`history/`、`recovered/`、压缩包和校验文件均集中到带日期的恢复目录，并保留重构前的 `source/` 完整副本。

原清单 310 个文件可继续逐个核验。恢复细节见 [备份说明](archive/README.md)；历史快照中的线上状态属于 2026-09-09，不能等同于今天的部署状态。
