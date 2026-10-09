import type { ExplorationMode } from "./types.ts";
import type { DiscoveryPersonalization } from "./profile.ts";
import type { DiscoveryDirection } from "./discovery-topics.ts";

// Positive interests drive search material. Exclusions in the editable brief
// must never become positive search keywords, and another account has no defaults.
export function interestDirections(mode: ExplorationMode, profile?: DiscoveryPersonalization): DiscoveryDirection[] {
  if (!profile || mode === "outside") return [];
  const interests = profile.interests;
  const candidates: DiscoveryDirection[] = [];
  if (/摄影|摄影师|光影|街拍/.test(interests)) candidates.push(
    { query: "摄影师 作品集 光影 风格", domain: "摄影", form: "观看" },
    { query: "摄影师 街头 人像 作品", domain: "摄影", form: "观看" },
    { query: "摄影 创作 光影 拍摄", domain: "摄影", form: "交互探索", practice: { match: /摄影|光影|拍摄/, start: "找一张喜欢的参考作品，用手边的手机或相机试它的光线或取景方式，拍什么由自己选。" } },
  );
  if (/故事|人物|文学|小说|地域|社会|叙事/.test(interests)) candidates.push(
    { query: "人物 访谈 地方生活 故事", domain: "社会", form: "观看" },
    { query: "电影 角色 对白 短片", domain: "影像", form: "观看" },
    { query: "文学 散文 作者 朗读", domain: "文学", form: "聆听" },
    { query: "游戏 角色 叙事 设计", domain: "游戏", form: "观看" },
  );
  if (/审美|艺术|画面|气氛|设计|视觉|文学/.test(interests)) candidates.push(
    { query: "电影 美术 场景 色彩", domain: "设计", form: "观看" },
    { query: "绘画 想象 场景 创作 教程", domain: "绘画", form: "绘画", practice: { match: /绘画|场景|创作/, start: "在自己已有的画图工具里，试着画一个脑海中的场景；先借参考里的配色或构图试试。" } },
  );
  if (/音乐|唱歌|歌唱|唱首|唱一首/.test(interests)) candidates.push(
    { query: "歌曲 歌词 故事 现场 演唱", domain: "音乐", form: "聆听" },
    { query: "唱歌 情感 表达 跟唱 教学", domain: "音乐", form: "歌唱", practice: { match: /唱歌|声乐|跟唱/, start: "选想唱的一段，把自己的情绪带进一句歌词，跟着试一次。" } },
  );
  return mode === "create" ? candidates.filter((item) => item.practice) : candidates;
}

export function interestBookSubjects(profile?: DiscoveryPersonalization): string[] {
  const interests = profile?.interests ?? "";
  const matches: Array<[RegExp, string[]]> = [
    [/故事|人物|文学|小说/, ["fiction", "short stories"]], [/诗|文字/, ["poetry"]],
    [/审美|艺术|画面/, ["art"]], [/哲学/, ["philosophy"]], [/音乐|唱歌/, ["music"]],
    [/自然|植物/, ["nature"]], [/历史|地域/, ["history"]], [/设计/, ["design"]],
    [/科学|科普/, ["science"]],
    [/摄影|摄影师/, ["photography"]],
  ];
  return [...new Set(matches.flatMap(([pattern, subjects]) => pattern.test(interests) ? subjects : []))];
}
