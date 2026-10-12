import { explorationIdeas } from "./ideas.ts";
import { activityKind } from "./discovery.ts";
import {
  defaultFilters,
  isMode,
  isMood,
  isTimeWindow,
  isSetting,
  isIntent,
} from "./types.ts";
import { intentScore, matchesExplorationSetting } from "./exploration-filters.ts";
import type {
  ExplorationFilters,
  ExplorationIdea,
  ExplorationSuggestion,
} from "./types.ts";

export const timeLimits = { short: 30, hour: 90, medium: 120, "half-day": 240, any: Infinity };

export function normalizeFilters(
  value: Partial<ExplorationFilters>,
): ExplorationFilters {
  return {
    mode: isMode(value.mode) ? value.mode : defaultFilters.mode,
    time: isTimeWindow(value.time) ? value.time : defaultFilters.time,
    mood: isMood(value.mood) ? value.mood : defaultFilters.mood,
    ...(isSetting(value.setting) ? { setting: value.setting } : {}),
    ...(isIntent(value.intent) ? { intent: value.intent } : {}),
  };
}

export function reasonsFor(
  idea: ExplorationIdea,
): string[] {
  return [idea.why];
}

export function generateSuggestions(
  input: Partial<ExplorationFilters>,
  options: {
    previousIds?: string[];
    shownIds?: string[];
    recentIds?: string[];
    random?: () => number;
    ideas?: ExplorationIdea[];
    score?: (idea: ExplorationIdea) => number;
  } = {},
): ExplorationSuggestion[] {
  const filters = normalizeFilters(input);
  const random = options.random ?? Math.random;
  const previous = new Set(options.previousIds ?? []);
  const recent = new Set(options.recentIds ?? []);
  const shown = new Map((options.shownIds ?? []).map((id, index) => [id, index]));
  const eligible = (options.ideas ?? explorationIdeas).filter(
    (item) =>
      matchesExplorationSetting(item, filters) &&
      item.minutes <= timeLimits[filters.time],
  );
  // Unseen content comes first, then the least recently shown. Mood never
  // traps a user inside a tiny subset, and a sparse pool keeps its fresh items.
  const ranked = eligible
    .map((item) => ({
      idea: item,
      seen: shown.has(item.id) || previous.has(item.id),
      previous: previous.has(item.id),
      lastShown: shown.get(item.id) ?? -1,
      weight:
        (filters.mood === "flow" || item.moods.includes(filters.mood) ? 2 : 0) +
        (recent.has(item.id) ? 0 : 1) +
        (options.score?.(item) ?? 0) +
        intentScore(item, filters) +
        Math.max(0, Math.min(0.999, random())),
    }))
    .sort((left, right) => Number(left.seen) - Number(right.seen) ||
      Number(left.previous) - Number(right.previous) ||
      (left.seen && right.seen ? left.lastShown - right.lastShown : 0) || right.weight - left.weight);
  const selected: ExplorationIdea[] = [];

  for (const seen of [false, true]) {
    const candidates = ranked.filter((item) => item.seen === seen);
    for (const diversify of [true, false]) {
      for (const { idea } of candidates) {
        if (selected.length === 3) break;
        if (selected.some((chosen) => chosen.id === idea.id)) continue;
        if (diversify && selected.some((chosen) => filters.mode === "random"
          ? chosen.category === idea.category : (chosen.domain ?? activityKind(chosen)) === (idea.domain ?? activityKind(idea)))) continue;
        selected.push(idea);
      }
    }
  }
  return selected.map((idea) => ({ idea, reasons: reasonsFor(idea) }));
}
