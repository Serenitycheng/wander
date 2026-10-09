import { activityKind, contentKey, isChildrensPodcast, isFeedIdea, isLowQualityVideo, rememberShown } from "./discovery.ts";
import { generateSuggestions, timeLimits } from "./generator.ts";
import { explorationIdeas } from "./ideas.ts";
import { parseDiscoveryResult } from "./discovery-status.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import type { ExplorationFilters, ExplorationIdea, ExplorationSpace, ExplorationSuggestion } from "./types.ts";
import { profileFor } from "./profile.ts";
import { feedbackForDiscovery, interestScore, isPlayable, isRejectedIdea, recommendationScore } from "./recommendation-ranking.ts";

export async function requestDiscovery(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  onResult?: (result: DiscoveryResult) => void,
): Promise<DiscoveryResult> {
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
  const profile = profileFor(space);
  const feedback = feedbackForDiscovery(space);
  const avoidFeed = !profile.allowFeeds || space.shownIdeaIds.slice(-6).some((id) => {
    const idea = known.get(id);
    return idea && isFeedIdea(idea);
  });
  try {
    const response = await fetcher("/api/exploration/discover", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, signal,
      body: JSON.stringify({
        filters, seed: Math.floor(Math.random() * 2147483647),
        excludeIds: [...new Set([...space.shownIdeaIds, ...(space.feedback ?? []).filter((item) => item.vote === "less").map((item) => item.ideaId)])].slice(-600),
        excludeTitles: [...space.shownIdeaIds.slice(-60).flatMap((id) => known.get(id)?.title ? [known.get(id)!.title] : []), ...feedback.lessTitles].slice(-60),
        avoidFormats: avoidFeed ? ["feed"] : [],
        allowFeeds: profile.allowFeeds,
        ...(profile.personalized ? { personalization: {
          interests: profile.interests, readingList: profile.readingList,
          preferenceNotes: profile.preferenceNotes ?? "",
          feedback,
          favoriteTitles: space.favorites.slice(0, 12).flatMap((item) => known.get(item.ideaId)?.title ? [known.get(item.ideaId)!.title] : []),
        } } : {}),
      }),
    });
    if (!response.ok) return {
      ideas: [], provider: "none",
      issue: response.status === 401 ? "login_required" : response.status === 403 ? "forbidden"
        : response.status === 429 ? "rate_limited" : "network_error",
    };
    if (response.headers.get("Content-Type")?.includes("application/x-ndjson") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "", result: DiscoveryResult = { ideas: [], provider: "none" };
      const accept = (line: string) => {
        if (!line.trim()) return;
        const next = parseDiscoveryResult(JSON.parse(line));
        result = mergeDiscoveryResults(result, next);
        onResult?.(result);
      };
      try {
        while (true) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          pending += decoder.decode(chunk.value, { stream: !chunk.done });
          if (pending.length > 150000) throw new SyntaxError("Discovery response too large");
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) accept(line);
          if (chunk.done) { accept(pending); break; }
        }
      } finally { reader.releaseLock(); }
      return result;
    }
    const result = parseDiscoveryResult(await response.json());
    onResult?.(result);
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    return { ideas: [], provider: "none", issue: error instanceof SyntaxError ? "invalid_response" : "network_error" };
  }
}

export function mergeDiscoveryResults(previous: DiscoveryResult, next: DiscoveryResult): DiscoveryResult {
  const ideas = [...new Map([...previous.ideas, ...next.ideas].map((idea) => [idea.id, idea])).values()].slice(-48);
  const provider = !previous.ideas.length ? next.provider : !next.ideas.length ? previous.provider
    : previous.provider === next.provider ? next.provider : "unknown";
  return { ideas, provider, ...(next.issue ? { issue: next.issue } : {}) };
}

