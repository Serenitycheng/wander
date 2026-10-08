import assert from "node:assert/strict";
import test from "node:test";
import { activityKind, onlineIdeaId, parseDiscoveredIdea, rememberShown, sourceUrl } from "./discovery.ts";
import { discoverPublicIdeas, parseSearchDiscovery } from "./online-discovery.ts";
import { requestDiscovery, selectDiscoveredSuggestions } from "./discovery-client.ts";
import { explorationIdeas } from "./ideas.ts";
import { timeLimits } from "./generator.ts";
import { createEmptySpace, mergeDiscoveredIdeas, mergeSpaces, parseSpace, readStoredSpace, saveStoredSpace } from "./storage.ts";
import { defaultFilters } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";

const date = "2026-10-08T10:00:00.000Z";
const ideaFor = (url = "https://example.org/tutorial/one", category: ExplorationIdea["category"] = "home"): ExplorationIdea => ({
  id: onlineIdeaId(url), category, title: "读一篇具体的短篇小说", description: "先读这一篇小说，看看叙事里的变化。",
  minutes: 20, moods: ["curious"], why: "一个具体作品的入口。", firstStep: "打开原文，读第一段。",
  source: { name: "作品原文", url, action: "打开原文" }, domain: "文学", discoveredAt: date,
});
const request = { filters: { ...defaultFilters, mode: "home" as const }, seed: 3, excludeIds: [], excludeTitles: [] };

test("resource identity survives tracking URLs and changing titles", () => {
  const idea = ideaFor();
  assert.equal(onlineIdeaId(idea.source!.url + "?utm_source=test#hello"), idea.id);
  assert.equal(parseDiscoveredIdea({ ...idea, title: "同一本书的另一种标题" })?.id, idea.id);
  assert.equal(sourceUrl("javascript:alert(1)"), null);
  assert.equal(parseDiscoveredIdea({ ...idea, source: { name: "不安全", url: "https://127.0.0.1/test" } }), null);
});

test("model output without a real search result never becomes online content", () => {
  const idea = ideaFor();
  const content = [{ type: "text", text: JSON.stringify({ ideas: [idea] }) }];
  assert.deepEqual(parseSearchDiscovery({ content }, request), []);
  const result = { type: "web_search_tool_result", content: [{ type: "web_search_result", url: idea.source!.url }] };
  assert.equal(parseSearchDiscovery({ content: [result, ...content] }, request).length, 1);
  assert.deepEqual(parseSearchDiscovery({ content: [result, { type: "text", text: JSON.stringify({ ideas: [ideaFor("https://invented.example/tutorial")] }) }] }, request), []);
  assert.deepEqual(parseSearchDiscovery({ content: [result, ...content] }, { ...request, excludeIds: [idea.id] }), []);
});

test("public APIs supply actual resource names and partial source failures are isolated", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("itunes.apple.com")) return Response.json({ results: [
      { kind: "podcast", collectionName: "真实节目", artistName: "真实作者", collectionViewUrl: "https://podcasts.apple.com/cn/podcast/id123" },
      { kind: "podcast", collectionName: "3-6岁儿童科学故事", artistName: "某作者", collectionViewUrl: "https://podcasts.apple.com/cn/podcast/id124" },
      { kind: "podcast", collectionName: "语言课", primaryGenreName: "儿童教育", artistName: "某作者", collectionViewUrl: "https://podcasts.apple.com/cn/podcast/id125" },
      { kind: "podcast", collectionName: "红黄蓝早教中心语言课", artistName: "某作者", collectionViewUrl: "https://podcasts.apple.com/cn/podcast/id126" },
    ] });
    throw new Error("one source unavailable");
  };
  const ideas = await discoverPublicIdeas(request, new AbortController().signal, fetcher);
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].title, "听一期《真实节目》");
  assert.ok(ideas[0].source?.url.includes("id123"));
});

test("older cached early-childhood audio is skipped without deleting saved content", () => {
  const cached = { ...ideaFor("https://podcasts.apple.com/cn/podcast/id125"), title: "听一期《语言课》", domain: "播客 · 儿童教育" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [cached] };
  const next = selectDiscoveredSuggestions(request.filters, space, []);
  assert.equal(next.length, 3);
  assert.ok(next.every(({ idea }) => idea.id !== cached.id));
  assert.equal(space.discoveredIdeas[0], cached);
});

