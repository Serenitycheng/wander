import { isCategory, isMood } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";

export const isOnlineIdeaId = (id: string) => /^online-[a-f0-9]{16}$/.test(id);
export const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const boundedText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && Boolean(value.trim()) && value.length <= limit;

export function contentKey(title: string): string {
  const work = title.match(/《([^》]+)》/)?.[1] ?? title.replace(/^(去看看|试做一道|研究一道新菜[:：]|听一期|翻开|阅读|读一篇|看一集|学习|试试)/, "");
  return work.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function activityKind(idea: ExplorationIdea): string {
  const title = idea.title;
  const url = idea.source?.url ?? "";
  if (/唱首|唱一首|跟唱|声乐/.test(title)) return "歌唱";
  if (/podcasts\.apple\.com/.test(url) || /^听|专辑|爵士|音乐/.test(title)) return "聆听";
  if (/themealdb\.com/.test(url) || /烹饪|烘焙|面包|咖啡|料理|食谱|做.*(面|饭|汤|饼|菜|蛋|三明治|酸奶)/.test(title)) return "烹饪";
  if (idea.place || idea.category === "outside") return "出门";
  if (/抄写|书法|写.*诗|日记/.test(title)) return "书写";
  if (/openlibrary\.org/.test(url) || /^读|翻开|阅读/.test(title)) return "阅读";
  if (/bilibili\.com/.test(url) || /纪录片|电影|看一集|短片|视频/.test(title)) return "观看";
  if (/棋|桌游|UNO|游戏|拼图/.test(title)) return "游戏";
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
  if (!isObject(value) || !isObject(value.source)) return null;
  const url = sourceUrl(value.source.url);
  if (!url || value.id !== onlineIdeaId(url) || !isCategory(value.category) ||
    !boundedText(value.title, 160) || !boundedText(value.description, 700) ||
    !Number.isInteger(value.minutes) || Number(value.minutes) < 5 || Number(value.minutes) > 480 ||
    !Array.isArray(value.moods) || value.moods.length < 1 || value.moods.length > 4 || !value.moods.every(isMood) ||
    !boundedText(value.why, 280) || !boundedText(value.firstStep, 900) ||
    !boundedText(value.source.name, 120) ||
    (value.source.action !== undefined && !boundedText(value.source.action, 80)) ||
    (value.place !== undefined && !boundedText(value.place, 160)) ||
    (value.domain !== undefined && !boundedText(value.domain, 60)) ||
    (value.approach !== undefined && value.approach !== "open" && value.approach !== "specific") ||
    typeof value.discoveredAt !== "string" || value.discoveredAt.length > 40 || !Number.isFinite(Date.parse(value.discoveredAt))) return null;
  return {
    id: value.id as string, category: value.category, title: value.title.trim(),
    description: value.description.trim(), minutes: Number(value.minutes),
    moods: [...new Set(value.moods)], why: value.why.trim(), firstStep: value.firstStep.trim(),
    source: { name: value.source.name.trim(), url, ...(value.source.action ? { action: value.source.action } : {}) },
    ...(value.place ? { place: value.place } : {}), ...(value.domain ? { domain: value.domain } : {}),
    ...(value.approach ? { approach: value.approach } : {}),
    discoveredAt: value.discoveredAt,
  };
}

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
