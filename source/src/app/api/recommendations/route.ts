import { NextResponse } from "next/server";
import { activityCategories } from "@/lib/activity-data";
import { buildRecommendations } from "@/lib/recommendation";
import { searchBeijingPlaces } from "@/lib/server/amap";
import { DeepSeekRequestError, deepSeekStructuredSearch } from "@/lib/server/deepseek";
import { normalizeActivityCategory, normalizeTripDraft } from "@/lib/types";
import type { Activity, ActivityCategory, Recommendation, RecommendationSearchResult, RecommendationSource, TripDraft } from "@/lib/types";

export const maxDuration = 60;

type DiscoveryCandidate = {
  title: string;
  category: ActivityCategory;
  venue: string;
  area: string;
  summary: string;
  durationMin: number;
  durationMax: number;
  budgetMin: number;
  budgetMax: number;
  energy: Activity["energy"];
  indoor: boolean;
  dateText: string;
  officialSourceName: string;
  officialSourceUrl: string;
  xiaohongshuSourceName: string;
  xiaohongshuSourceUrl: string;
};

type DiscoveryResult = { candidates: DiscoveryCandidate[] };

const candidateProperties = {
  title: { type: "string" }, category: { type: "string", enum: activityCategories }, venue: { type: "string" }, area: { type: "string" },
  summary: { type: "string" }, durationMin: { type: "number" }, durationMax: { type: "number" }, budgetMin: { type: "number" }, budgetMax: { type: "number" },
  energy: { type: "string", enum: ["轻松", "适中", "有挑战"] }, indoor: { type: "boolean" }, dateText: { type: "string" },
  officialSourceName: { type: "string" }, officialSourceUrl: { type: "string" }, xiaohongshuSourceName: { type: "string" }, xiaohongshuSourceUrl: { type: "string" },
} as const;

const discoverySchema = {
  type: "object", additionalProperties: false,
  properties: { candidates: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: candidateProperties, required: Object.keys(candidateProperties) } } },
  required: ["candidates"],
} as const;

const officialHosts = ["dpm.org.cn", "chnmuseum.cn", "namoc.org", "cstm.org.cn", "bjartmuseum.com", "bjp.org.cn", "beijing.gov.cn", "visitbeijing.com.cn", "whtbj.gov.cn"];
const validUrl = (value: string) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url : null; } catch { return null; } };
const officialUrl = (value: string) => { const url = validUrl(value); return url && (url.hostname.endsWith(".gov.cn") || officialHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) ? url : null; };
const xhsUrl = (value: string) => { const url = validUrl(value); return url && (url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com")) ? url : null; };

const isCandidate = (value: unknown): value is DiscoveryCandidate => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const strings = ["title", "venue", "area", "summary", "dateText", "officialSourceName", "officialSourceUrl", "xiaohongshuSourceName", "xiaohongshuSourceUrl"];
  const numbers = ["durationMin", "durationMax", "budgetMin", "budgetMax"];
  return strings.every((key) => typeof item[key] === "string") && numbers.every((key) => typeof item[key] === "number" && Number.isFinite(item[key]))
    && typeof item.indoor === "boolean" && activityCategories.includes(item.category as ActivityCategory) && ["轻松", "适中", "有挑战"].includes(String(item.energy));
};

const isDiscovery = (value: unknown): value is DiscoveryResult => {
  const candidates = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).candidates : null;
  return Array.isArray(candidates) && candidates.every(isCandidate);
};

const categoriesFor = (draft: TripDraft): ActivityCategory[] => [...new Set(
  draft.participantIds.flatMap((id) => draft.answers[id].interests)
    .map(normalizeActivityCategory)
    .filter((category): category is ActivityCategory => Boolean(category)),
)];
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, Math.round(value)));
const amapUrl = (place: { lng: number; lat: number; name: string }) => `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(place.name)}&src=beijing-play`;

