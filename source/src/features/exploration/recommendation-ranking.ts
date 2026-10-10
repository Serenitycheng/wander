import { activityKind, isUncuratedPublicIdea } from "./discovery.ts";
import { explorationIdeas } from "./ideas.ts";
import { profileFor } from "./profile.ts";
import type { DiscoveryPersonalization } from "./profile.ts";
import type { ExplorationIdea, ExplorationSpace } from "./types.ts";
import { activityDomain, isHandsOn, isMutedContent } from "./activity-diversity.ts";
import { activityTopics, contentAffinity, isPressuringPitch, sameContent, sameExperience } from "./activity-affinity.ts";
import { isRemovedRecommendation, knownSpaceIdeas } from "./recommendation-policy.ts";

export function votedIdeas(space: ExplorationSpace, vote: "more" | "less") {
  const known = knownSpaceIdeas(space);
  return (space.feedback ?? []).filter((item) => item.vote === vote)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap((item) => known.get(item.ideaId) ?? []);
}

export function recentActivitiesForDiscovery(space: ExplorationSpace) {
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
  return space.shownIdeaIds.slice(-12).flatMap((id) => {
    const idea = known.get(id);
    return idea ? [{ form: activityKind(idea), domain: activityDomain(idea), title: idea.title, approach: idea.approach ?? "specific" }] : [];
  });
}

const interests = ["文学", "人物", "故事", "哲学", "地域", "民族", "音乐", "唱歌", "电影", "艺术", "历史", "自然", "科学", "游戏", "摄影", "手工", "运动", "建筑", "设计", "心理", "旅行", "烹饪"];

export function feedbackForDiscovery(space: ExplorationSpace): NonNullable<DiscoveryPersonalization["feedback"]> {
  const more = votedIdeas(space, "more").slice(0, 12), less = votedIdeas(space, "less").slice(0, 12);
  const kinds = (ideas: ExplorationIdea[]) => [...new Set(ideas.map((idea) => `${activityKind(idea)} · ${activityDomain(idea)}`))].slice(0, 12);
  const examples = (ideas: ExplorationIdea[]) => ideas.map((idea) => ({ title: idea.title,
    description: idea.description.slice(0, 220), form: activityKind(idea), domain: activityDomain(idea), topics: activityTopics(idea) }));
  return { moreTitles: more.map((idea) => idea.title), lessTitles: less.map((idea) => idea.title), moreKinds: kinds(more), lessKinds: kinds(less),
    moreExamples: examples(more), lessExamples: examples(less) };
}

export function interestScore(idea: ExplorationIdea, space: ExplorationSpace): number {
  const profile = profileFor(space);
  if (!profile.personalized) return 0;
  const feedback = feedbackForDiscovery(space);
  const text = `${idea.title} ${idea.description} ${idea.domain ?? ""}`;
  const preferences = `${profile.interests} ${profile.readingList} ${feedback.moreTitles.join(" ")}`;
  const matches = interests.filter((word) => preferences.includes(word) && text.includes(word)).length;
  const more = Math.max(0, ...votedIdeas(space, "more").map((previous) => contentAffinity(idea, previous)));
  return Math.min(3, matches) + more;
}

export function recommendationScore(idea: ExplorationIdea, space: ExplorationSpace): number {
  const recent = new Map([...explorationIdeas, ...space.discoveredIdeas].map((item) => [item.id, item]));
  const sameKind = space.shownIdeaIds.slice(-6).filter((id) => {
    const previous = recent.get(id);
    return previous && idea.category !== "outside" && activityKind(previous) === activityKind(idea);
  }).length;
  const sameDomain = space.shownIdeaIds.slice(-12).filter((id) => {
    const previous = recent.get(id);
    return previous && activityDomain(idea) !== "综合" && activityDomain(previous) === activityDomain(idea);
  }).length;
  // Feedback lowers related content rather than closing an entire field forever.
  const less = profileFor(space).personalized ? Math.max(0, ...votedIdeas(space, "less").map((previous) => contentAffinity(idea, previous))) : 0;
  const similar = space.shownIdeaIds.slice(-12).filter((id) => {
    const previous = recent.get(id); return previous && sameExperience(previous, idea);
  }).length;
  const clickbait = /震惊|不看后悔|速来领取|福利领取|抽奖|带货|全网都在|逆天|爆笑反应/.test(idea.title) ? 3 : 0;
  const recipe = /themealdb\.com/.test(idea.source?.url ?? "") ? 1 : 0;
  return interestScore(idea, space) + (idea.angle ? 1 : 0) - less - Math.min(6, sameKind * 3) - Math.min(8, sameDomain * 3) - similar * 8 - clickbait - recipe;
}

export function isRejectedIdea(idea: ExplorationIdea, space: ExplorationSpace): boolean {
  const known = knownSpaceIdeas(space);
  if (space.favorites.some((favorite) => {
    const saved = known.get(favorite.ideaId);
    return favorite.ideaId === idea.id || (saved && sameContent(saved, idea));
  })) return true;
  if (isUncuratedPublicIdea(idea)) return true;
  if (isPressuringPitch(idea)) return true;
  if (isMutedContent(idea, profileFor(space).mutedTopics)) return true;
  const rejected = (space.feedback ?? []).filter((item) => item.vote === "less");
  if (rejected.some((item) => item.ideaId === idea.id)) return true;
  return isRemovedRecommendation(idea, space) || rejected.some((item) => {
    const previous = known.get(item.ideaId);
    return previous && (sameContent(previous, idea) || sameExperience(previous, idea));
  });
}

export const isPlayable = (idea: ExplorationIdea) => isHandsOn(idea) ||
  activityKind(idea) === "烹饪" ||
  /攀岩|骑行|滑冰|球|运动|手工|散步/.test(idea.title);
