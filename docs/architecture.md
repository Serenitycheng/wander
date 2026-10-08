# 开发结构与数据边界

## 目录

```text
wandering/
├── source/                    # 唯一运行中的 Next.js 应用
│   ├── src/app/               # 页面路由与服务端 API
│   │   ├── (exploration)/     # 首页、探索、详情、收藏、记录、我的
│   │   ├── beijing/           # 原北京出行功能及独立样式
│   │   └── api/               # 原接口与 exploration/discover 在线发现
│   ├── src/features/
│   │   ├── exploration/       # 新探索模型、内容、生成、存储、配色、组件与测试
│   │   │   ├── content/       # 首版条目与新增活动内容
│   │   │   ├── ideas.ts       # 当前推荐池、旧条目兼容查询
│   │   │   ├── discovery*.ts  # 来源校验、去重、检索方向与客户端请求
│   │   │   ├── online-discovery.ts # 公共来源与模型检索结果解析
│   │   │   └── styles/       # base / home / explore / pages / appearance
│   │   └── beijing/           # 原出行组件、活动库与模型
│   ├── src/components/auth/   # 两模块共用的登录入口
│   ├── src/lib/server/        # 高德、DeepSeek、会话、原云空间
│   ├── db/                    # 原数据库结构
│   └── public/                # 北京模块原素材
├── docs/                      # 产品说明、架构、改动与验证记录
│   ├── product/               # 用户提供的重构说明原文
│   └── design/               # original/ 原界面；current/ 本次验证截图
├── archive/                   # 只读恢复快照
├── scripts/verify-archive.mjs # 独立的恢复包完整性校验
├── package.json               # 统一命令入口
├── pnpm-workspace.yaml        # 工作区配置
└── pnpm-lock.yaml             # 唯一活动依赖锁文件
```

## 路由

- `/`：随机开始按钮与四个探索方向；北京模块保留小入口。
- `/explore`：模式、时间、状态选择；每轮最多三个建议。
- `/explore/[id]`：这是什么、为何适合、如何开始。
- `/favorites`：按四类分组收藏，可标记“最近想试”。
- `/records`：做了什么、当时感觉、是否想继续；日期和地点可选。
- `/me`：账号空间、配色、本机备份、北京模块入口。
- `/beijing`：原多人问答、三项推荐、路线、活动库与本周检索。

探索模式可用 `?mode=home|outside|learn|create|random` 直达并自动生成首轮建议，`?start=1` 也可自动生成；记录页的 `?idea=...` 会带入已选建议。

## 探索数据

