import assert from "node:assert/strict";
import test from "node:test";
import { sameExperience } from "./activity-affinity.ts";
import { inspirationIdeaId, onlineIdeaId } from "./discovery.ts";
import { fillMissingSuggestions, requestDiscovery, selectDiscoveredSuggestions } from "./discovery-client.ts";
import { DiscoveryBuffer, discoveryScope } from "./discovery-buffer.ts";
import { allExplorationIdeas } from "./ideas.ts";
import { inspectSearchDiscovery } from "./online-discovery.ts";
import { discoverWithProviders } from "./discovery-service.ts";
import { defaultProfile } from "./profile.ts";
import { clearOldRecommendations, cleanupStoredRecommendations, needsRecommendationCleanup, readRecommendationBackup, recommendationBackupKey, restoreRecommendationCache } from "./recommendation-cleanup.ts";
import { knownSpaceIdeas, maxFeedback, suppressionFor } from "./recommendation-policy.ts";
import { feedbackForDiscovery, isRejectedIdea } from "./recommendation-ranking.ts";
import { createEmptySpace, explorationStorageKey, mergeDiscoveredIdeas, mergeSpaces, parseSpace, readStoredSpace, saveStoredSpace } from "./storage.ts";
import { defaultFilters } from "./types.ts";
import type { ExplorationIdea, ExplorationRecord } from "./types.ts";

const before = "2026-10-08T10:00:00.000Z", cleanedAt = "2026-10-09T10:00:00.000Z", after = "2026-10-09T10:01:00.000Z";
const filters = { ...defaultFilters, mode: "home" as const };
const action = (title: string, description: string, form: ExplorationIdea["form"] = "运动"): ExplorationIdea => ({
  id: inspirationIdeaId("home", title), title, description, category: "home", form, approach: "open", domain: "身体与音乐",
  minutes: 12, moods: ["flow"], why: "体验自己的动作。", firstStep: "选一首自己的歌，再开始尝试。", origin: "deepseek", discoveredAt: before,
});
const rejected = action("放一首慢歌，跟着它把肩颈从一天的僵里松出来", "不数次数，不比标准。选一首你熟悉的慢歌，从头到尾只做一件事——跟着音乐晃肩、转颈、抬手，哪里紧就停在哪里多待几秒。");
const rewritten = { ...action("放一首慢歌，跟着它把身体从头到脚松一遍", "不数次数，不跟教程。就选一首你最近循环的歌，让每个动作跟着它的呼吸走。歌放完就结束。", "舞蹈"), discoveredAt: after };
const resource = (title: string, path: string, form: ExplorationIdea["form"] = "观看"): ExplorationIdea => ({
  ...action(title, "打开这个独立作品，选择感兴趣的内容开始。", form), id: onlineIdeaId(`https://example.org/${path}`),
  approach: "specific", domain: "创作", source: { name: "测试作品", url: `https://example.org/${path}` }, discoveredAt: after,
});
const fresh = [resource("看《摄影作品甲》", "photo-a"), resource("唱《歌曲乙》", "song-b", "歌唱"), resource("玩《解谜游戏丙》", "game-c", "游戏")];
const record: ExplorationRecord = { id: "record", ideaId: fresh[2].id, category: "home", title: "自己的记录", reflection: "已经写下的感受", feeling: "ordinary", again: "maybe", date: "2026-10-08", place: "", createdAt: before };
const stored = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("both actual screenshot variants are one rejected action across titles, forms, URLs and reloads", async () => {
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected], feedback: [{ ideaId: rejected.id, vote: "less" as const, updatedAt: before }] };
  assert.equal(sameExperience(rejected, rewritten), true);
  assert.equal(isRejectedIdea(rewritten, space), true);
  const cleaned = parseSpace(clearOldRecommendations(space, cleanedAt), "serenity")!;
  assert.equal(cleaned.discoveredIdeas.length, 0);
  assert.equal(isRejectedIdea(rewritten, cleaned), true);
  assert.equal(isRejectedIdea({ ...rewritten, id: onlineIdeaId("https://example.org/renamed-stretch"), source: { name: "改写来源", url: "https://example.org/renamed-stretch" } }, cleaned), true);
  assert.deepEqual(feedbackForDiscovery(cleaned).lessTitles, [rejected.title]);
  const disabled = { ...cleaned, preferences: { ...cleaned.preferences, profile: { ...defaultProfile("serenity"), personalized: false } } };
  assert.equal(isRejectedIdea(rewritten, disabled), true);
  let sent: Record<string, unknown> = {};
  await requestDiscovery(filters, disabled, new AbortController().signal, async (_url, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  });
  assert.equal(sent.personalization, undefined);
  assert.ok((sent.excludeExperiences as Array<{ title: string }>).some((item) => item.title === rejected.title));
  const payload = { content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.org/background-source" }] },
    { type: "text", text: JSON.stringify({ ideas: [rewritten] }) }] };
  const result = inspectSearchDiscovery(payload, { filters, seed: 1, excludeIds: [], excludeTitles: [], excludeExperiences: [suppressionFor(rejected, "dislike")] });
  assert.equal(result.ideas.length, 0);
  assert.equal(result.issue, "no_new_results");
});

