import { explorationIdeas } from "./ideas.ts";
import {
  defaultFilters,
  isMode,
  isMood,
  isTimeWindow,
  timeOptions,
} from "./types.ts";
import type {
  ExplorationFilters,
  ExplorationIdea,
  ExplorationSuggestion,
} from "./types.ts";

const timeLimits = { short: 30, medium: 120, "half-day": 240, any: Infinity };
const moodReasons = {
  gentle: "从轻松的小动作开始，随时停下也可以。",
  curious: "给熟悉的日常一点新鲜感。",
  focused: "有一点可以认真投入的空间。",
  flow: "不用先想好结果，跟着此刻的兴趣走。",
};

export function normalizeFilters(
  value: Partial<ExplorationFilters>,
): ExplorationFilters {
  return {
    mode: isMode(value.mode) ? value.mode : defaultFilters.mode,
    time: isTimeWindow(value.time) ? value.time : defaultFilters.time,
    mood: isMood(value.mood) ? value.mood : defaultFilters.mood,
  };
}

export function reasonsFor(
  idea: ExplorationIdea,
  filters: ExplorationFilters,
): string[] {
  return [
    idea.why,
    ...(idea.moods.includes(filters.mood) || filters.mood === "flow"
      ? [moodReasons[filters.mood]]
      : []),
    ...(filters.time === "any" || idea.minutes > timeLimits[filters.time]
      ? []
      : [
          `可以在你留出的${timeOptions.find((item) => item.id === filters.time)?.label}里试一试。`,
        ]),
  ].slice(0, 3);
}

export function generateSuggestions(
  input: Partial<ExplorationFilters>,
  options: {
    previousIds?: string[];
    recentIds?: string[];
    random?: () => number;
    ideas?: ExplorationIdea[];
  } = {},
): ExplorationSuggestion[] {
  const filters = normalizeFilters(input);
  const random = options.random ?? Math.random;
  const previous = new Set(options.previousIds ?? []);
  const recent = new Set(options.recentIds ?? []);
  const eligible = (options.ideas ?? explorationIdeas).filter(
    (item) =>
      (filters.mode === "random" || item.category === filters.mode) &&
      item.minutes <= timeLimits[filters.time],
  );
  const fresh = eligible.filter((item) => !previous.has(item.id));
  const pool = fresh.length >= Math.min(3, eligible.length) ? fresh : eligible;

  // A small mood preference keeps randomness useful; recently tried ideas get
  // less weight, while the selected mode and available time stay hard filters.
  const ranked = pool
    .map((item) => ({
      idea: item,
      weight:
        (filters.mood === "flow" || item.moods.includes(filters.mood) ? 2 : 0) +
        (recent.has(item.id) ? 0 : 1) +
        Math.max(0, Math.min(0.999, random())),
    }))
    .sort((left, right) => right.weight - left.weight);
  const selected: ExplorationIdea[] = [];

  if (filters.mode === "random") {
    for (const { idea } of ranked) {
      if (!selected.some((chosen) => chosen.category === idea.category))
        selected.push(idea);
      if (selected.length === 3) break;
    }
  }
  for (const { idea } of ranked) {
    if (selected.length === 3) break;
    if (!selected.some((chosen) => chosen.id === idea.id)) selected.push(idea);
  }
  return selected.map((idea) => ({ idea, reasons: reasonsFor(idea, filters) }));
}
