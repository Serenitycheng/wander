import type { ActivityForm, ExplorationMode } from "./types.ts";
import type { DiscoveryPersonalization } from "./profile.ts";
import { isMutedContent } from "./activity-diversity.ts";
import { interestDirections } from "./interest-discovery.ts";
import { activityTopics } from "./activity-affinity.ts";

// These are search directions, not a fixed list of activities or titles.
export type DiscoveryDirection = {
  query: string; domain: string; form: ActivityForm;
  practice?: { match: RegExp; start: string };
};
const direction = (query: string, domain: string, form: ActivityForm = "观看", practice?: DiscoveryDirection["practice"]): DiscoveryDirection =>
  ({ query, domain, form, ...(practice ? { practice } : {}) });
const topics: Record<Exclude<ExplorationMode, "random">, DiscoveryDirection[]> = {
  outside: [
    direction("北京 攀岩 新手 体验", "运动", "运动"), direction("北京 现场音乐 小型演出", "音乐", "出门"),
    direction("北京 城市徒步 老建筑", "设计", "出门"), direction("北京 陶艺 工作坊", "手工", "手工"),
    direction("北京 桌游 店 活动", "游戏", "游戏"), direction("北京 羽毛球 场地", "运动", "运动"),
    direction("北京 观鸟 公园", "自然", "出门"), direction("北京 独立书店", "文学", "出门"),
    direction("北京 街头速写", "绘画", "绘画"), direction("北京 即兴戏剧 体验", "戏剧", "社交"),
    direction("北京 市集 手作", "手工", "出门"), direction("北京 博物馆 特展", "历史", "出门"),
  ],
  home: [
    direction("AI 绘画 场景 提示词 创作", "绘画", "绘画", { match: /绘画|生图|文生图|图像生成|场景.*提示词/, start: "在自己可用的图像生成工具里描述一个脑海中的场景，生成后挑一个最想改的细节继续调整。" }),
    direction("唱歌 伴奏 跟唱", "音乐", "歌唱", { match: /唱|伴奏|声乐/, start: "打开歌词或伴奏，挑想唱的一段，跟着试一遍。" }),
    direction("纸牌 魔术 入门 教学", "手工", "手工", { match: /纸牌|扑克|魔术/, start: "找一副普通纸牌，先选视频里的一个小把戏试试。" }),
    direction("桌游 双人 规则 入门", "游戏", "游戏", { match: /桌游|双人|规则/, start: "先看看要用什么和怎么赢，材料合适时和朋友试一局。" }),
    direction("配音 入门 片段", "配音", "歌唱", { match: /配音|声音表演|声优/, start: "选一小段喜欢的对白，先听原声，再用自己的声音试试；不用发布或录好成品。" }),
    direction("街舞 零基础 跟练", "舞蹈", "舞蹈", { match: /舞|跟练/, start: "腾出一点空间，选视频里适合自己体力的动作，跟一小段。" }),
    direction("手机 编曲 节奏 入门", "音乐", "音乐创作", { match: /编曲|节奏|音乐|旋律/, start: "先看看教程用的工具，打开其中一个，试着换鼓点或旋律。" }),
    direction("解谜 游戏 试玩 机制", "游戏"), direction("爵士 现场 演出", "音乐", "聆听"),
    direction("创意 写作 故事 开头", "文学", "书写", { match: /写作|故事|小说/, start: "选一种让你想写的故事，借教程里的一个办法写个开头，题目自己选。" }),
    direction("历史 人物 纪录片", "历史"), direction("短篇小说 试读", "文学", "阅读"),
    direction("植物 阳台 园艺 入门", "自然"), direction("烹饪 家常菜", "饮食", "知识"),
    direction("朋友 纸笔 游戏 规则", "社交", "游戏", { match: /游戏|纸笔|规则/, start: "拿纸笔，挑规则能直接看懂的玩法，找个人试一轮。" }),
    direction("电影 幕后 道具 制作", "影像"), direction("日常 拉伸 跟练 初学", "运动", "运动", { match: /拉伸|跟练|运动/, start: "腾出能活动的地方，选择适合自己的轻量动作，舒服地跟一小段。" }),
  ],
  learn: [
    direction("游戏设计 关卡 可玩 原型 入门", "游戏", "交互探索", { match: /游戏|关卡|原型/, start: "打开教程里提到的工具或可玩原型，先改一个机制或试一关，看变化。" }),
    direction("音乐 编曲 浏览器 入门", "音乐", "音乐创作", { match: /编曲|音乐|节奏/, start: "打开教程里的工具，边播放边换一个鼓点或音符，先听变化。" }),
    direction("语言 发音 入门 日常 对话", "语言", "知识", { match: /发音|语言|对话/, start: "选自己想接触的语言，听一句日常表达，再跟着说一次。" }),
    direction("Blender 新手 建模 入门", "设计", "交互探索", { match: /Blender|建模/i, start: "有软件时跟着移动一个物体、改一个形状；也可以先看建模的过程再决定是否安装。" }),
    direction("国际象棋 基础 互动", "游戏", "游戏", { match: /象棋|棋|互动/, start: "找教程里的棋盘或交互练习，试着走一个棋子，看它能到哪里。" }),
    direction("摄影 手机 构图 入门", "摄影", "交互探索", { match: /摄影|构图/, start: "拿手机对准自己想拍的东西，试视频中的一种构图，看看画面如何改变。" }),
    direction("字体 排版 设计 入门", "设计"), direction("心理 博弈 互动 游戏", "心理", "交互探索"),
    direction("方言 词源 地域 文化", "语言"), direction("机械 动画 原理", "科学"),
    direction("植物 辨认 入门", "自然"), direction("社会学 生活方式 田野", "社会"),
    direction("哲学 思想 实验 入门", "哲学"), direction("考古 文物 工艺", "历史"),
    direction("编程 浏览器 互动 创作 新手", "编程", "交互探索", { match: /编程|互动|创作/, start: "打开教程的可编辑示例，改一行文字或一个参数，看看运行结果。" }),
    direction("电影 镜头 叙事", "影像"),
  ],
  create: [
    direction("AI 写歌 画面 歌词 音乐 创作", "音乐", "音乐创作", { match: /写歌|歌词|音乐生成|AI.*作曲|Suno/i, start: "把一个想象中的画面写成歌词或音乐描述，在自己可用的写歌工具里试一个版本，再按听感改节奏或声音。" }),
    direction("折纸 有趣 教程", "手工", "手工", { match: /折纸|纸/, start: "拿张纸，选一个自己想折的东西，跟着第一步试。" }),
    direction("像素画 初学 教程", "绘画", "绘画", { match: /像素|画/, start: "用教程里的画图工具，先画一个想做成像素图的小东西。" }),
    direction("配音 入门 片段", "配音", "歌唱", { match: /配音|声优/, start: "选一个自己喜欢的角色，听一句原对白，再配一次自己的版本。" }),
    direction("节奏 采样 编曲 入门", "音乐", "音乐创作", { match: /节奏|采样|编曲/, start: "打开教程里的工具，选一段声音，换换速度或鼓点，先听一个版本。" }),
    direction("拼贴 旧杂志 手工", "手工", "手工", { match: /拼贴|杂志/, start: "找不用的纸张、照片或杂志，按自己的主题拼一个画面。" }),
    direction("游戏 原型 Scratch 教程", "编程", "交互探索", { match: /游戏|Scratch|原型/i, start: "打开教程的示例，试着改角色、规则或声音，让它按自己的想法动起来。" }),
    direction("速写 人物 入门", "绘画", "绘画", { match: /速写|人物|画/, start: "用手边的笔，选一个愿意画的人物或参考，从主要轮廓开始。" }),
    direction("纳兰词 书法 硬笔", "文学", "书写", { match: /纳兰|书法|硬笔/, start: "挑自己喜欢的一首词，用手边的笔抄几句，想练字就看看参考写法。" }),
    direction("黏土 小摆件 教程", "手工", "手工", { match: /黏土|摆件/, start: "有材料时选一个自己想做的造型，先捏主体；没有材料可先看看做法。" }),
    direction("封面 排版 设计 教程", "设计", "绘画", { match: /封面|排版|设计/, start: "为喜欢的一首歌或一本书建一个画面，试一种自己想用的字体与布局。" }),
    direction("烹饪 简单 食谱", "饮食", "知识"), direction("故事 短剧 写作 入门", "文学", "书写"),
  ],
};

