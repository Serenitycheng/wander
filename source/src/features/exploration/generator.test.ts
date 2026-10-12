import assert from "node:assert/strict";
import test from "node:test";
import { allExplorationIdeas, explorationIdeas, findIdea } from "./ideas.ts";
import {
  generateSuggestions,
  normalizeFilters,
  reasonsFor,
} from "./generator.ts";
import { defaultFilters } from "./types.ts";

test("every mode has enough immediate beginnings for a short free moment", () => {
  for (const mode of ["outside", "home", "learn", "create"] as const) {
    const suggestions = generateSuggestions({
      mode,
      time: "short",
      mood: "gentle",
    });
    assert.equal(suggestions.length, 3);
    assert.ok(
      suggestions.every(
        ({ idea }) => idea.category === mode && idea.minutes <= 30,
      ),
    );
    assert.equal(new Set(suggestions.map(({ idea }) => idea.id)).size, 3);
  }
});
test("available time remains a hard condition for every mode and mood", () => {
  for (const mode of [
    "outside",
    "home",
    "learn",
    "create",
    "random",
  ] as const) {
    for (const mood of ["gentle", "curious", "focused", "flow"] as const) {
      assert.ok(
        generateSuggestions({ mode, time: "short", mood }).every(
          ({ idea }) => idea.minutes <= 30,
        ),
      );
    }
  }
});
test("complete randomness opens three distinct directions", () => {
  const suggestions = generateSuggestions(defaultFilters, {
    random: () => 0.4,
  });
  assert.equal(suggestions.length, 3);
  assert.equal(new Set(suggestions.map(({ idea }) => idea.category)).size, 3);
});
test("changing a round avoids the previous suggestions when alternatives exist", () => {
  const first = generateSuggestions(
    { mode: "home", time: "short" },
    { random: () => 0.4 },
  );
  const previousIds = first.map(({ idea }) => idea.id);
  const next = generateSuggestions(
    { mode: "home", time: "short" },
    { previousIds, random: () => 0.4 },
  );
  assert.equal(next.length, 3);
  assert.ok(next.every(({ idea }) => !previousIds.includes(idea.id)));
});
test("a sparse pool returns only real suggestions without inventing filler", () => {
  const suggestions = generateSuggestions(
    { mode: "outside" },
    {
      ideas: explorationIdeas.slice(0, 1),
      previousIds: [explorationIdeas[0].id],
    },
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].idea.id, explorationIdeas[0].id);
  assert.deepEqual(generateSuggestions({ mode: "create" }, { ideas: [] }), []);
});
test("mood preference favors gentle beginnings without crossing the selected mode", () => {
  const suggestions = generateSuggestions(
    { mode: "home", mood: "gentle" },
    { random: () => 0 },
  );
  assert.ok(
    suggestions.every(
      ({ idea }) => idea.category === "home" && idea.moods.includes("gentle"),
    ),
  );
});
test("invalid filters fall back safely and the content library is not mutated", () => {
  const before = JSON.stringify(explorationIdeas);
  assert.deepEqual(
    normalizeFilters({ mode: "unknown" as "random", time: "other" as "any" }),
    defaultFilters,
  );
  generateSuggestions(defaultFilters, { random: () => 0.9 });
  assert.equal(JSON.stringify(explorationIdeas), before);
  assert.equal(
    new Set(explorationIdeas.map((item) => item.id)).size,
    explorationIdeas.length,
  );
});
test("a saved longer idea does not falsely claim to fit a short time window", () => {
  const idea = explorationIdeas.find((item) => item.id === "outside-798")!;
  const reasons = reasonsFor(idea);
  assert.ok(reasons.every((reason) => !reason.includes("10～30 分钟")));
});

test("retired recommendations remain readable for saved favorites and records", () => {
  const activeIds = new Set(explorationIdeas.map((item) => item.id));
  const retired = allExplorationIdeas.filter((item) => !activeIds.has(item.id));
  assert.ok(retired.length > 0);
  for (const item of retired) {
    assert.equal(findIdea(item.id), item);
  }
  assert.equal(
    new Set(allExplorationIdeas.map((item) => item.id)).size,
    allExplorationIdeas.length,
  );
  assert.ok(findIdea("home-photo-theme"));
  assert.ok(!activeIds.has("home-photo-theme"));
  assert.ok(findIdea("home-museum"));
  assert.ok(!activeIds.has("home-museum"));
});

test("unseen ideas win over mood-matched repeats across many rounds", () => {
  let shownIds: string[] = [];
  const eligible = explorationIdeas.filter((idea) => idea.category === "home");
  const seen = new Set<string>();
  while (seen.size < eligible.length) {
    const suggestions = generateSuggestions({ mode: "home", mood: "gentle" }, { shownIds, random: () => 0 });
    const unseen = suggestions.filter(({ idea }) => !seen.has(idea.id));
    assert.equal(unseen.length, Math.min(3, eligible.length - seen.size));
    for (const { idea } of suggestions) { seen.add(idea.id); shownIds = [...shownIds.filter((id) => id !== idea.id), idea.id]; }
  }
  const next = generateSuggestions({ mode: "home", mood: "gentle" }, { shownIds, random: () => 0 });
  assert.ok(next.every(({ idea }) => !shownIds.slice(-3).includes(idea.id)));
});

test("a small remaining pool retains every fresh item and minimizes overlap", () => {
  const ideas = explorationIdeas.filter((idea) => idea.category === "home").slice(0, 4);
  const shownIds = ideas.slice(0, 3).map((idea) => idea.id);
  const next = generateSuggestions({ mode: "home" }, { ideas, shownIds, previousIds: shownIds });
  assert.equal(next.length, 3);
  assert.ok(next.some(({ idea }) => idea.id === ideas[3].id));
  assert.equal(next.filter(({ idea }) => shownIds.includes(idea.id)).length, 2);
});
