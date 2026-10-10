import { activityKind, contentKey, isChildrensPodcast, isFeedIdea, isLowQualityVideo, rememberShown } from "./discovery.ts";
import { generateSuggestions, timeLimits } from "./generator.ts";
import { explorationIdeas } from "./ideas.ts";
import { parseDiscoveryResult } from "./discovery-status.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import type { ExplorationFilters, ExplorationIdea, ExplorationSpace, ExplorationSuggestion } from "./types.ts";
import { profileFor } from "./profile.ts";
import { feedbackForDiscovery, isPlayable, isRejectedIdea, recentActivitiesForDiscovery, recommendationScore } from "./recommendation-ranking.ts";
import { activityDomain, hasUsableEntry, isHandsOn } from "./activity-diversity.ts";
import { resourceId, resourceKey, sameExperience } from "./activity-affinity.ts";
import { repeatsWork, workHistory } from "./work-history.ts";
import { freshOnly, knownSpaceIdeas } from "./recommendation-policy.ts";
import { matchesOutingArea, outingAreaFor } from "./outing-policy.ts";
import { matchesExplorationSetting } from "./exploration-filters.ts";

export async function requestDiscovery(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  onResult?: (result: DiscoveryResult) => void,
  reserved: ExplorationIdea[] = [],
): Promise<DiscoveryResult> {
  const known = knownSpaceIdeas(space);
  const profile = profileFor(space);
  const feedback = feedbackForDiscovery(space);
  const favorites = space.favorites.flatMap((item) => known.get(item.ideaId) ?? []);
  const excluded = [...favorites, ...reserved];
  const avoidFeed = !profile.allowFeeds || space.shownIdeaIds.slice(-6).some((id) => {
    const idea = known.get(id);
    return idea && isFeedIdea(idea);
  });
  let result: DiscoveryResult = { ideas: [], provider: "none" };
  try {
    const response = await fetcher("/api/exploration/discover", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, signal,
      body: JSON.stringify({
        filters, seed: Math.floor(Math.random() * 2147483647),
        ...(outingAreaFor(space.owner) ? { outingArea: outingAreaFor(space.owner) } : {}),
        excludeIds: [...new Set([...space.shownIdeaIds, ...space.shownIdeaIds.flatMap((id) => {
          const idea = known.get(id); const canonical = idea && resourceId(idea); return canonical ? [canonical] : [];
        }), ...(space.feedback ?? []).filter((item) => item.vote === "less").flatMap((item) => {
          const idea = known.get(item.ideaId); const canonical = idea && resourceId(idea); return [item.ideaId, ...(canonical ? [canonical] : [])];
        }), ...space.favorites.map((item) => item.ideaId), ...excluded.flatMap((idea) => [idea.id, ...(resourceId(idea) ? [resourceId(idea)!] : [])])])].slice(-600),
        excludeTitles: [...space.shownIdeaIds.slice(-60).flatMap((id) => known.get(id)?.title ? [known.get(id)!.title] : []), ...feedback.lessTitles, ...excluded.map((idea) => idea.title)].slice(-60),
        excludeWorks: workHistory(space, excluded).slice(-120),
        excludeExperiences: [...(space.feedback ?? []).filter((item) => item.vote === "less")
          .slice(0, 12).flatMap((item) => {
            const idea = known.get(item.ideaId); return idea ? [{ ...idea, reason: "dislike" as const }] : [];
          }), ...(freshOnly(space) ? (space.suppressedIdeas ?? []).filter((item) => item.reason === "cleanup").slice(-12) : [])]
          .map(({ id, category, title, description, approach, form, domain, source, reason }) =>
            ({ id, category, title, description: description.slice(0, 220), approach, form, domain, source, reason })),
        avoidFormats: avoidFeed ? ["feed"] : [],
        allowFeeds: profile.allowFeeds,
        recentActivities: recentActivitiesForDiscovery(space),
        ...(profile.personalized ? { personalization: {
          interests: profile.interests, readingList: profile.readingList,
          preferenceNotes: profile.preferenceNotes ?? "",
          mutedTopics: profile.mutedTopics ?? "",
          feedback,
          favoriteTitles: space.favorites.slice(0, 12).flatMap((item) => known.get(item.ideaId)?.title ? [known.get(item.ideaId)!.title] : []),
        } } : {}),
      }),
    });
    if (!response.ok) return {
      ideas: [], provider: "none",
      issue: response.status === 401 ? "login_required" : response.status === 403 ? "forbidden"
        : response.status === 429 ? "rate_limited" : response.status === 408 || response.status >= 500 ? "service_unavailable" : "invalid_request",
      httpStatus: response.status,
    };
    if (response.headers.get("Content-Type")?.includes("application/x-ndjson") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
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
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      return result;
    }
    result = parseDiscoveryResult(await response.json());
    onResult?.(result);
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    // A broken final chunk must not discard already validated model choices.
    return { ...result, issue: error instanceof SyntaxError ? "invalid_response" : "network_error" };
  }
}

