import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptySpace,
  explorationStorageKey,
  mergeSpaces,
  parseSpace,
  readStoredSpace,
  saveStoredSpace,
} from "./storage.ts";
import type { ExplorationRecord } from "./types.ts";

const date = "2026-10-08T10:00:00.000Z";
const makeStorage = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
};
const reflection: ExplorationRecord = {
  id: "record-1",
  ideaId: "home-album",
  category: "home",
  title: "听了一张新专辑",
  feeling: "relaxed",
  reflection: "想再听一遍。",
  again: "yes",
  date: "2026-10-08",
  place: "",
  createdAt: date,
};

test("favorites and reflections survive a browser reload", () => {
  const storage = makeStorage();
  const current = createEmptySpace("serenity");
  const result = saveStoredSpace(storage, current, {
    ...current,
    favorites: [{ ideaId: "home-album", soon: true, addedAt: date }],
    records: [reflection],
  });
  assert.equal(result.status, "saved");
  const loaded = readStoredSpace(storage, "serenity");
  assert.equal(loaded.status, "ready");
  assert.equal(loaded.space.revision, 1);
  assert.deepEqual(loaded.space.records, [reflection]);
  assert.equal(loaded.space.favorites[0].soon, true);
});
test("old backups remain valid and page colors survive storage and backup parsing", () => {
  const storage = makeStorage();
  const current = createEmptySpace("serenity");
  assert.ok(parseSpace(JSON.parse(JSON.stringify(current)), "serenity"));
  const next = {
    ...current,
    preferences: {
      ...current.preferences,
      tone: "#80674D",
      pageColors: { home: "#657F91", records: "#8A6F7D" },
    },
    records: [reflection],
  };
  assert.equal(saveStoredSpace(storage, current, next).status, "saved");
  const loaded = readStoredSpace(storage, "serenity");
  assert.equal(loaded.space.preferences.tone, "#80674d");
  assert.deepEqual(loaded.space.preferences.pageColors, {
    home: "#657f91",
    records: "#8a6f7d",
  });
  assert.deepEqual(
    parseSpace(JSON.parse(JSON.stringify(loaded.space)), "serenity"),
    loaded.space,
  );
  assert.deepEqual(loaded.space.records, [reflection]);
});
test("malformed appearance data is rejected without overwriting the stored space", () => {
  const current = createEmptySpace("serenity");
  for (const appearance of [
    { tone: "red" },
    { tone: "#abc" },
    { pageColors: [] },
    { pageColors: { home: "url(https://example.com)" } },
    { pageColors: { otherPage: "#718c7c" } },
  ]) {
    const storage = makeStorage();
    const raw = JSON.stringify({
      ...current,
      preferences: { ...current.preferences, ...appearance },
    });
    storage.entries.set(explorationStorageKey("serenity"), raw);
    assert.equal(readStoredSpace(storage, "serenity").status, "invalid");
    assert.equal(saveStoredSpace(storage, current, current).status, "invalid");
    assert.equal(storage.entries.get(explorationStorageKey("serenity")), raw);
  }
});
test("the two accounts use separate keys and leave Beijing drafts untouched", () => {
  const storage = makeStorage();
  storage.entries.set("beijing-play:space:serenity", "retained original draft");
  const current = createEmptySpace("serenity");
  saveStoredSpace(storage, current, { ...current, records: [reflection] });
  assert.equal(readStoredSpace(storage, "zzz").space.records.length, 0);
  assert.equal(
    storage.entries.get("beijing-play:space:serenity"),
    "retained original draft",
  );
  assert.notEqual(
    explorationStorageKey("serenity"),
    explorationStorageKey("zzz"),
  );
});
test("a stale tab cannot overwrite a newer reflection", () => {
  const storage = makeStorage();
  const firstTab = createEmptySpace("serenity");
  saveStoredSpace(storage, firstTab, { ...firstTab, records: [reflection] });
  const staleResult = saveStoredSpace(storage, firstTab, {
    ...firstTab,
    records: [],
  });
  assert.equal(staleResult.status, "conflict");
  assert.deepEqual(readStoredSpace(storage, "serenity").space.records, [
    reflection,
  ]);
});
test("corrupt or future-version data is preserved instead of reset", () => {
  for (const raw of [
    "{broken",
    JSON.stringify({ ...createEmptySpace("serenity"), schemaVersion: 2 }),
  ]) {
    const storage = makeStorage();
    storage.entries.set(explorationStorageKey("serenity"), raw);
    assert.equal(readStoredSpace(storage, "serenity").status, "invalid");
    const current = createEmptySpace("serenity");
    assert.equal(saveStoredSpace(storage, current, current).status, "invalid");
    assert.equal(storage.entries.get(explorationStorageKey("serenity")), raw);
  }
});
test("a browser refusing writes retains the previous data", () => {
  const storage = makeStorage();
  const current = createEmptySpace("serenity");
  storage.setItem(explorationStorageKey("serenity"), JSON.stringify(current));
  const denied = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(
    saveStoredSpace(denied, current, { ...current, records: [reflection] })
      .status,
    "unavailable",
  );
  assert.equal(readStoredSpace(storage, "serenity").space.records.length, 0);
});
test("imports reject another owner and malformed or duplicated records", () => {
  assert.equal(parseSpace(createEmptySpace("zzz"), "serenity"), null);
  assert.equal(
    parseSpace(
      {
        ...createEmptySpace("serenity"),
        records: [{ ...reflection, title: "" }],
      },
      "serenity",
    ),
    null,
  );
  assert.equal(
    parseSpace(
      { ...createEmptySpace("serenity"), records: [reflection, reflection] },
      "serenity",
    ),
    null,
  );
  assert.equal(
    parseSpace(
      {
        ...createEmptySpace("serenity"),
        records: [{ ...reflection, date: "2026-02-30" }],
      },
      "serenity",
    ),
    null,
  );
  assert.equal(
    parseSpace(
      {
        ...createEmptySpace("serenity"),
        records: [{ ...reflection, feeling: [] }],
      },
      "serenity",
    ),
    null,
  );
});
test("restoring a backup merges additions and keeps current reflections", () => {
  const current = {
    ...createEmptySpace("serenity"),
    records: [reflection],
    favorites: [{ ideaId: "home-album", soon: false, addedAt: date }],
  };
  const backup = {
    ...createEmptySpace("serenity"),
    records: [
      { ...reflection, reflection: "older text" },
      { ...reflection, id: "record-2" },
    ],
    favorites: [{ ideaId: "home-album", soon: true, addedAt: date }],
  };
  const merged = mergeSpaces(current, backup);
  assert.equal(merged.records.length, 2);
  assert.equal(
    merged.records.find((item) => item.id === "record-1")?.reflection,
    "想再听一遍。",
  );
  assert.equal(merged.favorites.length, 1);
  assert.equal(merged.favorites[0].soon, true);
  assert.throws(
    () => mergeSpaces(current, createEmptySpace("zzz")),
    /SPACE_OWNER_MISMATCH/,
  );
});
