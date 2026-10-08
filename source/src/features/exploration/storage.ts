import {
  defaultFilters,
  isCategory,
  isMode,
  isMood,
  isTimeWindow,
} from "./types.ts";
import type {
  ExplorationFavorite,
  ExplorationRecord,
  ExplorationSpace,
  SpaceOwner,
} from "./types.ts";
import { parseAppearance } from "./appearance.ts";

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;
type ReadResult = {
  status: "ready" | "invalid" | "unavailable";
  space: ExplorationSpace;
};
export type SaveResult = {
  status: "saved" | "conflict" | "invalid" | "unavailable";
  space: ExplorationSpace;
};

export const explorationStorageKey = (owner: SpaceOwner) =>
  `free-exploration:space:v1:${owner}`;
export const createEmptySpace = (owner: SpaceOwner): ExplorationSpace => ({
  schemaVersion: 1,
  owner,
  revision: 0,
  updatedAt: null,
  preferences: { ...defaultFilters, theme: "sage" },
  favorites: [],
  records: [],
});

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
const timestamp = (value: unknown): value is string =>
  text(value, 40) && Number.isFinite(Date.parse(value));
const calendarDate = (value: string) =>
  value === "" ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value);
const favorite = (value: unknown): value is ExplorationFavorite =>
  object(value) &&
  text(value.ideaId, 100) &&
  Boolean(value.ideaId.trim()) &&
  timestamp(value.addedAt) &&
  typeof value.soon === "boolean";
const record = (value: unknown): value is ExplorationRecord =>
  object(value) &&
  text(value.id, 100) &&
  Boolean(value.id.trim()) &&
  (value.ideaId === null || text(value.ideaId, 100)) &&
  isCategory(value.category) &&
  text(value.title, 160) &&
  Boolean(value.title.trim()) &&
  text(value.reflection, 600) &&
  typeof value.feeling === "string" &&
  ["", "relaxed", "surprised", "absorbed", "ordinary"].includes(
    value.feeling,
  ) &&
  typeof value.again === "string" &&
  ["yes", "maybe", "no"].includes(value.again) &&
  text(value.date, 10) &&
  calendarDate(value.date) &&
  text(value.place, 160) &&
  timestamp(value.createdAt);

export function parseSpace(
  value: unknown,
  owner: SpaceOwner,
): ExplorationSpace | null {
  const appearance =
    object(value) && object(value.preferences)
      ? parseAppearance(value.preferences)
      : null;
  if (
    !appearance ||
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.owner !== owner ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !(value.updatedAt === null || timestamp(value.updatedAt)) ||
    !object(value.preferences) ||
    !isMode(value.preferences.mode) ||
    !isTimeWindow(value.preferences.time) ||
    !isMood(value.preferences.mood) ||
    (value.preferences.theme !== "sage" &&
      value.preferences.theme !== "lavender") ||
    !Array.isArray(value.favorites) ||
    !value.favorites.every(favorite) ||
    !Array.isArray(value.records) ||
    !value.records.every(record)
  )
    return null;
  if (
    new Set(value.favorites.map((item) => item.ideaId)).size !==
      value.favorites.length ||
    new Set(value.records.map((item) => item.id)).size !== value.records.length
  )
    return null;
  // Reconstruct the known schema so imported objects cannot introduce fields
  // into later writes; incompatible data is left untouched in storage.
  return {
    schemaVersion: 1,
    owner,
    revision: Number(value.revision),
    updatedAt: value.updatedAt,
    preferences: {
      mode: value.preferences.mode,
      time: value.preferences.time,
      mood: value.preferences.mood,
      theme: value.preferences.theme as "sage" | "lavender",
      ...appearance,
    },
    favorites: value.favorites.map((item) => ({
      ideaId: item.ideaId,
      addedAt: item.addedAt,
      soon: item.soon,
    })),
    records: value.records.map((item) => ({
      id: item.id,
      ideaId: item.ideaId,
      category: item.category,
      title: item.title,
      feeling: item.feeling,
      reflection: item.reflection,
      again: item.again,
      date: item.date,
      place: item.place,
      createdAt: item.createdAt,
    })),
  };
}

export function readStoredSpace(
  storage: BrowserStorage,
  owner: SpaceOwner,
): ReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(explorationStorageKey(owner));
  } catch {
    return { status: "unavailable", space: createEmptySpace(owner) };
  }
  if (raw === null) return { status: "ready", space: createEmptySpace(owner) };
  try {
    const parsed = parseSpace(JSON.parse(raw), owner);
    return {
      status: parsed ? "ready" : "invalid",
      space: parsed ?? createEmptySpace(owner),
    };
  } catch {
    return { status: "invalid", space: createEmptySpace(owner) };
  }
}

export function saveStoredSpace(
  storage: BrowserStorage,
  current: ExplorationSpace,
  next: ExplorationSpace,
): SaveResult {
  const stored = readStoredSpace(storage, current.owner);
  if (stored.status !== "ready")
    return { status: stored.status, space: stored.space };
  if (stored.space.revision !== current.revision)
    return { status: "conflict", space: stored.space };
  const updated = parseSpace(
    {
      ...next,
      owner: current.owner,
      schemaVersion: 1,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    },
    current.owner,
  );
  if (!updated) return { status: "invalid", space: current };
  try {
    storage.setItem(
      explorationStorageKey(current.owner),
      JSON.stringify(updated),
    );
    return { status: "saved", space: updated };
  } catch {
    return { status: "unavailable", space: current };
  }
}

export function mergeSpaces(
  current: ExplorationSpace,
  imported: ExplorationSpace,
): ExplorationSpace {
  if (current.owner !== imported.owner) throw new Error("SPACE_OWNER_MISMATCH");
  const favorites = new Map(
    imported.favorites.map((item) => [item.ideaId, item]),
  );
  for (const item of current.favorites) {
    const previous = favorites.get(item.ideaId);
    favorites.set(item.ideaId, {
      ...item,
      soon: item.soon || Boolean(previous?.soon),
    });
  }
  const records = new Map(imported.records.map((item) => [item.id, item]));
  // An imported backup adds missing entries; existing reflections are retained.
  for (const item of current.records) records.set(item.id, item);
  return {
    ...current,
    favorites: [...favorites.values()].sort((a, b) =>
      b.addedAt.localeCompare(a.addedAt),
    ),
    records: [...records.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}