const vetoed = (candidate: DiscoveryCandidate, draft: TripDraft) => {
  const vetoes = draft.participantIds.flatMap((id) => draft.answers[id].vetoes).join(" ");
  const text = `${candidate.title} ${candidate.summary} ${candidate.category}`;
  return (/(怕高|高空)/.test(vetoes) && /(攀岩|抱石|高空|跳伞|蹦极)/.test(text))
    || (/(水上|不会游泳)/.test(vetoes) && /(水上|桨板|皮划艇|游泳)/.test(text))
    || (/(不想运动|拒绝运动)/.test(vetoes) && candidate.energy === "有挑战")
    || (/(户外|怕晒)/.test(vetoes) && !candidate.indoor)
    || (/(人多|拥挤)/.test(vetoes) && /(市集|快闪|音乐节|大型)/.test(text))
    || (/(夜间|太晚)/.test(vetoes) && /(夜场|夜游|酒吧|Livehouse|爵士)/i.test(text));
};

const sourcesFor = (candidate: DiscoveryCandidate, place: { lng: number; lat: number; name: string }): RecommendationSource[] => {
  const sources: RecommendationSource[] = [{ type: "amap", name: "高德地点", url: amapUrl(place), note: "确认具体地点并用于后续路线" }];
  const official = officialUrl(candidate.officialSourceUrl);
  const xiaohongshu = xhsUrl(candidate.xiaohongshuSourceUrl);
  if (official) sources.push({ type: "official", name: candidate.officialSourceName || "官方页面", url: official.toString(), note: "核验营业、日期或活动状态" });
  if (xiaohongshu) sources.push({ type: "xiaohongshu", name: candidate.xiaohongshuSourceName || "小红书公开笔记", url: xiaohongshu.toString(), note: "体验线索，事实仍以官方为准" });
  return sources;
};

const materializeLive = async (items: DiscoveryCandidate[], draft: TripDraft): Promise<Recommendation[]> => {
  const categories = categoriesFor(draft);
  const eligible = items.filter((item) => draft.mode === "surprise" || !categories.length || categories.includes(item.category))
    .filter((item) => !vetoed(item, draft)).filter((item) => item.durationMin <= draft.availableHours && item.budgetMin <= draft.budgetPerPerson * 1.25).slice(0, 8);
  const resolved = await Promise.all(eligible.map(async (item, index) => {
    try {
      const [place] = await searchBeijingPlaces(`${item.venue} ${item.area}`, 1);
      if (!place) return null;
      const sources = sourcesFor(item, place);
      const activity: Activity = {
        id: `live-${index}-${encodeURIComponent(place.name).slice(0, 36)}`, name: item.title.slice(0, 100), category: item.category, venue: place.name,
        area: place.address || item.area, durationHours: [clamp(item.durationMin, 1, 10), clamp(Math.max(item.durationMin, item.durationMax), 1, 12)],
        budgetYuan: [clamp(item.budgetMin, 0, 3000), clamp(Math.max(item.budgetMin, item.budgetMax), 0, 5000)], energy: item.energy, indoor: item.indoor,
        seasons: ["四季"], tags: [item.category, item.title, item.summary], takeaway: item.summary.slice(0, 80),
        caveat: item.dateText ? `日期或营业信息：${item.dateText}` : "出发前再次确认营业与预约状态", verification: sources.some((source) => source.type === "official") ? "需查当周日历" : "需匹配商户",
      };
      const selectedBy = draft.participantIds.filter((id) => draft.answers[id].interests.some((interest) => normalizeActivityCategory(interest) === item.category)).length;
      return { activity, score: Math.min(97, 73 + selectedBy * 8 + (sources.length - 1) * 4), live: true, sources,
        reasons: [selectedBy ? `命中 ${selectedBy} 位参与者选择的活动方向` : "随机探索的新活动方向", `高德已匹配具体地点：${place.name}`, sources.some((source) => source.type === "xiaohongshu") ? "包含小红书公开体验线索" : "包含可打开的实时来源"],
        warnings: [sources.some((source) => source.type === "official") ? "已有官方来源，出发前仍需再次确认" : "暂未找到合格官方页面，营业与预约需要确认"] } satisfies Recommendation;
    } catch { return null; }
  }));
  const unique = new Map<string, Recommendation>();
  resolved.forEach((item) => { if (item) unique.set(`${item.activity.venue}:${item.activity.category}`, item); });
  const ranked = [...unique.values()].sort((left, right) => right.score - left.score);
  const selected: Recommendation[] = [];
  const usedCategories = new Set<ActivityCategory>();
  for (const item of ranked) {
    if (selected.length === 3) break;
    if (!usedCategories.has(item.activity.category) || categories.length <= 1 || selected.length >= 2) { selected.push(item); usedCategories.add(item.activity.category); }
  }
  return selected;
};