test("rejecting music-led stretching does not ban singing, a specific dance, yoga or watching another work", () => {
  const alternatives = [fresh[1],
    action("跟着音乐跳一段锁舞", "试一下手腕的旋转和突然停住的动作，自己选想跳的片段。", "舞蹈"),
    action("试试瑜伽里的树式平衡", "站在地上，用身体尝试单脚平衡。", "运动"),
    resource("看《身体表演作品丁》", "performance-d")];
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected], feedback: [{ ideaId: rejected.id, vote: "less" as const, updatedAt: before }] };
  assert.ok(alternatives.every((idea) => !sameExperience(rejected, idea) && !isRejectedIdea(idea, space)));
});

test("cleanup preserves favorites, positive votes, records, preferences and account separation", () => {
  const old = fresh.map((idea) => ({ ...idea, discoveredAt: before }));
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [...old, rejected], records: [record],
    preferences: { ...createEmptySpace("serenity").preferences, tone: "#604372", colorSchemes: [{ id: "purple", name: "自己的配色", tone: "#604372" }] },
    favorites: [{ ideaId: old[0].id, soon: true, addedAt: before }],
    feedback: [{ ideaId: old[1].id, vote: "more" as const, updatedAt: before }, { ideaId: rejected.id, vote: "less" as const, updatedAt: before }] };
  const cleaned = clearOldRecommendations(space, cleanedAt);
  assert.deepEqual(cleaned.records, space.records);
  assert.deepEqual(cleaned.preferences, space.preferences);
  assert.deepEqual(cleaned.favorites, space.favorites);
  assert.deepEqual(cleaned.feedback, space.feedback);
  assert.deepEqual(parseSpace(cleaned, "serenity")?.preferences, space.preferences);
  assert.deepEqual(cleaned.discoveredIdeas.map((idea) => idea.id).sort(), old.map((idea) => idea.id).sort());
  assert.equal(isRejectedIdea(old[2], cleaned), true); // record details remain readable, not a recommendation
  assert.equal(isRejectedIdea(rewritten, cleaned), true);
  assert.equal(needsRecommendationCleanup(cleaned), false);
  assert.equal(needsRecommendationCleanup(createEmptySpace("zzz")), false);
  assert.equal(needsRecommendationCleanup(createEmptySpace("serenity")), true);
  const evidence = cleaned.suppressedIdeas!.find((item) => item.id === rejected.id)!;
  assert.equal("firstStep" in evidence, false);
  assert.equal("why" in evidence, false);
  assert.equal(knownSpaceIdeas(cleaned).get(rejected.id)?.title, rejected.title);
});

test("cleanup writes a recoverable first backup before deletion and leaves other storage keys alone", () => {
  const memory = stored(), space = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected] };
  memory.setItem(explorationStorageKey("serenity"), JSON.stringify(space));
  memory.setItem(explorationStorageKey("zzz"), "other-account");
  memory.setItem("beijing-draft", "original-trip");
  const result = cleanupStoredRecommendations(memory, space);
  assert.equal(result.status, "saved");
  assert.equal(result.space.discoveredIdeas.length, 0);
  assert.deepEqual(readRecommendationBackup(memory, "serenity")?.discoveredIdeas, [rejected]);
  const backup = memory.getItem(recommendationBackupKey("serenity"));
  assert.equal(cleanupStoredRecommendations(memory, result.space).status, "saved");
  assert.equal(memory.getItem(recommendationBackupKey("serenity")), backup);
  assert.equal(memory.getItem(explorationStorageKey("zzz")), "other-account");
  assert.equal(memory.getItem("beijing-draft"), "original-trip");
});

test("a failed backup or a newer tab cancels cleanup without erasing the active data", () => {
  const memory = stored(), space = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected] };
  memory.setItem(explorationStorageKey("serenity"), JSON.stringify(space));
  const refused = { getItem: memory.getItem, setItem: (key: string, value: string) => {
    if (key === recommendationBackupKey("serenity")) throw new Error("QuotaExceededError"); memory.setItem(key, value);
  } };
  assert.equal(cleanupStoredRecommendations(refused, space).status, "unavailable");
  assert.equal(memory.getItem(explorationStorageKey("serenity")), JSON.stringify(space));
  assert.equal(saveStoredSpace(memory, space, { ...space, records: [record] }).status, "saved");
  assert.equal(cleanupStoredRecommendations(memory, space).status, "conflict");
  assert.equal(readStoredSpace(memory, "serenity").space.records.length, 1);
  assert.equal(readRecommendationBackup(memory, "serenity"), null);
});

