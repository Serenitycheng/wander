import { originalIdeas } from "./content/original-ideas.ts";
import { additionalIdeas } from "./content/additional-ideas.ts";
import { openIdeas } from "./content/open-ideas.ts";
import { hobbyIdeas } from "./content/hobby-ideas.ts";

// Retired ideas remain readable from existing favorites, records and shared URLs.
// Keep their IDs and text intact rather than assigning saved IDs to new activities.
const retiredIds = new Set([
  "outside-new-turn",
  "outside-three-lights",
  "outside-listen",
  "outside-wudaoying",
  "outside-yangmei",
  "outside-one-tree",
  "outside-map-memory",
  "home-window",
  "home-documentary",
  "home-objects",
  "home-photo-theme",
  "home-collection",
  "home-museum",
  "home-evening",
  "home-sandwich",
  "learn-observe",
  "create-sound",
  "create-six-words",
  "create-color",
  "create-field-note",
  "create-one-line",
  "create-page",
  "create-project",
]);

export const allExplorationIdeas = [...originalIdeas, ...additionalIdeas, ...openIdeas, ...hobbyIdeas];
export const explorationIdeas = [
  ...originalIdeas.filter((item) => !retiredIds.has(item.id)),
  ...additionalIdeas,
  ...openIdeas,
  ...hobbyIdeas,
];

const ideasById = new Map(allExplorationIdeas.map((item) => [item.id, item]));
export const findIdea = (id: string | null | undefined) =>
  id ? ideasById.get(id) : undefined;
