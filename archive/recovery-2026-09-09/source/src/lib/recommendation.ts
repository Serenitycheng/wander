import { activities } from "@/lib/activity-data";
import { normalizeActivityCategory } from "@/lib/types";
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
  draft.participantIds.flatMap((participant) => draft.answers[participant].interests)
    .map(normalizeActivityCategory)
    .filter((category): category is ActivityCategory => Boolean(category));

const categoryVotes = (draft: TripDraft) => {
  const votes = new Map<ActivityCategory, number>();
  draft.participantIds.forEach((participant) => {
    new Set(draft.answers[participant].interests.map(normalizeActivityCategory).filter((category): category is ActivityCategory => Boolean(category))).forEach((category) => {
      votes.set(category, (votes.get(category) ?? 0) + 1);
    });
  });
  return votes;
};

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
  const uniqueInterests = [...new Set(interests)];
  const votes = categoryVotes(draft);
  const season = currentSeason();
  const freeText = draft.participantIds
    .flatMap((participant) => [draft.answers[participant].freeText, ...(draft.answers[participant].aiConstraints ?? [])])
    .join(" ");

  const eligibleActivities = activities
    .filter((item) => !explicitlyVetoed(item, draft))
    .filter((item) => item.durationHours[0] <= draft.availableHours);
  const categoryMatched = draft.mode === "plan" && uniqueInterests.length
    ? eligibleActivities.filter((item) => votes.has(item.category))
    : eligibleActivities;

  const ranked = categoryMatched
    .map((item) => {
      let score = 48;
      const reasons: string[] = [];
      const warnings: string[] = [];

      const voteCount = votes.get(item.category) ?? 0;
      if (voteCount) {
        score += 18 + voteCount * 9;
        reasons.push(voteCount === draft.participantIds.length
          ? "所有参与者都选择了这个活动方向"
          : `命中 ${voteCount} 位参与者选择的活动方向`);
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

  const selected: Recommendation[] = [];
  const usedCategories = new Set<ActivityCategory>();

  if (draft.mode === "plan" && uniqueInterests.length > 1) {
    const orderedCategories = [...uniqueInterests].sort((left, right) => {
      const voteDifference = (votes.get(right) ?? 0) - (votes.get(left) ?? 0);
      return voteDifference || (hash(`${draft.id}:${draft.roll}:${left}`) % 101) - (hash(`${draft.id}:${draft.roll}:${right}`) % 101);
    });
    for (const category of orderedCategories) {
      const candidate = ranked.find((item) => item.activity.category === category && !selected.some((chosen) => chosen.activity.id === item.activity.id));
      if (candidate) {
        selected.push(candidate);
        usedCategories.add(category);
      }
      if (selected.length === 3) return selected;
    }
  }

  for (const candidate of ranked) {
    if (selected.length === 3) break;
    if (selected.some((chosen) => chosen.activity.id === candidate.activity.id)) continue;
    if (draft.mode === "plan" || !usedCategories.has(candidate.activity.category) || selected.length >= 2) {
      selected.push(candidate);
      usedCategories.add(candidate.activity.category);
    }
  }
  return selected;
}
