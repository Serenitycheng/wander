import { mergeDiscoveryResults, requestDiscovery } from "./discovery-client.ts";
import { profileFor } from "./profile.ts";
import { isRejectedIdea } from "./recommendation-ranking.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import type { ExplorationFilters, ExplorationSpace } from "./types.ts";
import { timeLimits } from "./generator.ts";
import { contentKey, isFeedIdea, isLowQualityVideo, sourceUrl } from "./discovery.ts";
import { explorationIdeas } from "./ideas.ts";
import { hasUsableEntry } from "./activity-diversity.ts";

export const discoveryScope = (filters: ExplorationFilters, space: ExplorationSpace) =>
  JSON.stringify([space.owner, filters.mode, filters.time, filters.mood, profileFor(space),
    space.favorites.map((item) => item.ideaId), space.feedback ?? []]);

// One background batch serves several clicks. Showing a round never waits for
// this buffer, and only the owning account/filter/profile may consume it.
export class DiscoveryBuffer {
  private scope = "";
  private result: DiscoveryResult = { ideas: [], provider: "none" };
  private controller: AbortController | null = null;
  private startedAt = -Infinity;
  private sequence = 0;
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

  available(filters: ExplorationFilters, space: ExplorationSpace): number {
    const seen = new Set(space.shownIdeaIds);
    const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
    const seenTitles = new Set(space.shownIdeaIds.flatMap((id) => known.get(id) ? [contentKey(known.get(id)!.title)] : []));
    const seenResources = new Set(space.shownIdeaIds.flatMap((id) => known.get(id)?.source ? [sourceUrl(known.get(id)!.source!.url)] : []));
    const avoidFeeds = !profileFor(space).allowFeeds || space.shownIdeaIds.slice(-6).some((id) => {
      const idea = known.get(id); return idea && isFeedIdea(idea);
    });
    return new Set(this.peek(filters, space).ideas.filter((idea) => !seen.has(idea.id) && !seenTitles.has(contentKey(idea.title)) && !seenResources.has(sourceUrl(idea.source?.url)) && !isRejectedIdea(idea, space) &&
      (filters.mode === "random" || idea.category === filters.mode) && idea.minutes <= timeLimits[filters.time] &&
      !isLowQualityVideo(idea) && hasUsableEntry(idea) && (!avoidFeeds || !isFeedIdea(idea))).map((idea) => contentKey(idea.title))).size;
  }

  prepare(filters: ExplorationFilters, space: ExplorationSpace,
    onResult: (result: DiscoveryResult) => void, onSettled: () => void): boolean {
    const scope = discoveryScope(filters, space);
    if (scope !== this.scope) {
      this.clear();
      this.scope = scope;
    }
    if (this.controller || this.available(filters, space) >= 6 || this.now() - this.startedAt < 10000) return false;
    const controller = new AbortController();
    this.controller = controller;
    this.startedAt = this.now();
    const sequence = ++this.sequence;
    const accept = (result: DiscoveryResult) => {
      if (controller.signal.aborted || sequence !== this.sequence) return;
      this.result = mergeDiscoveryResults(this.result, result);
      onResult(this.result);
    };
    void this.load(filters, space, AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]), undefined, accept)
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
  }
}
