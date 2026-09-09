import { activities } from "@/lib/activity-data";
import type { Activity, ActivityCategory, Recommendation, TripDraft } from "@/lib/types";

const currentSeason = (): "春" | "夏" | "秋" | "冬" => {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
};

const hash = (value: string) => {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
};

const hasAny = (source: string[], values: string[]) =>
  values.some((value) => source.some((item) => item.includes(value) || value.includes(item)));

const collectCategories = (draft: TripDraft): ActivityCategory[] =>
  draft.participantIds.flatMap((participant) => draft.answers[participant].interests);

const explicitlyVetoed = (activity: Activity, draft: TripDraft) => {
  const vetoes = draft.participantIds.flatMap((participant) => draft.answers[participant].vetoes);
  if (hasAny(vetoes, ["怕高", "高空"]) && hasAny(activity.tags, ["怕高", "攀岩", "高空"])) return true;
  if (hasAny(vetoes, ["水上", "不会游泳"]) && hasAny(activity.tags, ["水上"])) return true;
  if (hasAny(vetoes, ["不想运动", "拒绝运动"]) && activity.energy === "有挑战") return true;
  if (hasAny(vetoes, ["户外", "怕晒"]) && !activity.indoor) return true;
  if (hasAny(vetoes, ["人多", "拥挤"]) && hasAny(activity.tags, ["人群", "市集", "快闪"])) return true;
  if (hasAny(vetoes, ["夜间", "太晚"]) && hasAny(activity.tags, ["夜间"])) return true;
  return false;
};

export function buildRecommendations(draft: TripDraft): Recommendation[] {
  const interests = collectCategories(draft);
  const season = currentSeason();
  const freeText = draft.participantIds.map((participant) => draft.answers[participant].freeText).join(" ");

  const ranked = activities
    .filter((item) => !explicitlyVetoed(item, draft))
    .filter((item) => item.durationHours[0] <= draft.availableHours)
    .map((item) => {
      let score = 48;
      const reasons: string[] = [];
      const warnings: string[] = [];

      if (interests.includes(item.category)) {
        score += 20;
        reasons.push("命中参与者选择的活动方向");
      } else if (draft.mode === "surprise") {
        score += 12;
        reasons.push("跨出常选类别，但仍保留预算和禁忌");
      }

      if (item.budgetYuan[0] <= draft.budgetPerPerson) {
        score += 10;
        reasons.push(`起步预算不超过 ¥${draft.budgetPerPerson}/人`);
      } else {
        score -= 14;
        warnings.push("最低参考预算高于本次设置");
      }

      if (item.energy === draft.energy) {
        score += 8;
        reasons.push(`体力强度与“${draft.energy}”相符`);
      }

      if (item.seasons.includes("四季") || item.seasons.includes(season)) {
        score += 6;
        reasons.push("季节条件基础适配");
      } else {
        score -= 12;
        warnings.push("不是当前季节的优先项目");
      }

      if (freeText && hasAny([item.name, item.takeaway, ...item.tags], freeText.split(/[，。；、\s]+/).filter(Boolean))) {
        score += 8;
        reasons.push("与你补充的文字需求有交集");
      }

      score += hash(`${draft.id}:${draft.roll}:${item.id}`) % 9;
      if (item.verification !== "基础资料") warnings.push(item.caveat);

      return { activity: item, score: Math.min(97, score), reasons: reasons.slice(0, 3), warnings };
    })
    .sort((a, b) => b.score - a.score);

  if (draft.mode === "plan" && interests.length > 0) return ranked.slice(0, 3);

  const selected: Recommendation[] = [];
  const usedCategories = new Set<ActivityCategory>();
  for (const candidate of ranked) {
    if (selected.length === 3) break;
    if (!usedCategories.has(candidate.activity.category) || selected.length >= 2) {
      selected.push(candidate);
      usedCategories.add(candidate.activity.category);
    }
  }
  return selected;
}