test("strict fresh draws never fill empty rounds with old cache, cleared presets or renamed rejected actions", () => {
  let space = clearOldRecommendations({ ...createEmptySpace("serenity"), discoveredIdeas: [rejected],
    shownIdeaIds: allExplorationIdeas.map((idea) => idea.id) }, cleanedAt);
  assert.deepEqual(selectDiscoveredSuggestions(filters, space, [rejected, rewritten]), []);
  const next = selectDiscoveredSuggestions(filters, space, fresh);
  assert.equal(next.length, 3);
  space = { ...space, discoveredIdeas: mergeDiscoveredIdeas(space, fresh), shownIdeaIds: [...space.shownIdeaIds, ...next.map(({ idea }) => idea.id)] };
  assert.deepEqual(selectDiscoveredSuggestions(filters, space, fresh), []);
  assert.deepEqual(selectDiscoveredSuggestions(filters, space, []), []);
});

test("new named works and unrelated forms stay discoverable after cleanup", () => {
  const space = clearOldRecommendations(createEmptySpace("serenity"), cleanedAt);
  assert.equal(selectDiscoveredSuggestions(filters, space, fresh).length, 3);
  assert.equal(selectDiscoveredSuggestions(filters, space, [{ ...fresh[0], title: "欣赏《摄影作品戊》", id: onlineIdeaId("https://example.org/photo-e"), source: { name: "新摄影作品", url: "https://example.org/photo-e" } }]).length, 1);
});

test("imports cannot revive cleared unliked recommendations; restoring cache preserves newer user changes", () => {
  const backup = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected] };
  const cleaned = clearOldRecommendations(backup, cleanedAt);
  const imported = { ...backup, discoveredIdeas: [...backup.discoveredIdeas, { ...fresh[0], discoveredAt: before }] };
  assert.equal(mergeSpaces(cleaned, imported).discoveredIdeas.length, 0);
  const current = { ...cleaned, records: [record], preferences: { ...cleaned.preferences, tone: "#675293" },
    feedback: [{ ideaId: fresh[1].id, vote: "more" as const, updatedAt: after }],
    suppressedIdeas: [...cleaned.suppressedIdeas!, suppressionFor(fresh[2], "dislike")] };
  const restored = restoreRecommendationCache(current, backup);
  assert.deepEqual(restored.records, current.records);
  assert.deepEqual(restored.preferences, current.preferences);
  assert.deepEqual(restored.feedback, current.feedback);
  assert.deepEqual(restored.favorites, current.favorites);
  assert.deepEqual(restored.suppressedIdeas, [suppressionFor(fresh[2], "dislike")]);
  assert.equal(restored.recommendationCleanup?.active, false);
  assert.equal(needsRecommendationCleanup(restored), false);
  assert.equal(restored.discoveredIdeas.length, 1);
  assert.throws(() => restoreRecommendationCache(current, createEmptySpace("zzz")), /OWNER_MISMATCH/);
});

test("filling a rejected slot keeps the other cards stable and never introduces an alias", () => {
  const base = clearOldRecommendations(createEmptySpace("serenity"), cleanedAt);
  const visible = selectDiscoveredSuggestions(filters, base, [...fresh.slice(0, 2), { ...rejected, discoveredAt: after }]);
  assert.equal(visible.length, 3);
  const space = { ...base, discoveredIdeas: [...fresh.slice(0, 2), { ...rejected, discoveredAt: after }],
    shownIdeaIds: visible.map(({ idea }) => idea.id), feedback: [{ ideaId: rejected.id, vote: "less" as const, updatedAt: after }],
    suppressedIdeas: [...base.suppressedIdeas!, suppressionFor(rejected, "dislike")] };
  const retained = fillMissingSuggestions(filters, space, visible, [rewritten]);
  assert.equal(retained.length, 2);
  assert.deepEqual(retained.map(({ idea }) => idea.id), visible.filter(({ idea }) => idea.id !== rejected.id).map(({ idea }) => idea.id));
  const full = fillMissingSuggestions(filters, space, retained, [rewritten, fresh[2]]);
  assert.equal(full.length, 3);
  assert.deepEqual(full.slice(0, 2), retained);
  assert.equal(full[2].idea.id, fresh[2].id);
});