export function discoveryDirections(mode: ExplorationMode, seed: number, profile?: DiscoveryPersonalization,
  recent: Array<{ form: string; domain: string }> = []): DiscoveryDirection[] {
  const personal = interestDirections(mode, profile);
  const pool = [...personal, ...(mode === "random" ? Object.values(topics).flat() : topics[mode])]
    .filter((item) => !isMutedContent({ title: item.query, domain: item.domain, description: "" }, profile?.mutedTopics));
  let state = seed >>> 0;
  const ranked = pool.map((item) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const tags = activityTopics({ title: item.query, description: "" });
    const affinity = (examples: NonNullable<DiscoveryPersonalization["feedback"]>["moreExamples"]) => Math.max(0,
      ...(examples ?? []).map((example) => example.topics.filter((topic) => tags.includes(topic)).length * 2 +
        (example.domain === item.domain ? 0.5 : 0)));
    const feedback = affinity(profile?.feedback?.moreExamples) - affinity(profile?.feedback?.lessExamples);
    return { item, personal: personal.includes(item), recent: recent.filter((past) => past.domain === item.domain).length, feedback, weight: state };
  }).sort((a, b) => a.recent - b.recent || b.feedback - a.feedback || Number(b.personal) - Number(a.personal) || b.weight - a.weight);
  const selected: DiscoveryDirection[] = [];
  for (const varied of [true, false]) for (const { item } of ranked) {
    if (selected.length === 3) break;
    if (personal.includes(item) && selected.filter((chosen) => personal.includes(chosen)).length >= 2) continue;
    if (selected.includes(item) || (varied && selected.some((chosen) => chosen.domain === item.domain))) continue;
    selected.push(item);
  }
  return selected;
}

export const discoveryTopics = (mode: ExplorationMode, seed: number, profile?: DiscoveryPersonalization,
  recent: Array<{ form: string; domain: string }> = []) => discoveryDirections(mode, seed, profile, recent).map((item) => item.query);
