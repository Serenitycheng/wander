import { activityKind, contentKey, isChildrensPodcast, parseDiscoveryResponse } from "./discovery.ts";
import { generateSuggestions, timeLimits } from "./generator.ts";
import { explorationIdeas } from "./ideas.ts";
import type { ExplorationFilters, ExplorationIdea, ExplorationSpace, ExplorationSuggestion } from "./types.ts";

export async function requestDiscovery(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ExplorationIdea[]> {
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
  try {
    const response = await fetcher("/api/exploration/discover", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        filters, seed: Math.floor(Math.random() * 2147483647),
        excludeIds: space.shownIdeaIds,
        excludeTitles: space.shownIdeaIds.slice(-60).flatMap((id) => known.get(id)?.title ? [known.get(id)!.title] : []),
      }),
    });
    if (!response.ok) return [];
    return parseDiscoveryResponse(await response.json());
  } catch (error) {
    if (signal.aborted) throw error;
    return [];
  }
}

export function selectDiscoveredSuggestions(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  online: ExplorationIdea[],
  previousIds: string[] = [],
): ExplorationSuggestion[] {
  const shown = new Set([...space.shownIdeaIds, ...previousIds]);
  const seenContent = new Set([...explorationIdeas, ...space.discoveredIdeas].filter((idea) => shown.has(idea.id)).map((idea) => contentKey(idea.title)));
  const eligible = (idea: ExplorationIdea) =>
    (filters.mode === "random" || idea.category === filters.mode) && idea.minutes <= timeLimits[filters.time] && !isChildrensPodcast(idea);
  const onlinePool = [...new Map([...space.discoveredIdeas, ...online].map((idea) => [idea.id, idea])).values()]
    .filter((idea) => eligible(idea) && (shown.has(idea.id) || !seenContent.has(contentKey(idea.title))));
  const localPool = explorationIdeas.filter(eligible);
  const freshOnline = onlinePool.filter((idea) => !shown.has(idea.id));
  const freshLocal = localPool.filter((idea) => !shown.has(idea.id));
  const recentIds = space.records.slice(0, 8).flatMap((item) => item.ideaId ? [item.ideaId] : []);
  const selected: ExplorationSuggestion[] = [];
  const kind = (idea: ExplorationIdea) => idea.category === "outside" ? idea.domain ?? activityKind(idea) : activityKind(idea);
  const pick = (pools: ExplorationIdea[][]) => {
    for (const varied of [true, false]) {
      for (const pool of pools) {
        const ideas = pool.filter((idea) => !selected.some(({ idea: chosen }) =>
          chosen.id === idea.id || contentKey(chosen.title) === contentKey(idea.title) ||
          (varied && (kind(chosen) === kind(idea) || (filters.mode === "random" && chosen.category === idea.category)))));
        const next = generateSuggestions(filters, { ideas, shownIds: space.shownIdeaIds, previousIds, recentIds })[0];
        if (next) { selected.push(next); return true; }
      }
    }
    return false;
  };
  const specific = (ideas: ExplorationIdea[]) => ideas.filter((idea) => idea.approach !== "open");
  // Start with a fresh online discovery, then leave room for the user's own choice.
  pick([specific(freshOnline), freshOnline, specific(freshLocal), specific(onlinePool), specific(localPool)]);
  const complement = selected[0]?.idea.approach === "open" ? "specific" : "open";
  const matching = (ideas: ExplorationIdea[]) => ideas.filter((idea) => (idea.approach ?? "specific") === complement);
  pick([matching(freshOnline), matching(freshLocal), matching(onlinePool), matching(localPool)]);
  while (selected.length < 3 && pick([freshOnline, freshLocal, onlinePool, localPool])) { /* Fill from real, eligible activities. */ }
  return selected;
}
