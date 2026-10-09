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
import { defaultTone, resetSpaceTone, saveColorScheme, spaceTone, withSpaceTone } from "./appearance.ts";
import { defaultProfile, profileFor } from "./profile.ts";

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
test("shared color changes and reset survive reload without affecting records or another account", () => {
  const storage = makeStorage();
  const current = createEmptySpace("serenity");
  const initial = saveStoredSpace(storage, current, {
    ...current,
    preferences: { ...current.preferences, mode: "home", theme: "lavender", pageColors: { explore: "#657f91", records: "#8a6f7d" } },
    favorites: [{ ideaId: "home-album", addedAt: date, soon: true }],
    records: [reflection],
  });
  assert.equal(initial.status, "saved");
  const selected = saveStoredSpace(storage, initial.space, {
    ...initial.space,
    preferences: withSpaceTone(initial.space.preferences, "#FFEeBB"),
  });
  assert.equal(selected.status, "saved");
  const reloaded = readStoredSpace(storage, "serenity").space;
  assert.equal(spaceTone(reloaded.preferences), "#ffeebb");
  assert.equal(reloaded.preferences.pageColors, undefined);
  assert.equal(reloaded.preferences.mode, "home");
  assert.deepEqual(reloaded.records, [reflection]);
  assert.deepEqual(reloaded.favorites, initial.space.favorites);
  assert.deepEqual(parseSpace(JSON.parse(JSON.stringify(reloaded)), "serenity"), reloaded);
  assert.equal(spaceTone(readStoredSpace(storage, "zzz").space.preferences), defaultTone);

  assert.equal(saveStoredSpace(storage, reloaded, {
    ...reloaded,
    preferences: resetSpaceTone(reloaded.preferences),
  }).status, "saved");
  const reset = readStoredSpace(storage, "serenity").space;
  assert.equal(spaceTone(reset.preferences), defaultTone);
  assert.equal(reset.preferences.tone, undefined);
  assert.equal(reset.preferences.pageColors, undefined);
  assert.equal(reset.preferences.mode, "home");
  assert.deepEqual(reset.records, reloaded.records);
  assert.deepEqual(reset.favorites, reloaded.favorites);
});

test("malformed appearance data is rejected without overwriting the stored space", () => {
  const current = createEmptySpace("serenity");
  for (const appearance of [
    { tone: "red" },
    { tone: "#abc" },
    { pageColors: [] },
    { pageColors: { home: "url(https://example.com)" } },
    { pageColors: { otherPage: "#718c7c" } },
    { colorSchemes: [{ id: "one", name: "晚霞", tone: "red" }] },
    { colorSchemes: [{ id: "one", name: "晚霞", tone: "#80769a" }, { id: "two", name: "晚霞", tone: "#657f91" }] },
    { colorSchemes: [{ id: "one", name: "晚霞", tone: "#80769a" }, { id: "one", name: "雾蓝", tone: "#657f91" }] },
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

test("named color schemes survive reload, update in place and merge from backup without resetting current preferences", () => {
  const storage = makeStorage();
  const empty = createEmptySpace("serenity");
  const preferences = saveColorScheme(withSpaceTone(empty.preferences, "#80769a"), "晚霞", "scheme-one")!;
  assert.equal(saveStoredSpace(storage, empty, { ...empty, preferences, records: [reflection] }).status, "saved");
  const reloaded = readStoredSpace(storage, "serenity").space;
  assert.deepEqual(reloaded.preferences.colorSchemes, [{ id: "scheme-one", name: "晚霞", tone: "#80769a" }]);
  assert.equal(profileFor(readStoredSpace(storage, "zzz").space).readingList, "");
  assert.equal(readStoredSpace(storage, "zzz").space.preferences.colorSchemes, undefined);
  const changed = saveColorScheme(withSpaceTone(reloaded.preferences, "#657f91"), "晚霞", "new-id")!;
  assert.deepEqual(changed.colorSchemes, [{ id: "scheme-one", name: "晚霞", tone: "#657f91" }]);
  const restored = { ...reloaded, preferences: resetSpaceTone(changed) };
  assert.deepEqual(restored.preferences.colorSchemes, changed.colorSchemes);
  const imported = { ...empty, preferences: saveColorScheme(withSpaceTone(empty.preferences, "#8a6f7d"), "玫瑰纸", "scheme-two")! };
  const merged = mergeSpaces(restored, imported);
  assert.equal(merged.preferences.colorSchemes?.length, 2);
  assert.equal(spaceTone(merged.preferences), defaultTone);
  assert.deepEqual(merged.records, [reflection]);
  assert.deepEqual(parseSpace(JSON.parse(JSON.stringify(merged)), "serenity"), merged);
});

test("editable recommendation preferences survive backup and reject malformed data without replacing saved records", () => {
  const storage = makeStorage();
  const empty = createEmptySpace("serenity");
  const profile = { ...defaultProfile("serenity"), interests: "文学、唱歌、自然", readingList: "《边城》", allowFeeds: false };
  assert.equal(saveStoredSpace(storage, empty, { ...empty, preferences: { ...empty.preferences, profile }, records: [reflection] }).status, "saved");
  const loaded = readStoredSpace(storage, "serenity").space;
  assert.deepEqual(profileFor(loaded), profile);
  assert.deepEqual(parseSpace(JSON.parse(JSON.stringify(loaded)), "serenity"), loaded);
  for (const invalid of [{ ...profile, readingList: "x".repeat(2401) }, { ...profile, allowFeeds: "yes" }, { ...profile, personalized: null }, { ...profile, mutedTopics: "x".repeat(241) }, { ...profile, mutedTopics: 123 }]) {
    assert.equal(saveStoredSpace(storage, loaded, { ...loaded, preferences: { ...loaded.preferences, profile: invalid as typeof profile } }).status, "invalid");
    assert.deepEqual(readStoredSpace(storage, "serenity").space.records, [reflection]);
    assert.deepEqual(profileFor(readStoredSpace(storage, "serenity").space), profile);
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

test("feedback and the preference brief survive reload and backup merge without replacing records or crossing accounts", () => {
  const storage = makeStorage(), current = createEmptySpace("serenity");
  const saved = saveStoredSpace(storage, current, { ...current, records: [reflection],
    feedback: [{ ideaId: "home-open-sing", vote: "more", updatedAt: date }],
    preferences: { ...current.preferences, profile: defaultProfile("serenity") } });
  assert.equal(saved.status, "saved");
  const restored = readStoredSpace(storage, "serenity").space;
  assert.equal(restored.feedback?.[0].vote, "more");
  assert.match(profileFor(restored).preferenceNotes!, /故事和人物/);
  const imported = { ...current, feedback: [
    { ideaId: "home-open-sing", vote: "less" as const, updatedAt: date },
    { ideaId: "home-open-video", vote: "less" as const, updatedAt: date },
  ] };
  const merged = mergeSpaces(restored, imported);
  assert.equal(merged.feedback?.find((item) => item.ideaId === "home-open-sing")?.vote, "more");
  assert.equal(merged.feedback?.length, 2);
  assert.equal(merged.records[0].reflection, reflection.reflection);
  assert.deepEqual(readStoredSpace(storage, "zzz").space.feedback, []);
  assert.equal(parseSpace({ ...restored, feedback: [{ ideaId: "home-open-sing", vote: "bad", updatedAt: date }] }, "serenity"), null);
  assert.equal(parseSpace({ ...restored, feedback: [...restored.feedback!, ...restored.feedback!] }, "serenity"), null);
  assert.equal(readStoredSpace(storage, "serenity").space.records[0].reflection, reflection.reflection);
});
