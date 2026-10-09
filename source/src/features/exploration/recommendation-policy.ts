import { activityForms, isCategory } from "./types.ts";
import type { ExplorationIdea, ExplorationSpace, SuppressedIdea } from "./types.ts";
import { allExplorationIdeas } from "./ideas.ts";
import { isObject, sourceUrl } from "./discovery.ts";
import { sameExperience } from "./activity-affinity.ts";

export const maxFeedback = 1000;
export const maxSuppressedIdeas = 1500;
export const freshOnly = (space: ExplorationSpace) => space.recommendationCleanup?.active === true;
export const protectedRecommendationIds = (space: ExplorationSpace) => new Set([
  ...space.favorites.map((item) => item.ideaId),
  ...(space.feedback ?? []).filter((item) => item.vote === "more").map((item) => item.ideaId),
]);
export const preserveSnapshotIds = (space: ExplorationSpace) => new Set([
  ...protectedRecommendationIds(space), ...space.records.flatMap((item) => item.ideaId ?? []),
]);

export function suppressionFor(idea: ExplorationIdea, reason: SuppressedIdea["reason"]): SuppressedIdea {
  return { id: idea.id, category: idea.category, title: idea.title, description: idea.description.slice(0, 220), reason,
    ...(idea.approach ? { approach: idea.approach } : {}), ...(idea.form ? { form: idea.form } : {}),
    ...(idea.domain ? { domain: idea.domain } : {}), ...(idea.source ? { source: { name: idea.source.name, url: idea.source.url } } : {}) };
}
export const suppressionIdea = (item: SuppressedIdea): ExplorationIdea => ({
  ...item, minutes: 1, moods: [], why: "", firstStep: "",
});
export const knownSpaceIdeas = (space: ExplorationSpace) => new Map([
  ...allExplorationIdeas, ...(space.suppressedIdeas ?? []).map(suppressionIdea), ...space.discoveredIdeas,
].map((idea) => [idea.id, idea]));

export function parseSuppressedIdea(value: unknown): SuppressedIdea | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id.trim() || value.id.length > 100 || !isCategory(value.category) ||
    typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 ||
    typeof value.description !== "string" || value.description.length > 220 ||
    !["cleanup", "dislike"].includes(String(value.reason)) ||
    (value.approach !== undefined && value.approach !== "open" && value.approach !== "specific") ||
    (value.form !== undefined && !activityForms.includes(value.form as typeof activityForms[number])) ||
    (value.domain !== undefined && (typeof value.domain !== "string" || value.domain.length > 60))) return null;
  let source: ExplorationIdea["source"];
  if (value.source !== undefined) {
    if (!isObject(value.source) || typeof value.source.name !== "string" || !value.source.name.trim() || value.source.name.length > 120) return null;
    const url = sourceUrl(value.source.url); if (!url) return null;
    source = { name: value.source.name, url };
  }
  return { id: value.id, category: value.category, title: value.title, description: value.description, reason: value.reason as SuppressedIdea["reason"],
    ...(value.approach ? { approach: value.approach as ExplorationIdea["approach"] } : {}),
    ...(value.form ? { form: value.form as ExplorationIdea["form"] } : {}),
    ...(typeof value.domain === "string" ? { domain: value.domain } : {}), ...(source ? { source } : {}) };
}

export function isRemovedRecommendation(idea: ExplorationIdea, space: ExplorationSpace): boolean {
  const protectedIds = protectedRecommendationIds(space);
  if (protectedIds.has(idea.id)) return false;
  if (freshOnly(space) && allExplorationIdeas.some((old) => old.id === idea.id)) return true;
  if (freshOnly(space) && idea.discoveredAt && Date.parse(idea.discoveredAt) <= Date.parse(space.recommendationCleanup!.completedAt)) return true;
  return (space.suppressedIdeas ?? []).some((old) =>
    (old.reason === "dislike" || freshOnly(space)) && sameExperience(suppressionIdea(old), idea));
}
