import { mergeDiscoveryResults, requestDiscovery } from "./discovery-client.ts";
import { profileFor } from "./profile.ts";
import { isRejectedIdea } from "./recommendation-ranking.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import { canRetryDiscovery } from "./discovery-status.ts";
import type { ExplorationFilters, ExplorationSpace } from "./types.ts";
import { timeLimits } from "./generator.ts";
import { contentKey, isFeedIdea, isLowQualityVideo } from "./discovery.ts";
import { explorationIdeas } from "./ideas.ts";
import { hasUsableEntry } from "./activity-diversity.ts";
import { resourceKey, sameExperience } from "./activity-affinity.ts";
import { repeatsWork, workHistory } from "./work-history.ts";
import { matchesOutingArea, outingAreaFor } from "./outing-policy.ts";
import { matchesExplorationSetting } from "./exploration-filters.ts";

export const discoveryScope = (filters: ExplorationFilters, space: ExplorationSpace) =>
  JSON.stringify([space.owner, filters.mode, filters.setting, filters.intent, filters.time, filters.mood, profileFor(space),
    space.favorites.map((item) => item.ideaId), space.feedback ?? [], space.recommendationCleanup ?? null]);

// One background batch serves several clicks. Showing a round never waits for
// this buffer, and only the owning account/filter/profile may consume it.
export class DiscoveryBuffer {
  private scope = "";
  private result: DiscoveryResult = { ideas: [], provider: "none" };
  private controller: AbortController | null = null;
  private startedAt = -Infinity;
  private sequence = 0;
  private refillAttempts = 0;
  private recoveryAttempts = 0;
  private readonly load: typeof requestDiscovery;
  private readonly now: () => number;

  constructor(load: typeof requestDiscovery = requestDiscovery, now: () => number = Date.now) {
    this.load = load;
    this.now = now;
  }

  peek(filters: ExplorationFilters, space: ExplorationSpace): DiscoveryResult {
    return this.scope === discoveryScope(filters, space) ? this.result : { ideas: [], provider: "none" };
  }

  get preparing() { return this.controller !== null; }

  canRefill(filters: ExplorationFilters, space: ExplorationSpace): boolean {
    const ready = this.available(filters, space);
    return this.scope === discoveryScope(filters, space) && this.refillAttempts < 2 && ready < 6 &&
      (!this.result.issue || ["no_new_results", "no_search_results"].includes(this.result.issue) ||
        (ready < 3 && this.recoveryAttempts < 1 && canRetryDiscovery(this.result)));
  }

  private usableChoices(filters: ExplorationFilters, space: ExplorationSpace): ExplorationSpace["discoveredIdeas"] {
    const seen = new Set(space.shownIdeaIds);
    const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
    const seenTitles = new Set(space.shownIdeaIds.flatMap((id) => known.get(id) ? [contentKey(known.get(id)!.title)] : []));
    const seenResources = new Set(space.shownIdeaIds.flatMap((id) => resourceKey(known.get(id)?.source?.url) ?? []));
    const recent = space.shownIdeaIds.slice(-60).flatMap((id) => known.get(id) ?? []);
    const seenWorks = workHistory(space);
    const avoidFeeds = !profileFor(space).allowFeeds || space.shownIdeaIds.slice(-6).some((id) => {
      const idea = known.get(id); return idea && isFeedIdea(idea);
    });
    const unique: ExplorationSpace["discoveredIdeas"] = [];
    const candidates = [...new Map([...space.discoveredIdeas, ...this.peek(filters, space).ideas].map((idea) => [idea.id, idea])).values()];
    for (const idea of candidates.filter((idea) => !seen.has(idea.id) && !repeatsWork(idea, seenWorks) && !seenTitles.has(contentKey(idea.title)) && !seenResources.has(resourceKey(idea.source?.url) ?? "") && !isRejectedIdea(idea, space) &&
      matchesOutingArea(idea, filters, outingAreaFor(space.owner)) &&
      matchesExplorationSetting(idea, filters) && idea.minutes <= timeLimits[filters.time] &&
      !isLowQualityVideo(idea) && hasUsableEntry(idea) && (!avoidFeeds || !isFeedIdea(idea)))) {
      if (!recent.some((previous) => sameExperience(previous, idea)) && !unique.some((previous) => sameExperience(previous, idea))) unique.push(idea);
    }
    return unique;
  }

  available(filters: ExplorationFilters, space: ExplorationSpace): number {
    return this.usableChoices(filters, space).length;
  }

  prepare(filters: ExplorationFilters, space: ExplorationSpace,
    onResult: (result: DiscoveryResult) => void, onSettled: () => void, refill = false): boolean {
    const scope = discoveryScope(filters, space);
    if (scope !== this.scope) {
      this.clear();
      this.scope = scope;
    }
    if (this.controller || this.available(filters, space) >= 6 || (!refill && this.now() - this.startedAt < 1500)) return false;
    if (refill && !this.canRefill(filters, space)) return false;
    if (!refill) this.recoveryAttempts = 0;
    else if (canRetryDiscovery(this.result)) this.recoveryAttempts++;
    this.refillAttempts = refill ? this.refillAttempts + 1 : 0;
    const controller = new AbortController();
    this.controller = controller;
    this.startedAt = this.now();
    const sequence = ++this.sequence;
    const accept = (result: DiscoveryResult) => {
      if (controller.signal.aborted || sequence !== this.sequence) return;
      this.result = mergeDiscoveryResults(this.result, result);
      onResult(this.result);
    };
    const reserved = [...new Map([...this.result.ideas, ...this.usableChoices(filters, space)].map((idea) => [idea.id, idea])).values()];
    void this.load(filters, space, AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]), undefined, accept, reserved)
      .then(accept)
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== this.sequence) return;
        accept({ ideas: [], provider: "none", issue: error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network_error" });
      })
      .finally(() => {
        if (sequence !== this.sequence) return;
        this.controller = null;
        onSettled();
      });
    return true;
  }

  clear() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.result = { ideas: [], provider: "none" };
    this.scope = "";
    this.startedAt = -Infinity;
    this.refillAttempts = 0;
    this.recoveryAttempts = 0;
  }
}