test("recipe discovery distinguishes preparation time from cooking time", async () => {
  const fetcher: typeof fetch = async () => Response.json({ meals: [{ idMeal: "52772", strMeal: "Teriyaki Chicken", strArea: "Japanese", strIngredient1: "Chicken" }] });
  const ideas = await discoverPublicIdeas({ ...request, filters: { mode: "create", time: "short", mood: "flow" } }, new AbortController().signal, fetcher);
  assert.equal(ideas.length, 1);
  assert.ok(ideas[0].description.includes("不含烹饪"));
  assert.ok(ideas[0].firstStep.includes("Chicken"));
});

test("online discoveries and open activities make a complete round of three", () => {
  const space = createEmptySpace("serenity");
  const online = [ideaFor(), { ...ideaFor("https://example.org/course/two"), title: "听一首具体的爵士作品", domain: "音乐" }, { ...ideaFor("https://example.org/recipe/three"), title: "试做一道烤蔬菜", domain: "烹饪" }];
  const suggestions = selectDiscoveredSuggestions(request.filters, space, online);
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions.filter(({ idea }) => online.some((item) => item.id === idea.id)).length, 2);
  assert.ok(suggestions.some(({ idea }) => idea.approach === "open"));
  const short = selectDiscoveredSuggestions(request.filters, space, [online[0]]);
  assert.equal(short.length, 3);
  assert.equal(short[0].idea.id, online[0].id);
  assert.ok(short.some(({ idea }) => idea.approach === "open"));
});

test("one source format does not crowd out every other kind of activity", () => {
  const online = Array.from({ length: 6 }, (_, i) => ({ ...ideaFor(`https://podcasts.apple.com/cn/podcast/id${i}`), title: `听一期《节目${i}》`, domain: `播客 · ${i}` }));
  const next = selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), online);
  assert.equal(next.length, 3);
  assert.equal(next.filter(({ idea }) => idea.source?.url.includes("podcasts.apple.com")).length, 1);
  assert.equal(new Set(next.map(({ idea }) => activityKind(idea))).size, 3);
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [ideaFor()], shownIdeaIds: [ideaFor().id] };
  const variant = { ...ideaFor("https://another.example/book"), title: ideaFor().title };
  assert.equal(selectDiscoveredSuggestions(request.filters, space, [variant]).some(({ idea }) => idea.id === variant.id), false);
});

test("every filter combination gets three mixed choices even after local content is exhausted", () => {
  const empty = createEmptySpace("serenity");
  for (const mode of ["outside", "home", "learn", "create", "random"] as const) {
    for (const time of ["short", "medium", "half-day", "any"] as const) {
      for (const mood of ["gentle", "curious", "focused", "flow"] as const) {
        const first = selectDiscoveredSuggestions({ mode, time, mood }, empty, []);
        assert.equal(first.length, 3);
        assert.equal(new Set(first.map(({ idea }) => idea.id)).size, 3);
        assert.ok(first.some(({ idea }) => idea.approach === "open"));
        assert.ok(first.some(({ idea }) => idea.approach !== "open"));
        assert.ok(first.every(({ idea }) => mode === "random" || idea.category === mode));
        assert.ok(first.every(({ idea }) => idea.minutes <= timeLimits[time]));
        const next = selectDiscoveredSuggestions({ mode, time, mood }, { ...empty, shownIdeaIds: first.map(({ idea }) => idea.id) }, [], first.map(({ idea }) => idea.id));
        assert.equal(next.length, 3);
        assert.ok(next.every(({ idea }) => !first.some((previous) => previous.idea.id === idea.id)));
        const exhausted = selectDiscoveredSuggestions({ mode, time, mood }, { ...empty, shownIdeaIds: explorationIdeas.map((idea) => idea.id) }, []);
        assert.equal(exhausted.length, 3);
        assert.ok(exhausted.some(({ idea }) => idea.approach === "open"));
        assert.ok(exhausted.some(({ idea }) => idea.approach !== "open"));
      }
    }
  }
});