- 本地池包含 70 个探索入口：出门 16、居家 16、学习 20、创作 18。主推荐优先从在线检索获得新内容，在线结果不足时补齐。
- 内容更新增加 33 个具体活动和 20 个开放活动，23 个空泛或吸引力较弱的首版条目退出推荐池。`allExplorationIdeas` 和 `findIdea` 保留全部 93 个稳定 ID，旧条目原文、收藏、记录和详情链接继续可用。
- 每轮固定 3 条建议，混合指定作品/活动与可自行选择题材、作品或做法的活动；通过可选 `approach: open|specific` 字段区分，旧快照未填写时按具体建议处理。活动不限定为用户已知的兴趣，也不新增兴趣画像或偏好问卷。
- 所选模式和可用时间是候选硬条件；心情与近期记录用于轻量排序。
- 完全随机优先返回不同方向；同一方向尽量分散领域和活动形式。新在线内容优先，另保留开放选择；缺项由符合时间和模式的本地活动补足。各候选池中未展示内容优先于心情排序，耗尽后轮换最早展示的条目。
- 地点条目只是常驻地点线索，不声明当天营业、票务、天气或展览情况。
- 作品、课程和互动练习可以配置 `source.action`，第一步按钮直接打开已核对的来源；没有直接来源的活动保留具体搜索词。阅读时长代表开始读一篇或一段，不暗示短时内读完整本书。
- 新功能不要求 DeepSeek、高德或数据库密钥，即可在本机使用。
- 新数据保存为 `free-exploration:space:v1:serenity|zzz`，包含版本、偏好、收藏、记录、`shownIdeaIds`（最多 600 个）与 `discoveredIdeas`（在线条目快照）。新增字段缺省为空，兼容旧版备份。
- 在线条目 ID 由规范化来源网址确定，追踪参数与改写标题不会产生新条目；收藏或记录引用的快照保留，其余缓存最多 240 条。导入备份合并快照与浏览历史，已有收藏内容优先保留。
- 本地静态详情继续预生成；`online-...` 详情从当前账号的快照读取。未保存或来自其他浏览器的链接显示缺少条目的说明，不伪造内容。
- 配色偏好增加可选 `tone` 和 `pageColors`，兼容旧版 v1 存储和备份；探索详情使用探索页颜色。
- 页面先使用独立颜色，再使用空间底色，最后兼容原苔绿/浅紫偏好。颜色仅接受六位十六进制值。
- 背景保留选中色相；按钮和强调文字在必要时自动加深，保证自定义浅色下的可读性。
- 保存前检查已有修订号；跨标签页收到存储通知时读取更新。过期修订不能直接覆盖较新的数据。
- 不兼容或损坏的存储内容保留原文，不自动重置；存储失败会显示提示。
- 备份导入按当前账号检查格式并合并；重复记录保留本机现有感受。
- 新收藏和记录目前只在本机保存，可通过“我的”导出和导入；尚未接入云同步。

## 在线检索边界

- 新接口为 `POST /api/exploration/discover`，服务端校验模式、时间、状态、历史长度、来源结构；启用账号保护时检查原登录会话，并限制请求频率。响应不可缓存到共享 CDN。
- 优先使用 DeepSeek `/anthropic/v1/messages` 与 `web_search_20250305`。默认 `deepseek-flash`；通过 `EXPLORATION_DEEPSEEK_MODEL` 和 `EXPLORATION_DEEPSEEK_BASE_URL` 可单独覆盖。
- 仅接受真实 `web_search_tool_result` 中的网址。只有模型 JSON、搜索未执行、网址不匹配或时间不合格都不能作为在线推荐。
- 公共检索并行查询书目、播客、食谱或北京地点资料；查询方向随每轮变化。公共来源上限约 8.5 秒，模型搜索约 22 秒，客户端约 28 秒，失败后有可见回退说明。
- 浏览器取消旧请求；连续换方向或切换账号时，晚到的响应不会覆盖新的页面与空间。
- 不获取用户定位，不发送感受记录，不在浏览器暴露密钥，不写入原北京云空间。当前本地环境没有模型密钥，模型支路的真实调用需要在配置了密钥的环境中验证。
- 实现依据：[DeepSeek Anthropic 兼容接口](https://api-docs.deepseek.com/guides/anthropic_api/)、[原生网页搜索说明](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)、[搜索结果结构](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)。

## 保留原出行数据

- 北京模块继续使用 `beijing-play:space:*` 和 `beijing-play:history:*`。
- `/api/workspace`、原 Neon 表、修订保护和账号权限不变。
- 新探索数据不会写入或迁移原北京云空间。
- `/beijing?space=zzz` 可从主产品打开对应空间；登录后仍受原账号权限限制。
- 北京模块的基础样式和主题变量限定在 `.beijing-module`，返回主产品时不会改变它的字体与背景。
- 两模块共用原 scrypt 密码验证和登录会话，`NEXT_PUBLIC_REQUIRE_AUTH=true` 时启用登录门槛。
- 未配置云服务时，旧模块仍明确显示缺少接入信息；不能把本地预览等同于真实服务验证。

## 恢复快照

整理前已核验原清单 310 个文件。所有备份文件迁入 `archive/recovery-2026-09-09/`；原 `source/`、根 README 和 `.gitattributes` 另存完整副本，使原校验清单继续成立。活动源码与原始快照分开维护。
