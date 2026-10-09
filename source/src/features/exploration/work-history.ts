import { namedWorkKeys } from "./activity-affinity.ts";
import { contentKey, rememberShown } from "./discovery.ts";
import { explorationIdeas } from "./ideas.ts";
import { profileFor, readingReferences } from "./profile.ts";
import type { ExplorationIdea, ExplorationSpace } from "./types.ts";

export function workHistory(space: ExplorationSpace, displayed: ExplorationIdea[] = []): string[] {
  const known = new Map([...explorationIdeas, ...space.discoveredIdeas].map((idea) => [idea.id, idea]));
  const references = [...readingReferences({ ...profileFor(space), favoriteTitles: [] }).map(contentKey), ...(space.shownWorkKeys ?? [])];
  const previous = space.shownIdeaIds.flatMap((id) => known.get(id) ?? []);
  // Backfill old spaces from available snapshots, then keep a compact history
  // independent of the 240-entry discovery cache. No favorite/record is removed.
  return rememberShown(space.shownWorkKeys ?? [], [...previous, ...displayed].flatMap((idea) => namedWorkKeys(idea.title, references)));
}

export const repeatsWork = (idea: ExplorationIdea, keys: string[]) =>
  namedWorkKeys(idea.title, keys).some((key) => keys.includes(key));