test("cleanup invalidates an in-flight batch and the buffer rejects returning exclusions", async () => {
  let release!: (result: { ideas: ExplorationIdea[]; provider: "deepseek" }) => void;
  const pending = new Promise<{ ideas: ExplorationIdea[]; provider: "deepseek" }>((resolve) => { release = resolve; });
  const buffer = new DiscoveryBuffer(async () => pending);
  const space = createEmptySpace("serenity"), cleaned = clearOldRecommendations(space, cleanedAt);
  assert.notEqual(discoveryScope(filters, space), discoveryScope(filters, cleaned));
  let delivered = 0;
  buffer.prepare(filters, space, () => { delivered++; }, () => {});
  buffer.clear();
  release({ ideas: fresh, provider: "deepseek" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(delivered, 0);
  const blocked = new DiscoveryBuffer(async () => ({ ideas: [rewritten, ...fresh], provider: "deepseek" }));
  const rejectedSpace = clearOldRecommendations({ ...space, discoveredIdeas: [rejected] }, cleanedAt);
  blocked.prepare(filters, rejectedSpace, () => {}, () => {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(blocked.available(filters, rejectedSpace), 3);
  blocked.clear();
});

test("more than the old 120 feedback entries survive reload and merge without silently forgetting dislikes", () => {
  const feedback = Array.from({ length: 180 }, (_, i) => ({ ideaId: `negative-${i}`, vote: "less" as const, updatedAt: before }));
  const space = { ...createEmptySpace("serenity"), feedback };
  assert.equal(parseSpace(space, "serenity")?.feedback?.length, 180);
  assert.equal(mergeSpaces(space, createEmptySpace("serenity")).feedback?.length, 180);
  const full = { ...space, feedback: Array.from({ length: maxFeedback }, (_, i) => ({ ...feedback[0], ideaId: `negative-${i}` })) };
  const extra = { ...createEmptySpace("serenity"), feedback: [{ ...feedback[0], ideaId: "another-rejection" }] };
  assert.throws(() => mergeSpaces(full, extra), /FEEDBACK_LIMIT_EXCEEDED/);
  assert.equal(full.feedback.length, maxFeedback);
  assert.equal(parseSpace({ ...space, recommendationCleanup: { version: 1, completedAt: "bad", active: true } }, "serenity"), null);
  assert.equal(parseSpace({ ...space, suppressedIdeas: [{ ...suppressionFor(rejected, "dislike"), source: { name: "bad", url: "javascript:alert(1)" } }] }, "serenity"), null);
});

test("a model returning only excluded activities cannot replace them with raw catalog videos", async () => {
  const updates: unknown[] = [];
  const result = await discoverWithProviders({ filters, seed: 1, excludeIds: [], excludeTitles: [],
    excludeExperiences: [suppressionFor(rejected, "dislike")] }, new AbortController().signal, {
    key: "local-test-key", onResult: (result) => updates.push(result), fetcher: async (url) => {
      if (String(url).includes("/anthropic/v1/messages")) return Response.json({ content: [
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.org/background-source" }] },
        { type: "text", text: JSON.stringify({ ideas: [rewritten] }) },
      ] });
      return String(url).includes("api.bilibili.com") ? Response.json({ code: 0, data: { result: [{
        bvid: "BV1y5zdBZE7r", title: "音乐 游戏 绘画 文学 设计 历史 自然 科学 手工 舞蹈 语言 心理 摄影 电影", author: "创作者", duration: "12:00",
      }] } }) : Response.json({});
    },
  });
  assert.equal(result.provider, "none");
  assert.equal(result.issue, "no_new_results");
  assert.equal(result.ideas.length, 0);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], result);
});

test("a later actual cleanup updates its recoverable backup without overwriting it on an empty repeat", () => {
  const memory = stored(), original = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected] };
  memory.setItem(explorationStorageKey("serenity"), JSON.stringify(original));
  const first = cleanupStoredRecommendations(memory, original);
  assert.equal(first.status, "saved");
  const later = saveStoredSpace(memory, first.space, { ...first.space, records: [record], discoveredIdeas: [fresh[0]] });
  assert.equal(later.status, "saved");
  const next = cleanupStoredRecommendations(memory, later.space);
  assert.equal(next.status, "saved");
  assert.deepEqual(readRecommendationBackup(memory, "serenity")?.discoveredIdeas, [fresh[0]]);
  assert.deepEqual(readRecommendationBackup(memory, "serenity")?.records, [record]);
  assert.equal(cleanupStoredRecommendations(memory, next.space).status, "saved");
  assert.deepEqual(readRecommendationBackup(memory, "serenity")?.discoveredIdeas, [fresh[0]]);
});
