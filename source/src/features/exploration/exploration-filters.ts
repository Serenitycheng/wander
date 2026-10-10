import type { ExplorationFilters, ExplorationIdea, ExplorationIntent, ExplorationSetting } from "./types.ts";

export const settings: Array<{ id: ExplorationSetting; label: string }> = [
  { id: "outside", label: "出去走走" }, { id: "home", label: "在家探索" }, { id: "any", label: "都可以" },
];
export const intents: Array<{ id: ExplorationIntent; label: string }> = [
  { id: "any", label: "随便探索" }, { id: "learn", label: "学点东西" }, { id: "create", label: "做点东西" },
];
export const settingFor = (filters: ExplorationFilters): ExplorationSetting =>
  filters.setting ?? (filters.mode === "outside" ? "outside" : filters.mode === "home" ? "home" : "any");
export const intentFor = (filters: ExplorationFilters): ExplorationIntent =>
  filters.intent ?? (filters.mode === "learn" || filters.mode === "create" ? filters.mode : "any");
export const withExplorationAxes = (filters: ExplorationFilters, setting = settingFor(filters), intent = intentFor(filters)): ExplorationFilters =>
  ({ ...filters, setting, intent, mode: setting === "any" ? "random" : setting });

// Location is a boundary; learning/creating is a preference. A single activity
// can satisfy both, so changing intent must not split the home candidate pool.
export function matchesExplorationSetting(idea: ExplorationIdea, filters: ExplorationFilters): boolean {
  if (filters.setting === undefined) return filters.mode === "random" || idea.category === filters.mode;
  return filters.setting === "any" || (filters.setting === "outside" ? idea.category === "outside" : idea.category !== "outside");
}
export const intentScore = (idea: ExplorationIdea, filters: ExplorationFilters) =>
  intentFor(filters) !== "any" && idea.category === intentFor(filters) ? 3 : 0;
export const discoveryModeFor = (filters: ExplorationFilters) =>
  filters.setting === undefined ? filters.mode : filters.setting === "outside" ? "outside"
    : intentFor(filters) !== "any" ? intentFor(filters) as "learn" | "create" : filters.setting === "home" ? "home" : "random";