test("an online open direction is retained alongside specific choices", () => {
  const open = { ...ideaFor(), title: "读一本陌生领域的书", approach: "open" as const };
  const next = selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), [open]);
  assert.equal(next.length, 3);
  assert.ok(next.some(({ idea }) => idea.id === open.id));
  assert.ok(next.some(({ idea }) => idea.approach !== "open"));
});

test("open discovery metadata survives a backup while invalid metadata is rejected", () => {
  const open = { ...ideaFor(), approach: "open" as const };
  assert.equal(parseDiscoveredIdea(open)?.approach, "open");
  assert.equal(parseSpace({ ...createEmptySpace("serenity"), discoveredIdeas: [open] }, "serenity")?.discoveredIdeas[0].approach, "open");
  assert.equal(parseDiscoveredIdea({ ...open, approach: "anything" }), null);
  assert.ok(parseDiscoveredIdea(ideaFor()));
});

test("failed online requests fall back; cancellation cannot become a new draw", async () => {
  const space = createEmptySpace("serenity");
  assert.deepEqual(await requestDiscovery(request.filters, space, new AbortController().signal, async () => Response.json({ error: "busy" }, { status: 429 })), []);
  assert.equal(selectDiscoveredSuggestions(request.filters, space, []).length, 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestDiscovery(request.filters, space, controller.signal, async () => { throw new Error("aborted"); }));
});

test("history and online snapshots restore favorites, records and details after reload", () => {
  const idea = ideaFor();
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const space = createEmptySpace("serenity");
  const next = { ...space, shownIdeaIds: [idea.id], discoveredIdeas: [idea], favorites: [{ ideaId: idea.id, addedAt: date, soon: true }] };
  assert.equal(saveStoredSpace(storage, space, next).status, "saved");
  const loaded = readStoredSpace(storage, "serenity").space;
  assert.equal(loaded.discoveredIdeas[0].firstStep, idea.firstStep);
  assert.equal(loaded.favorites[0].ideaId, idea.id);
  assert.equal(selectDiscoveredSuggestions(request.filters, loaded, [idea]).some((suggestion) => suggestion.idea.id === idea.id), false);
  assert.deepEqual(parseSpace(JSON.parse(JSON.stringify(loaded)), "serenity")?.shownIdeaIds, [idea.id]);
  assert.deepEqual(readStoredSpace(storage, "zzz").space.discoveredIdeas, []);
  const legacy = JSON.parse(JSON.stringify(space)); delete legacy.shownIdeaIds; delete legacy.discoveredIdeas;
  assert.deepEqual(parseSpace(legacy, "serenity")?.shownIdeaIds, []);
});

test("cache eviction and backup merge retain every favorited online snapshot", () => {
  const space = createEmptySpace("serenity");
  const ideas = Array.from({ length: 260 }, (_, i) => ideaFor(`https://example.org/${i}`));
  const imported = { ...space, discoveredIdeas: ideas, favorites: [{ ideaId: ideas[259].id, addedAt: date, soon: false }] };
  const merged = mergeSpaces(space, imported);
  assert.equal(merged.discoveredIdeas.length, 241);
  assert.ok(merged.discoveredIdeas.some((idea) => idea.id === ideas[259].id));
  const pinned = { ...space, discoveredIdeas: [ideas[0]], records: [{ id: "record", ideaId: ideas[0].id, category: "home" as const, title: "保存过的作品", feeling: "" as const, reflection: "", again: "yes" as const, date: "", place: "", createdAt: date }] };
  assert.ok(mergeDiscoveredIdeas(pinned, ideas.slice(1)).some((idea) => idea.id === ideas[0].id));
  assert.equal(mergeDiscoveredIdeas(pinned, [{ ...ideas[0], title: "另一个标题" }])[0].title, ideas[0].title);
});

test("history is bounded and malformed discoveries preserve the stored space", () => {
  assert.equal(rememberShown(Array.from({ length: 600 }, (_, i) => `id-${i}`), ["new"]).length, 600);
  assert.deepEqual(rememberShown(["a", "b", "c"], ["a", "d"]), ["b", "c", "a", "d"]);
  const space = createEmptySpace("serenity");
  assert.equal(parseSpace({ ...space, discoveredIdeas: [{ ...ideaFor(), source: { name: "fake", url: "javascript:alert(1)" } }] }, "serenity"), null);
});