export function mergeDiscoveryResults(previous: DiscoveryResult, next: DiscoveryResult): DiscoveryResult {
  const curated = next.provider === "deepseek" && next.ideas.length > 0;
  const retained = curated ? previous.ideas.filter((idea) => idea.origin === "deepseek") : previous.ideas;
  const ideas = [...new Map([...retained, ...next.ideas].map((idea) => [idea.id, idea])).values()].slice(-48);
  const provider = curated ? "deepseek" : !previous.ideas.length ? next.provider : !next.ideas.length ? previous.provider
    : previous.provider === next.provider ? next.provider : "unknown";
  return { ideas, provider, ...(next.issue ? { issue: next.issue } : {}), ...(next.httpStatus ? { httpStatus: next.httpStatus } : {}) };
}

export function selectDiscoveredSuggestions(
  filters: ExplorationFilters,
  space: ExplorationSpace,
  online: ExplorationIdea[],
  previousIds: string[] = [],
  options: { random?: () => number } = {},
): ExplorationSuggestion[] {
  const shown = new Set([...space.shownIdeaIds, ...previousIds]);
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas, ...online].map((idea) => [idea.id, idea]));
  const avoidFeed = !profileFor(space).allowFeeds || rememberShown(space.shownIdeaIds, previousIds).slice(-6).some((id) => {
    const idea = known.get(id);
    return idea && isFeedIdea(idea);
  });
  const seenContent = new Set([...explorationIdeas, ...space.discoveredIdeas].filter((idea) => shown.has(idea.id)).map((idea) => contentKey(idea.title)));
  const seenResources = new Set([...known.values()].filter((idea) => shown.has(idea.id)).flatMap((idea) => resourceKey(idea.source?.url) ?? []));
  const seenWorks = workHistory(space, previousIds.flatMap((id) => known.get(id) ?? []));
  const eligible = (idea: ExplorationIdea) =>
    matchesOutingArea(idea, filters, outingAreaFor(space.owner)) &&
    matchesExplorationSetting(idea, filters) && idea.minutes <= timeLimits[filters.time] &&
    !isChildrensPodcast(idea) && !isLowQualityVideo(idea) && hasUsableEntry(idea) && !(avoidFeed && isFeedIdea(idea)) && !isRejectedIdea(idea, space);
  const onlinePool = [...new Map([...space.discoveredIdeas, ...online].map((idea) => [idea.id, idea])).values()]
    .filter((idea) => eligible(idea) && (shown.has(idea.id) || (!repeatsWork(idea, seenWorks) && !seenContent.has(contentKey(idea.title)) && !seenResources.has(resourceKey(idea.source?.url) ?? ""))));
  const localPool = explorationIdeas.filter((idea) => eligible(idea) &&
    (shown.has(idea.id) || (!repeatsWork(idea, seenWorks) && (!resourceKey(idea.source?.url) || !seenResources.has(resourceKey(idea.source?.url) ?? "")))));
  const freshOnline = onlinePool.filter((idea) => !shown.has(idea.id));
  const freshLocal = localPool.filter((idea) => !shown.has(idea.id));
  const recentIds = space.records.slice(0, 8).flatMap((item) => item.ideaId ? [item.ideaId] : []);
  const selected: ExplorationSuggestion[] = [];
  const recentExperiences = rememberShown(space.shownIdeaIds, previousIds).slice(-60).flatMap((id) => known.get(id) ?? []);
  const cooling = (idea: ExplorationIdea) => recentExperiences.some((previous) => sameExperience(idea, previous));
  const kind = (idea: ExplorationIdea) => idea.category === "outside" ? activityDomain(idea) : activityKind(idea);
  const currentOnlineIds = new Set(online.map((idea) => idea.id));
  const pick = (pools: ExplorationIdea[][], allowSeen = false) => {
    // Novelty outranks format diversity: an old item in a different format
    // must not beat an unseen item just because another book was selected.
    for (const seen of allowSeen ? [false, true] : [false]) {
      for (const varied of [true, false]) {
        for (const pool of pools) {
          const ideas = pool.filter((idea) => !(isFeedIdea(idea) && selected.some(({ idea: chosen }) => isFeedIdea(chosen))) && !selected.some(({ idea: chosen }) =>
            sameExperience(chosen, idea) ||
            (varied && (kind(chosen) === kind(idea) || (activityDomain(idea) !== "综合" && activityDomain(chosen) === activityDomain(idea))))))
            .filter((idea) => shown.has(idea.id) === seen);
          const next = generateSuggestions(filters, { ideas, shownIds: space.shownIdeaIds, previousIds, recentIds, random: options.random,
            score: (idea) => recommendationScore(idea, space) + (currentOnlineIds.has(idea.id) ? idea.origin === "deepseek" ? 6 : 2 : idea.discoveredAt ? 0.5 : 0) })[0];
          if (next) { selected.push(next); return true; }
        }
      }
    }
    return false;
  };
  // Rank all sources together. Being online must not force the same book,
  // recipe and documentary formats to win over a different useful activity.
  const fresh = [...freshOnline, ...freshLocal].filter((idea) => !cooling(idea));
  const resting = [...freshOnline, ...freshLocal].filter(cooling);
  const all = [...onlinePool, ...localPool];
  pick([fresh]);
  const complement = selected[0]?.idea.approach === "open" ? "specific" : "open";
  const matching = (ideas: ExplorationIdea[]) => ideas.filter((idea) => (idea.approach ?? "specific") === complement);
  pick([matching(fresh), fresh]);
  if (selected.length < 3) {
    const needsParticipation = !selected.some(({ idea }) => isHandsOn(idea));
    const foundParticipation = needsParticipation && pick([fresh.filter(isHandsOn)]);
    if (!foundParticipation) pick([fresh.filter(isPlayable), fresh]);
  }
  while (selected.length < 3 && pick([fresh])) { /* Exhaust new experiences before relaxing cooldowns. */ }
  // After cleanup, lack of new content must not resurrect deleted or seen ideas.
  if (freshOnly(space)) return selected;
  while (selected.length < 3 && pick([resting])) { /* Keep three real choices when the filter is sparse. */ }
  if (selected.length < 3) pick([matching(all), all], true);
  if (selected.length < 3 && !selected.some(({ idea }) => isHandsOn(idea))) pick([all.filter(isHandsOn), all], true);
  while (selected.length < 3 && pick([all], true)) { /* Seen content is the final fallback, never a format quota. */ }
  return selected;
}

export function fillMissingSuggestions(filters: ExplorationFilters, space: ExplorationSpace,
  visible: ExplorationSuggestion[], candidates: ExplorationIdea[]): ExplorationSuggestion[] {
  const next = visible.filter(({ idea }) => !isRejectedIdea(idea, space) && matchesOutingArea(idea, filters, outingAreaFor(space.owner))).slice(0, 3);
  if (next.length === 3) return next;
  const pool = candidates.filter((idea) => !next.some(({ idea: current }) => sameExperience(current, idea)));
  for (const item of selectDiscoveredSuggestions(filters, space, pool, next.map(({ idea }) => idea.id))) {
    if (!next.some(({ idea }) => sameExperience(idea, item.idea))) next.push(item);
    if (next.length === 3) break;
  }
  return next;
}
