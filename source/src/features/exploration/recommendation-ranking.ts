import { activityKind, contentKey } from "./discovery.ts";
import { explorationIdeas } from "./ideas.ts";
import { profileFor } from "./profile.ts";
import type { DiscoveryPersonalization } from "./profile.ts";
import type { ExplorationIdea, ExplorationSpace } from "./types.ts";

const interests = ["文学", "人物", "故事", "哲学", "地域", "民族", "音乐", "唱歌", "电影", "艺术", "历史", "自然", "科学", "游戏", "摄影", "手工", "运动", "建筑", "设计", "心理", "旅行", "烹饪"];

export function feedbackForDiscovery(space: ExplorationSpace): NonNullable<DiscoveryPersonalization["feedback"]> {
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
  const voted = (vote: "more" | "less") => (space.feedback ?? []).filter((item) => item.vote === vote)
    .slice(0, 12).flatMap((item) => known.get(item.ideaId) ?? []);
  const more = voted("more"), less = voted("less");
  const kinds = (ideas: ExplorationIdea[]) => [...new Set(ideas.flatMap((idea) => [activityKind(idea), ...(idea.domain ? [idea.domain] : [])]))].slice(0, 12);
  return { moreTitles: more.map((idea) => idea.title), lessTitles: less.map((idea) => idea.title), moreKinds: kinds(more), lessKinds: kinds(less) };
}

export function interestScore(idea: ExplorationIdea, space: ExplorationSpace): number {
  const profile = profileFor(space);
  if (!profile.personalized) return 0;
  const feedback = feedbackForDiscovery(space);
  const text = `${idea.title} ${idea.description} ${idea.domain ?? ""}`;
  const preferences = `${profile.interests} ${profile.readingList} ${feedback.moreTitles.join(" ")}`;
  const matches = interests.filter((word) => preferences.includes(word) && text.includes(word)).length;
  return Math.min(2, matches) + (feedback.moreKinds.some((kind) => kind === activityKind(idea) || kind === idea.domain) ? 3 : 0);
}

export function recommendationScore(idea: ExplorationIdea, space: ExplorationSpace): number {
  const recent = new Map([...explorationIdeas, ...space.discoveredIdeas].map((item) => [item.id, item]));
  const sameKind = space.shownIdeaIds.slice(-6).filter((id) => {
    const previous = recent.get(id);
    return previous && activityKind(previous) === activityKind(idea);
  }).length;
  const lessKinds = feedbackForDiscovery(space).lessKinds;
  // Feedback lowers related content rather than closing an entire field forever.
  const less = lessKinds.some((kind) => kind === activityKind(idea) || kind === idea.domain) ? 3 : 0;
  const clickbait = /震惊|不看后悔|速来领取|福利领取|抽奖|带货|全网都在|逆天|爆笑反应/.test(idea.title) ? 3 : 0;
  const recipe = /themealdb\.com/.test(idea.source?.url ?? "") ? 1 : 0;
  return interestScore(idea, space) + (idea.angle ? 2 : 0) - less - Math.min(2, sameKind) - clickbait - recipe;
}

export function isRejectedIdea(idea: ExplorationIdea, space: ExplorationSpace): boolean {
  const rejected = (space.feedback ?? []).filter((item) => item.vote === "less");
  if (rejected.some((item) => item.ideaId === idea.id)) return true;
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((item) => [item.id, item]));
  return rejected.some((item) => {
    const previous = known.get(item.ideaId);
    return previous && contentKey(previous.title) === contentKey(idea.title);
  });
}

export const isPlayable = (idea: ExplorationIdea) => idea.angle === "play" ||
  ["歌唱", "游戏", "书写", "烹饪"].includes(activityKind(idea)) || idea.category === "create" ||
  /攀岩|骑行|滑冰|球|运动|手工|散步/.test(idea.title);
