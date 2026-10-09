import { activityKind } from "./discovery.ts";
import type { ExplorationIdea } from "./types.ts";

// The topic and the way of taking part are separate: a film about cooking is
// still watching, and two different astronomy videos are still one field.
const domains: Array<[string, RegExp]> = [
  ["天文", /天文|观星|星图|黑洞|恒星|行星|星座|月球|太阳系|宇宙|astronom/i],
  ["配音", /配音|声音表演|声优/], ["舞蹈", /舞蹈|街舞|爵士舞/],
  ["音乐", /音乐|唱歌|歌唱|伴奏|爵士|专辑|旋律|编曲|乐理|乐器|节奏|吉他|钢琴|民谣/],
  ["游戏", /游戏|桌游|纸牌|扑克|解谜|拼图|UNO|国际象棋|围棋|五子棋/i],
  ["语言", /语言|口音|方言|发音|外语|词源/], ["编程", /编程|程序|Scratch|交互代码/i],
  ["设计", /设计|排版|字体|建模|Blender|建筑|封面|藏书票/i],
  ["绘画", /绘画|速写|水彩|漫画|像素画/], ["手工", /手工|折纸|刺绣|编织|黏土|串珠|木工|模型|拼贴|陶艺/],
  ["运动", /运动|攀岩|骑行|滑冰|滑板|球场|羽毛球|篮球|瑜伽|拉伸|游泳|拳击/],
  ["社交", /聊天|朋友|家人|对话|社交|电话/], ["心理", /心理|博弈|信任|行为|认知/],
  ["饮食", /饮食|烹饪|食谱|菜式|烘焙|咖啡|料理|餐馆|小吃|面馆/],
  ["自然", /自然|植物|园艺|观鸟|鸟类|动物|地质|生态|公园/],
  ["摄影", /摄影|相机|构图|胶片/], ["文学", /文学|小说|散文|诗词|纳兰|书写|写作/],
  ["历史", /历史|考古|古代|博物馆/], ["影像", /电影|纪录片|影像|镜头|剪辑|动画/],
  ["哲学", /哲学|伦理/], ["社会", /社会|人类学|民族|地域|地理|生活方式/],
  ["科学", /科学|物理|化学|数学|机械|工程|生物/],
];

export function activityDomain(idea: Pick<ExplorationIdea, "title" | "domain"> & Partial<Pick<ExplorationIdea, "description">>): string {
  // A supplied domain is stronger than incidental words in a description.
  for (const text of [idea.domain ?? "", idea.title, idea.description ?? ""]) {
    const found = domains.find(([, pattern]) => pattern.test(text));
    if (found) return found[0];
  }
  return idea.domain && !/^(视频|观看|知识|爱好|教程|阅读)$/.test(idea.domain) ? idea.domain : "综合";
}

export function isMutedContent(idea: Pick<ExplorationIdea, "title" | "domain" | "description">, mutedTopics = ""): boolean {
  const muted = mutedTopics.split(/[\n、，,；;]+/).map((topic) => topic.trim()).filter(Boolean);
  const text = `${idea.title} ${idea.domain ?? ""} ${idea.description}`;
  return muted.some((topic) => {
    const aliases = domains.find(([name]) => name === topic)?.[1];
    const domain = activityDomain(idea);
    return aliases ? domain === topic || (domain === "综合" && aliases.test(text)) : text.toLowerCase().includes(topic.toLowerCase());
  });
}

export const isHandsOn = (idea: ExplorationIdea) =>
  ["歌唱", "音乐创作", "游戏", "舞蹈", "运动", "手工", "绘画", "书写", "社交", "交互探索"].includes(activityKind(idea)) || idea.category === "create";

export function hasUsableEntry(idea: ExplorationIdea): boolean {
  // An open direction may leave the work undecided, but it must still offer a
  // usable entry rather than sending someone back to an empty search box.
  return !/^(去)?(搜索|上网查|找找|查找)(一下)?(相关资料|感兴趣的内容|一些资料|相关内容)[。！!]?\s*$/.test(idea.firstStep.trim()) &&
    !(idea.approach === "open" && /^(探索新领域|了解新知识|找点有趣的事|试试新爱好)[。！!]?\s*$/.test(idea.title.trim()));
}
