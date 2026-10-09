import { activityForms, isCategory, isMood } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";

export const isOnlineIdeaId = (id: string) => /^(online|inspiration)-[a-f0-9]{16}$/.test(id);
export const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const boundedText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && Boolean(value.trim()) && value.length <= limit;

export function contentKey(title: string): string {
  const work = title.match(/《([^》]+)》/)?.[1] ?? title.replace(/^(去看看|试做一道|研究一道新菜[:：]|听一期|翻开|阅读|读一篇|看一集|学习|试试)/, "");
  return work.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function activityKind(idea: ExplorationIdea): string {
  if (idea.form) return idea.form;
  const title = idea.title;
  const url = idea.source?.url ?? "";
  // A tutorial is an entry to an activity, not automatically a watching task.
  if (/^(试|跟着|给|用|学着|为|做|画|写|玩|练|接触|和|找).*(配音|声音表演)/.test(title)) return "歌唱";
  if (/^(试|跟着|用|做|编|接触).*(编曲|节奏|旋律|采样|作曲)/.test(title)) return "音乐创作";
  if (/^(试|跟着|用|玩|接触).*(互动|模拟器|可视化工具)/.test(title)) return "交互探索";
  if (/^(试|跟着|学|练|放).*(舞|跳)/.test(title)) return "舞蹈";
  if (/^(试|跟着|学|练|打|找|接触).*(运动|瑜伽|拉伸|拳|球|体能)/.test(title)) return "运动";
  if (/^(和|约|找|给).*(朋友|家人|聊天|电话|对话)/.test(title) && !/棋|UNO|游戏|桌游/.test(title)) return "社交";
  if (/^(试|跟着|用|做|折|串|学|接触).*(手工|折纸|纸牌魔术|编织|刺绣|串珠|模型|黏土|拼贴)/.test(title)) return "手工";
  if (/^(画|试|跟着|用|学|为|做).*(画|速写|封面|设计|像素)/.test(title)) return "绘画";
  if (/^(写|抄|练字|练书法|试着写|试着抄|用.*写|给.*写).*(故事|诗|字|信|书法|歌词|纸条)/.test(title)) return "书写";
  if (/唱首|唱一首|跟唱|声乐/.test(title)) return "歌唱";
  if (/openlibrary\.org/.test(url) || /^读|翻开|阅读/.test(title)) return "阅读";
  if (/podcasts\.apple\.com/.test(url) || /^听/.test(title)) return "聆听";
  if (/themealdb\.com/.test(url) || /烹饪|烘焙|面包|咖啡|料理|食谱|做.*(面|饭|汤|饼|菜|蛋|三明治|酸奶)/.test(title)) return "烹饪";
  if (idea.place || idea.category === "outside") return "出门";
  if (/抄写|书法|写.*诗|日记/.test(title)) return "书写";
  if (/^(玩|试|和|来|下|学|接触).*(棋|桌游|UNO|游戏|拼图|解谜)/.test(title)) return "游戏";
  if (/bilibili\.com/.test(url) || /^看|点开|观看/.test(title) || /纪录片|电影|看一集|短片|视频/.test(title)) return "观看";
  return idea.domain ?? idea.category;
}

export function isChildrensPodcast(idea: ExplorationIdea): boolean {
  return /podcasts\.apple\.com/.test(idea.source?.url ?? "") &&
    /儿童|幼儿|宝宝|早教|胎教|儿歌|学龄前|[0-9]-[0-9]岁/.test(`${idea.title} ${idea.domain ?? ""}`);
}

export function isFeedIdea(idea: ExplorationIdea): boolean {
  return /podcasts\.apple\.com|xiaoyuzhoufm\.com|ximalaya\.com|(^|\/)blog\.|\/blogs?\/|medium\.com|substack\.com/i.test(idea.source?.url ?? "") ||
    /播客|博客|podcast|\bblog\b|newsletter/i.test(`${idea.title} ${idea.domain ?? ""} ${idea.source?.name ?? ""}`);
}

export function isLowQualityVideo(idea: Pick<ExplorationIdea, "title" | "source">): boolean {
  if (!/bilibili\.com/.test(idea.source?.url ?? "")) return false;
  // Filter promotional and sensational packaging, not whole subjects such as
  // history or crime. Existing snapshots remain readable in saved collections.
  return /震惊|不看后悔|速来领取|福利领取|福利购|粉丝福利|免费得|一键三连|评论.*领|抽奖|带货|全网都在|成年人看的|过不了审|成人故事|意外怀孕\d|性侵.{0,5}\d|囚禁\d+天|史上最爽|男人必看|女人必看|文本朗读语音大全|素材合集|语音素材|期末冲刺|全系列|全\d+集|[（(]1[-～]\d+集|全球.*知识大揭秘/.test(idea.title);
}

// Old public video templates bypassed curation. Keep snapshots readable, but
// do not recycle them as recommendations after the pipeline has been fixed.
export const isUncuratedPublicIdea = (idea: ExplorationIdea) => !idea.origin &&
  /发布的视频。/.test(idea.description) && /看看《/.test(idea.title) &&
  /从.+的这段内容里，看看一个具体的故事、想法或做法/.test(idea.why);

export function sourceUrl(value: unknown): string | null {
  if (!boundedText(value, 1800)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|uo$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

// The resource, rather than a model's changing wording, determines its identity.
export function onlineIdeaId(url: string): string {
  const value = sourceUrl(url) ?? url;
  let left = 2166136261;
  let right = 3335557771;
  for (let index = 0; index < value.length; index++) {
    left = Math.imul(left ^ value.charCodeAt(index), 16777619);
    right = Math.imul(right ^ value.charCodeAt(index), 2246822519);
  }
  return `online-${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseDiscoveredIdea(value: unknown): ExplorationIdea | null {
  if (!isObject(value)) return null;
  const hasSource = value.source !== undefined && value.source !== null;
  const source = isObject(value.source) ? value.source : null;
  const url = source ? sourceUrl(source.url) : null;
  const openActivity = !hasSource && value.origin === "deepseek" && value.approach === "open" &&
    activityForms.includes(value.form as typeof activityForms[number]) &&
    value.category !== "outside" && typeof value.title === "string" && !/《|https?:\/\//.test(`${value.title} ${value.description} ${value.firstStep}`);
  const expectedId = url ? onlineIdeaId(url) : openActivity ? inspirationIdeaId(String(value.category), String(value.title)) : null;
  if (!expectedId || value.id !== expectedId || !isCategory(value.category) ||
    !boundedText(value.title, 160) || !boundedText(value.description, 700) ||
    !Number.isInteger(value.minutes) || Number(value.minutes) < 5 || Number(value.minutes) > 480 ||
    !Array.isArray(value.moods) || value.moods.length < 1 || value.moods.length > 4 || !value.moods.every(isMood) ||
    !boundedText(value.why, 280) || !boundedText(value.firstStep, 900) ||
    (hasSource && (!source || !url || !boundedText(source.name, 120))) ||
    (source?.action !== undefined && !boundedText(source.action, 80)) ||
    (value.place !== undefined && !boundedText(value.place, 160)) ||
    (value.domain !== undefined && !boundedText(value.domain, 60)) ||
    (value.approach !== undefined && value.approach !== "open" && value.approach !== "specific") ||
    (value.angle !== undefined && !["familiar", "surprise", "play"].includes(String(value.angle))) ||
    (value.form !== undefined && !activityForms.includes(value.form as typeof activityForms[number])) ||
    (value.origin !== undefined && value.origin !== "deepseek" && value.origin !== "public") ||
    typeof value.discoveredAt !== "string" || value.discoveredAt.length > 40 || !Number.isFinite(Date.parse(value.discoveredAt))) return null;
  return {
    id: value.id as string, category: value.category, title: value.title.trim(),
    description: value.description.trim(), minutes: Number(value.minutes),
    moods: [...new Set(value.moods)], why: value.why.trim(), firstStep: value.firstStep.trim(),
    ...(source && url ? { source: { name: String(source.name).trim(), url, ...(source.action ? { action: String(source.action) } : {}) } } : {}),
    ...(value.place ? { place: value.place } : {}), ...(value.domain ? { domain: value.domain } : {}),
    ...(value.approach ? { approach: value.approach } : {}),
    ...(value.angle ? { angle: value.angle as ExplorationIdea["angle"] } : {}),
    ...(value.form ? { form: value.form as ExplorationIdea["form"] } : {}),
    ...(value.origin ? { origin: value.origin as ExplorationIdea["origin"] } : {}),
    discoveredAt: value.discoveredAt,
  };
}

export const inspirationIdeaId = (category: string, title: string) =>
  onlineIdeaId(`activity:${category}:${contentKey(title)}`).replace(/^online-/, "inspiration-");

export function parseDiscoveryResponse(value: unknown): ExplorationIdea[] {
  if (!isObject(value) || !Array.isArray(value.ideas)) return [];
  const ideas = new Map<string, ExplorationIdea>();
  for (const raw of value.ideas.slice(0, 24)) {
    const idea = parseDiscoveredIdea(raw);
    if (idea) ideas.set(idea.id, idea);
  }
  return [...ideas.values()];
}

export function rememberShown(previous: string[], next: string[]): string[] {
  const added = new Set(next);
  return [...previous.filter((id) => !added.has(id)), ...new Set(next)].slice(-600);
}
