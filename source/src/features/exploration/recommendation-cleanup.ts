import { allExplorationIdeas } from "./ideas.ts";
import type { ExplorationSpace, SpaceOwner } from "./types.ts";
import { preserveSnapshotIds, protectedRecommendationIds, suppressionFor } from "./recommendation-policy.ts";
import { mergeDiscoveredIdeas, parseSpace, readStoredSpace, saveStoredSpace } from "./storage.ts";
import type { SaveResult } from "./storage.ts";
import { workHistory } from "./work-history.ts";

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;
export const recommendationBackupKey = (owner: SpaceOwner) => `free-exploration:recommendation-backup:v1:${owner}`;
export const needsRecommendationCleanup = (space: ExplorationSpace) => space.owner === "serenity" && !space.recommendationCleanup;

export function clearOldRecommendations(space: ExplorationSpace, now = new Date().toISOString()): ExplorationSpace {
  const protectedIds = protectedRecommendationIds(space);
  const snapshots = preserveSnapshotIds(space);
  const discarded = [...allExplorationIdeas, ...space.discoveredIdeas].filter((idea) => !protectedIds.has(idea.id));
  const evidence = new Map((space.suppressedIdeas ?? []).map((item) => [item.id, item]));
  for (const idea of discarded) if (!evidence.has(idea.id)) evidence.set(idea.id, suppressionFor(idea, "cleanup"));
  return { ...space, recommendationCleanup: { version: 1, completedAt: now, active: true },
    suppressedIdeas: [...evidence.values()], shownWorkKeys: workHistory(space),
    discoveredIdeas: space.discoveredIdeas.filter((idea) => snapshots.has(idea.id)) };
}

export function cleanupStoredRecommendations(storage: BrowserStorage, space: ExplorationSpace): SaveResult {
  const latest = readStoredSpace(storage, space.owner);
  if (latest.status !== "ready") return { status: latest.status, space };
  if (latest.space.revision !== space.revision) return { status: "conflict", space: latest.space };
  try {
    // Back up each actual cache deletion. Repeating cleanup on an already empty
    // cache must not replace the recoverable copy with an empty one.
    const key = recommendationBackupKey(space.owner);
    const pinned = preserveSnapshotIds(space);
    const hasDiscardedCache = space.discoveredIdeas.some((idea) => !pinned.has(idea.id));
    if (storage.getItem(key) === null || !space.recommendationCleanup?.active || hasDiscardedCache)
      storage.setItem(key, JSON.stringify(space));
  } catch { return { status: "unavailable", space }; }
  return saveStoredSpace(storage, space, clearOldRecommendations(space));
}

export function readRecommendationBackup(storage: BrowserStorage, owner: SpaceOwner): ExplorationSpace | null {
  try { const raw = storage.getItem(recommendationBackupKey(owner)); return raw ? parseSpace(JSON.parse(raw), owner) : null; }
  catch { return null; }
}

export function restoreRecommendationCache(current: ExplorationSpace, backup: ExplorationSpace): ExplorationSpace {
  if (current.owner !== backup.owner) throw new Error("SPACE_OWNER_MISMATCH");
  const next: ExplorationSpace = { ...current,
    recommendationCleanup: { version: 1, completedAt: current.recommendationCleanup?.completedAt ?? new Date().toISOString(), active: false },
    suppressedIdeas: (current.suppressedIdeas ?? []).filter((item) => item.reason === "dislike") };
  // Restore only recommendation cache. Later records, votes, colors and removals
  // must not be rolled back or resurrected by an unrelated cleanup undo.
  return { ...next, discoveredIdeas: mergeDiscoveredIdeas(next, backup.discoveredIdeas) };
}