export function selectDiscoveredSuggestions(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  online: ExplorationIdea[],
  previousIds: string[] = [],
): ExplorationSuggestion[] {
  const shown = new Set([...space.shownIdeaIds, ...previousIds]);
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas, ...online].map((idea) => [idea.id, idea]));
  const avoidFeed = !profileFor(space).allowFeeds || rememberShown(space.shownIdeaIds, previousIds).slice(-6).some((id) => {
    const idea = known.get(id);
    return idea && isFeedIdea(idea);
  });
  const seenContent = new Set([...explorationIdeas, ...space.discoveredIdeas].filter((idea) => shown.has(idea.id)).map((idea) => contentKey(idea.title)));
  const eligible = (idea: ExplorationIdea) =>
    (filters.mode === "random" || idea.category === filters.mode) && idea.minutes <= timeLimits[filters.time] &&
    !isChildrensPodcast(idea) && !isLowQualityVideo(idea) && !(avoidFeed && isFeedIdea(idea)) && !isRejectedIdea(idea, space);
  const onlinePool = [...new Map([...space.discoveredIdeas, ...online].map((idea) => [idea.id, idea])).values()]
    .filter((idea) => eligible(idea) && (shown.has(idea.id) || !seenContent.has(contentKey(idea.title))));
  const localPool = explorationIdeas.filter(eligible);
  const freshOnline = onlinePool.filter((idea) => !shown.has(idea.id));
  const freshLocal = localPool.filter((idea) => !shown.has(idea.id));
  const recentIds = space.records.slice(0, 8).flatMap((item) => item.ideaId ? [item.ideaId] : []);
  const selected: ExplorationSuggestion[] = [];
  const kind = (idea: ExplorationIdea) => idea.category === "outside" ? idea.domain ?? activityKind(idea) : activityKind(idea);
  const pick = (pools: ExplorationIdea[][]) => {
    // Novelty outranks format diversity: an old item in a different format
    // must not beat an unseen item just because another book was selected.
    for (const seen of [false, true]) {
      for (const varied of [true, false]) {
        for (const pool of pools) {
          const ideas = pool.filter((idea) => !(isFeedIdea(idea) && selected.some(({ idea: chosen }) => isFeedIdea(chosen))) && !selected.some(({ idea: chosen }) =>
            chosen.id === idea.id || contentKey(chosen.title) === contentKey(idea.title) ||
            (varied && (kind(chosen) === kind(idea) || (filters.mode === "random" && chosen.category === idea.category)))))
            .filter((idea) => shown.has(idea.id) === seen);
          const next = generateSuggestions(filters, { ideas, shownIds: space.shownIdeaIds, previousIds, recentIds, score: (idea) => recommendationScore(idea, space) })[0];
          if (next) { selected.push(next); return true; }
        }
      }
    }
    return false;
  };
  const specific = (ideas: ExplorationIdea[]) => ideas.filter((idea) => idea.approach !== "open");
  // Start with a fresh online discovery, then leave room for the user's own choice.
  const familiar = (ideas: ExplorationIdea[]) => ideas.filter((idea) => idea.angle === "familiar" || (!idea.angle && interestScore(idea, space) > 0));
  pick([familiar(specific(freshOnline)), specific(freshOnline), freshOnline, familiar(specific(freshLocal)), specific(freshLocal), specific(onlinePool), specific(localPool)]);
  const complement = selected[0]?.idea.approach === "open" ? "specific" : "open";
  const matching = (ideas: ExplorationIdea[]) => ideas.filter((idea) => (idea.approach ?? "specific") === complement);
  const surprise = (ideas: ExplorationIdea[]) => ideas.filter((idea) => idea.angle === "surprise" || (!idea.angle && interestScore(idea, space) === 0));
  pick([surprise(matching(freshOnline)), matching(freshOnline), surprise(matching(freshLocal)), matching(freshLocal), matching(onlinePool), matching(localPool)]);
  if (selected.length < 3) pick([freshOnline.filter(isPlayable), freshLocal.filter(isPlayable), freshOnline, freshLocal, onlinePool, localPool]);
  while (selected.length < 3 && pick([freshOnline, freshLocal, onlinePool, localPool])) { /* Fill from real, eligible activities. */ }
  return selected;
}