const amapFallback = async (draft: TripDraft): Promise<Recommendation[]> => Promise.all(buildRecommendations(draft).map(async (recommendation) => {
  try {
    const keyword = recommendation.activity.name.split(/[\/·]/)[0].trim();
    const [place] = await searchBeijingPlaces(keyword, 1);
    if (!place) return recommendation;
    return { ...recommendation, live: true, activity: { ...recommendation.activity, venue: place.name, area: place.address || recommendation.activity.area },
      reasons: [...recommendation.reasons.slice(0, 2), `高德已匹配具体地点：${place.name}`],
      warnings: ["实时网页来源暂时不可用；当前只完成高德地点匹配，营业和口碑仍需确认"],
      sources: [{ type: "amap", name: "高德地点", url: amapUrl(place), note: "具体地点与路线依据" }] } satisfies Recommendation;
  } catch { return recommendation; }
}));

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { draft?: TripDraft } | null;
  const rawDraft = body?.draft;
  if (!rawDraft || !Array.isArray(rawDraft.participantIds) || !rawDraft.answers || !rawDraft.participantIds.length || rawDraft.participantIds.length > 5) return NextResponse.json({ error: "本次出行信息不完整。" }, { status: 400 });
  const draft = normalizeTripDraft(rawDraft);

  const categories = categoriesFor(draft);
  let recommendations: Recommendation[] = [];
  let sourceStatus: RecommendationSearchResult["sourceStatus"] = "complete";
  let message = "已结合 DeepSeek 联网发现、小红书公开线索、官方页面和高德具体地点生成。";
  try {
    const discovery = await deepSeekStructuredSearch<DiscoveryResult>({
      route: "api/recommendations", schemaName: "beijing_activity_discovery", schema: discoverySchema,
      instructions: "你是北京周末活动调查员。必须先搜索公开网页再输出；小红书只用于发现和体验线索，营业、日期、票务等事实优先用官方来源。不得编造店名、网址、日期或价格。",
      input: `请在公开网页中搜索北京的具体活动、地点或店铺。活动类别关键词：${categories.join("、") || "新奇周末体验"}；日期范围：${draft.date || "最近周末"}。每个候选先找小红书公开页面作为体验线索，再尽量找场馆、主办方或政府官方页面确认。venue 必须是高德可检索的具体中文地点或店名，不能写“某工作室”或“北京多区可匹配”。找不到对应来源就把网址留空，禁止编造。最多返回 8 个。`,
      timeoutMs: 34_000, maxOutputTokens: 3_800,
    });
    if (!isDiscovery(discovery)) throw new DeepSeekRequestError("INVALID_DISCOVERY", 502, "实时发现结果结构不完整。");
    recommendations = await materializeLive(discovery.candidates, draft);
  } catch (error) {
    console.error("[api/recommendations] live discovery degraded", { error: String(error) });
    sourceStatus = "partial";
    message = `${error instanceof DeepSeekRequestError ? error.message : "实时来源暂时不可用"} 已改用严格偏好筛选和高德具体地点，不会用虚构来源补位。`;
  }
  if (recommendations.length < 3) {
    const fallback = await amapFallback(draft);
    const used = new Set(recommendations.map((item) => `${item.activity.venue}:${item.activity.category}`));
    for (const item of fallback) { const key = `${item.activity.venue}:${item.activity.category}`; if (!used.has(key)) recommendations.push(item); if (recommendations.length === 3) break; }
    if (!recommendations.some((item) => item.sources?.some((source) => source.type === "xiaohongshu"))) sourceStatus = "partial";
  }
  if (sourceStatus === "partial" && message.startsWith("已结合")) {
    message = "已生成具体候选，但本轮没有找到同时通过校验的小红书公开页面；系统没有用虚构笔记补位。";
  }
  const result: RecommendationSearchResult = { recommendations: recommendations.slice(0, 3), generatedAt: new Date().toISOString(), sourceStatus, message };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
