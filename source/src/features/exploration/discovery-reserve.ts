import { DiscoveryBuffer } from "./discovery-buffer.ts";
import { requestDiscovery } from "./discovery-client.ts";
import { intentFor, matchesExplorationSetting, settingFor, withExplorationAxes } from "./exploration-filters.ts";
import { timeLimits } from "./generator.ts";
import { matchesOutingArea, outingAreaFor } from "./outing-policy.ts";
import { sameExperience } from "./activity-affinity.ts";
import { profileFor } from "./profile.ts";
import { isDiscoveryFailure } from "./discovery-status.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import type { ExplorationFilters, ExplorationSpace } from "./types.ts";

export const reserveIntervalMs = 8000;
export const reserveContext = (space: ExplorationSpace) => JSON.stringify([
  space.owner, profileFor(space), space.favorites.map((item) => item.ideaId),
  space.feedback ?? [], space.recommendationCleanup ?? null,
]);
const keyFor = (filters: ExplorationFilters) => JSON.stringify([settingFor(filters), intentFor(filters), filters.time]);

// Mood and intent rank choices rather than excluding them. Shared, persisted
// candidates cover the full matrix without making 180 near-identical requests.
export function preparationTargets(active: ExplorationFilters): ExplorationFilters[] {
  // All generated ideas are capped at 240 minutes, so "any" shares the
  // half-day pool. Keep 90–120 minutes separate from longer outings.
  const targets = [withExplorationAxes({ ...active, time: active.time === "any" ? "half-day" : active.time })];
  for (const time of ["short", "hour", "medium", "half-day"] as const)
    for (const setting of ["home", "outside"] as const)
      for (const intent of ["any", "learn", "create"] as const)
        targets.push(withExplorationAxes({ ...active, time, mood: "flow" }, setting, intent));
  return [...new Map(targets.map((filters) => [keyFor(filters), filters])).values()];
}

export class DiscoveryReserve {
  private context = "";
  private controller: AbortController | null = null;
  private sequence = 0;
  private attempts = new Map<string, number>();
  private consumption = "";
  private blocked = false;
  private readonly choices = new DiscoveryBuffer();
  private readonly load: typeof requestDiscovery;

  constructor(load: typeof requestDiscovery = requestDiscovery) { this.load = load; }
  get preparing() { return this.controller !== null; }
  get stopped() { return this.blocked; }

  stopOnFailure(result: DiscoveryResult, space?: ExplorationSpace) {
    if (space && this.context !== reserveContext(space)) { this.clear(); this.context = reserveContext(space); }
    if (!isDiscoveryFailure(result)) this.blocked = false;
    if (isDiscoveryFailure(result) && !["network_error", "service_unavailable", "provider_unavailable", "invalid_response", "timeout"].includes(result.issue!)) {
      this.blocked = true;
      this.pause();
    }
  }

  private ready(filters: ExplorationFilters, choices: ExplorationSpace["discoveredIdeas"], space: ExplorationSpace) {
    const intent = intentFor(filters);
    const unique: typeof choices = [];
    for (const idea of choices.filter((idea) =>
      matchesExplorationSetting(idea, filters) && idea.minutes <= timeLimits[filters.time] &&
      matchesOutingArea(idea, filters, outingAreaFor(space.owner)) &&
      // Maintain longer experiences too, not only 30-minute ideas that happen
      // to fit every upper time limit. Any-scene filters share both pools.
      idea.minutes > ({ short: 0, hour: 30, medium: 90, "half-day": 120, any: 120 }[filters.time]) &&
      (settingFor(filters) !== "home" || intent === "any" || idea.category === intent))) {
      if (!unique.some((previous) => sameExperience(previous, idea))) unique.push(idea);
      if (unique.length === 6) break;
    }
    return unique.length;
  }

  prepare(active: ExplorationFilters, space: ExplorationSpace, onResult: (result: DiscoveryResult) => void, onSettled: () => void): boolean {
    const context = reserveContext(space);
    if (this.context !== context) { this.clear(); this.context = context; }
    const consumption = JSON.stringify(space.shownIdeaIds);
    if (this.consumption !== consumption) { this.consumption = consumption; this.attempts.clear(); }
    if (this.controller || this.blocked) return false;
    // Evaluate history, favorites and feedback once for the shared pool. Apply
    // each bucket's scene/time/location before deduplication, so a far-away
    // variation cannot hide an eligible nearby outing.
    const choices = this.choices.eligibleChoices(withExplorationAxes({ ...active, time: "any" }, "any", "any"), space);
    const targets = preparationTargets(active).filter((filters) => {
      if ((this.attempts.get(keyFor(filters)) ?? 0) >= 2) return false;
      return this.ready(filters, choices, space) < 6;
    });
    // After an empty batch, rotate to another pool before retrying that pool.
    targets.sort((a, b) => (this.attempts.get(keyFor(a)) ?? 0) - (this.attempts.get(keyFor(b)) ?? 0));
    const filters = targets[0];
    if (!filters) return false;
    const key = keyFor(filters);
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
    const controller = new AbortController();
    this.controller = controller;
    const sequence = ++this.sequence;
    const accept = (result: DiscoveryResult) => {
      if (controller.signal.aborted || sequence !== this.sequence) return;
      this.stopOnFailure(result);
      onResult(result);
    };
    const reserved = space.discoveredIdeas.filter((idea) => !space.shownIdeaIds.includes(idea.id));
    void this.load(filters, space, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), undefined, accept, reserved, true)
      .then(accept)
      .catch(() => { /* Background errors never erase prepared choices. */ })
      .finally(() => {
        if (sequence !== this.sequence) return;
        this.controller = null;
        onSettled();
      });
    return true;
  }

  pause() { this.sequence++; this.controller?.abort(); this.controller = null; }
  retry() { this.pause(); this.attempts.clear(); this.blocked = false; }
  clear() { this.pause(); this.context = ""; this.attempts.clear(); this.consumption = ""; this.blocked = false; }
}
