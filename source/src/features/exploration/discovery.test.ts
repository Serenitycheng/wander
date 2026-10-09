import assert from "node:assert/strict";
import test from "node:test";
import { activityKind, isFeedIdea, onlineIdeaId, parseDiscoveredIdea, rememberShown, sourceUrl } from "./discovery.ts";
import { discoverPublicIdeas, inspectSearchDiscovery, parseSearchDiscovery } from "./online-discovery.ts";
import { discoverWithProviders } from "./discovery-service.ts";
import { discoveryNoteFor, parseDiscoveryResult } from "./discovery-status.ts";
import { requestDiscovery, selectDiscoveredSuggestions } from "./discovery-client.ts";
import { explorationIdeas } from "./ideas.ts";
import { timeLimits } from "./generator.ts";
import { createEmptySpace, mergeDiscoveredIdeas, mergeSpaces, parseSpace, readStoredSpace, saveStoredSpace } from "./storage.ts";
import { defaultFilters } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";
import { defaultProfile, parsePersonalization, profileFor } from "./profile.ts";
import { discoveryTopics } from "./discovery-topics.ts";

const date = "2026-10-08T10:00:00.000Z";
const ideaFor = (url = "https://example.org/tutorial/one", category: ExplorationIdea["category"] = "home"): ExplorationIdea => ({
  id: onlineIdeaId(url), category, title: "读一篇具体的短篇小说", description: "先读这一篇小说，看看叙事里的变化。",
  minutes: 20, moods: ["curious"], why: "一个具体作品的入口。", firstStep: "打开原文，读第一段。",
  source: { name: "作品原文", url, action: "打开原文" }, domain: "文学", discoveredAt: date,
});
const request = { filters: { ...defaultFilters, mode: "home" as const }, seed: 3, excludeIds: [], excludeTitles: [] };
const feedSpace = () => {
  const space = createEmptySpace("serenity");
  return { ...space, preferences: { ...space.preferences, profile: { ...defaultProfile("serenity"), allowFeeds: true } } };
};

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
  const ideas = await discoverPublicIdeas({ ...request, allowFeeds: true }, new AbortController().signal, fetcher);
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

test("Bilibili results provide verified titles and playable sources while bad entries and failed sources are skipped", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (!String(input).includes("api.bilibili.com")) throw new Error("catalog unavailable");
    return Response.json({ code: 0, data: { result: [
      { bvid: "BV1y5zdBZE7r", title: '<em class="keyword">文学</em> &amp; 地域', author: "创作者", duration: "95:38", description: "一段关于文学的解读" },
      { bvid: "bad", title: "虚构条目", author: "某人" },
    ] } });
  };
  const ideas = await discoverPublicIdeas(request, new AbortController().signal, fetcher);
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].title, "看看《文学 & 地域》");
  assert.equal(ideas[0].source?.url, "https://www.bilibili.com/video/BV1y5zdBZE7r");
  assert.equal(ideas[0].minutes, 25);
  assert.match(ideas[0].description, /95:38/);
  assert.match(ideas[0].description, /开始观看/);
  assert.equal(activityKind(ideas[0]), "观看");
  const blocked = await discoverPublicIdeas(request, new AbortController().signal, async () => Response.json({ code: -412, message: "unavailable" }));
  assert.deepEqual(blocked, []);
});

test("feeds are off by default even when present in model output or an old saved cache", async () => {
  const podcast = { ...ideaFor("https://podcasts.apple.com/cn/podcast/id77"), title: "听一期《历史节目》", domain: "播客" };
  const blog = { ...ideaFor("https://example.org/blog/one"), title: "读一篇新文章", domain: "设计" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [podcast, blog], favorites: [{ ideaId: podcast.id, addedAt: date, soon: false }] };
  const next = selectDiscoveredSuggestions(request.filters, space, [podcast, blog]);
  assert.equal(next.length, 3);
  assert.equal(next.some(({ idea }) => isFeedIdea(idea)), false);
  const content = [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: podcast.source!.url }] }, { type: "text", text: JSON.stringify({ ideas: [podcast] }) }];
  assert.deepEqual(parseSearchDiscovery({ content }, request), []);
  assert.equal(parseSearchDiscovery({ content }, { ...request, allowFeeds: true }).length, 1);
  assert.equal(parseSpace(space, "serenity")?.favorites[0].ideaId, podcast.id);
  const calls: string[] = [];
  await discoverPublicIdeas(request, new AbortController().signal, async (input) => { calls.push(String(input)); return Response.json({}); });
  assert.equal(calls.some((url) => url.includes("itunes.apple.com")), false);
  assert.ok(calls.some((url) => url.includes("api.bilibili.com")));
});

test("personal recommendations use the current account's reading interests and favorites without sending private records", async () => {
  const favorite = ideaFor();
  const empty = createEmptySpace("serenity");
  const space = { ...empty, discoveredIdeas: [favorite], favorites: [{ ideaId: favorite.id, addedAt: date, soon: false }],
    records: [{ id: "private-record", ideaId: null, category: "home" as const, title: "私人记录", reflection: "PRIVATE_REFLECTION", feeling: "" as const, again: "maybe" as const, place: "PRIVATE_PLACE", date: "2026-10-08", createdAt: date }] };
  let sent: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (_input, init) => { sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" }); };
  await requestDiscovery(request.filters, space, new AbortController().signal, fetcher);
  const personalization = parsePersonalization(sent.personalization)!;
  assert.match(personalization.readingList, /边城/);
  assert.match(personalization.interests, /故事与人物/);
  assert.deepEqual(personalization.favoriteTitles, [favorite.title]);
  assert.deepEqual(sent.avoidFormats, ["feed"]);
  assert.equal(JSON.stringify(sent).includes("PRIVATE_"), false);
  assert.equal(JSON.stringify(sent).includes("私人记录"), false);
  const enabled = profileFor(space);
  await requestDiscovery(request.filters, { ...space, preferences: { ...space.preferences, profile: { ...enabled, personalized: false } } }, new AbortController().signal, fetcher);
  assert.equal(sent.personalization, undefined);
  await requestDiscovery(request.filters, createEmptySpace("zzz"), new AbortController().signal, fetcher);
  assert.equal(parsePersonalization(sent.personalization)?.readingList, "");
  assert.deepEqual(parsePersonalization(sent.personalization)?.favoriteTitles, []);

  let prompt: Record<string, unknown> = {};
  const result = await discoverWithProviders({ ...request, personalization }, new AbortController().signal, { key: "test-only", fetcher: async (input, init) => {
    if (!String(input).includes("/anthropic/v1/messages")) return Response.json({});
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.thinking, { type: "disabled" });
    prompt = JSON.parse(payload.messages[0].content);
    return Response.json({ content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: favorite.source!.url }] }, { type: "text", text: JSON.stringify({ ideas: [favorite] }) }] });
  } });
  assert.equal(result.provider, "deepseek");
  assert.deepEqual(prompt.preferences, personalization);
  assert.match(String(prompt.personalizationRule), /陌生领域/);
  const topics = discoveryTopics("home", 3, personalization);
  assert.match(topics[0], /《/);
  assert.equal(topics.slice(1).some((topic) => topic.includes("《")), false);
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
  const next = selectDiscoveredSuggestions(request.filters, feedSpace(), online);
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
  assert.deepEqual(await requestDiscovery(request.filters, space, new AbortController().signal, async () => Response.json({ error: "busy" }, { status: 429 })), { ideas: [], provider: "none", issue: "rate_limited" });
  assert.equal(selectDiscoveredSuggestions(request.filters, space, []).length, 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestDiscovery(request.filters, space, controller.signal, async () => { throw new Error("aborted"); }));
});

test("a large first podcast response cannot push books and recipes out of the discovery limit", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("itunes.apple.com")) return Response.json({ results: Array.from({ length: 30 }, (_, i) => ({
      kind: "podcast", collectionName: `节目${i}`, artistName: `创作者${i}`, collectionViewUrl: `https://podcasts.apple.com/cn/podcast/id${i}`,
    })) });
    if (String(input).includes("openlibrary.org")) return Response.json({ docs: Array.from({ length: 8 }, (_, i) => ({
      key: `/works/OL${i}W`, title: `书名${i}`, author_name: [`作者${i}`],
    })) });
    return Response.json({ meals: Array.from({ length: 8 }, (_, i) => ({ idMeal: `${100 + i}`, strMeal: `菜式${i}` })) });
  };
  let space = feedSpace();
  for (let seed = 3; seed < 9; seed++) {
    const ideas = await discoverPublicIdeas({ ...request, allowFeeds: true, seed, excludeIds: space.shownIdeaIds }, new AbortController().signal, fetcher);
    assert.ok(ideas.length <= 24);
    assert.ok(ideas.some((idea) => idea.domain === "阅读"));
    assert.ok(ideas.some((idea) => idea.domain === "烹饪"));
    const next = selectDiscoveredSuggestions(request.filters, space, ideas);
    assert.equal(next.length, 3);
    assert.ok(next.every(({ idea }) => !space.shownIdeaIds.includes(idea.id)));
    assert.ok(next.filter(({ idea }) => idea.discoveredAt).length >= 2);
    assert.equal(new Set(next.map(({ idea }) => activityKind(idea))).size, 3);
    assert.ok(next.some(({ idea }) => idea.approach === "open"));
    assert.ok(next.some(({ idea }) => idea.approach !== "open"));
    space = { ...space, shownIdeaIds: rememberShown(space.shownIdeaIds, next.map(({ idea }) => idea.id)),
      discoveredIdeas: mergeDiscoveredIdeas(space, ideas) };
  }
});

test("podcasts and blogs share a one-item cap and a two-round break", async () => {
  let space = feedSpace();
  const podcast = { ...ideaFor("https://podcasts.apple.com/cn/podcast/id77"), title: "听一期《历史节目》", domain: "播客" };
  const blog = { ...ideaFor("https://example.org/blog/one"), title: "读一篇设计博客", domain: "博客" };
  const online = [podcast, blog];
  const first = selectDiscoveredSuggestions(request.filters, space, online);
  assert.equal(first.filter(({ idea }) => isFeedIdea(idea)).length, 1);
  space = { ...space, discoveredIdeas: online, shownIdeaIds: first.map(({ idea }) => idea.id) };
  for (let round = 0; round < 2; round++) {
    const next = selectDiscoveredSuggestions(request.filters, space, online);
    assert.equal(next.length, 3);
    assert.equal(next.some(({ idea }) => isFeedIdea(idea)), false);
    space = { ...space, shownIdeaIds: rememberShown(space.shownIdeaIds, next.map(({ idea }) => idea.id)) };
  }
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => { calls.push(String(input)); return Response.json({}); };
  await discoverPublicIdeas({ ...request, avoidFormats: ["feed"] }, new AbortController().signal, fetcher);
  assert.equal(calls.some((url) => url.includes("itunes.apple.com")), false);
  let sent: Record<string, unknown> | undefined;
  const recentSpace = { ...space, shownIdeaIds: [podcast.id] };
  await requestDiscovery(request.filters, recentSpace, new AbortController().signal, async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ ideas: [], provider: "none", issue: "no_new_results" });
  });
  assert.deepEqual(sent?.avoidFormats, ["feed"]);
});

test("unseen online items beat already shown cache items even when their formats overlap", () => {
  const first = ideaFor();
  const second = { ...ideaFor("https://example.org/book/two"), title: "读一本新的旅行随笔" };
  const cached = { ...ideaFor("https://example.org/recipe/old"), title: "做一份蛋糕", domain: "烹饪" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [cached], shownIdeaIds: [...explorationIdeas.map((idea) => idea.id), cached.id] };
  const next = selectDiscoveredSuggestions(request.filters, space, [first, second]);
  assert.ok(next.some(({ idea }) => idea.id === first.id));
  assert.ok(next.some(({ idea }) => idea.id === second.id));
  assert.equal(next.some(({ idea }) => idea.id === cached.id), false);
});

test("login expiry and network errors have distinct feedback while preserving three fallback choices", async () => {
  const space = createEmptySpace("serenity");
  const result = await requestDiscovery(request.filters, space, new AbortController().signal, async () => Response.json({ error: "expired" }, { status: 401 }));
  assert.equal(result.issue, "login_required");
  const next = selectDiscoveredSuggestions(request.filters, space, result.ideas);
  assert.equal(next.length, 3);
  assert.match(discoveryNoteFor(result, next), /重新登录/);
  assert.match(discoveryNoteFor(result, next), /本地灵感 3 个/);
  const failed = await requestDiscovery(request.filters, space, new AbortController().signal, async () => { throw new TypeError("failed"); });
  assert.equal(failed.issue, "network_error");
  assert.equal(parseDiscoveryResult({ ideas: [ideaFor()], provider: "public", issue: "key_rejected" }).provider, "public");
});

test("malformed API success payloads show a parsing issue rather than a quiet local fallback", async () => {
  assert.equal(parseDiscoveryResult({ wrong: [] }).issue, "invalid_response");
  assert.equal(parseDiscoveryResult({ ideas: [{ title: "unverified" }], provider: "deepseek" }).issue, "invalid_response");
  const result = await requestDiscovery(request.filters, createEmptySpace("serenity"), new AbortController().signal,
    async () => new Response("not json", { headers: { "Content-Type": "application/json" } }));
  assert.equal(result.issue, "invalid_response");
});

test("DeepSeek HTTP failures are observable and public-source fallback does not claim model success", async () => {
  for (const [status, issue] of [[401, "key_rejected"], [402, "quota_exceeded"], [400, "request_rejected"], [403, "request_rejected"], [429, "rate_limited"], [503, "provider_unavailable"]] as const) {
    const logs: unknown[] = [];
    const fetcher: typeof fetch = async (input) => String(input).includes("/anthropic/v1/messages")
      ? Response.json({ error: "secret response must not escape" }, { status })
      : String(input).includes("api.bilibili.com") ? Response.json({ code: 0, data: { result: [{
        bvid: "BV1y5zdBZE7r", title: "一个真实视频", author: "创作者", duration: "12:00",
      }] } }) : Response.json({});
    const result = await discoverWithProviders(request, new AbortController().signal, { key: "private-test-key", fetcher, log: (entry) => logs.push(entry) });
    assert.equal(result.provider, "public");
    assert.equal(result.issue, issue);
    assert.ok(result.ideas.length);
    assert.ok(JSON.stringify(logs).includes(`"upstreamStatus":${status}`));
    assert.equal(JSON.stringify(logs).includes("private-test-key"), false);
    assert.equal(JSON.stringify(logs).includes("secret response"), false);
    const next = selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), result.ideas);
    assert.match(discoveryNoteFor(result, next), /公开来源发现/);
    assert.equal(discoveryNoteFor(result, next).includes("DeepSeek 联网发现"), false);
  }
});

test("verified model search, missing search and malformed output remain distinct", async () => {
  const idea = ideaFor();
  const search = { type: "web_search_tool_result", content: [{ type: "web_search_result", url: idea.source!.url }] };
  const payloads = [
    { content: [search, { type: "text", text: JSON.stringify({ ideas: [idea] }) }] },
    { content: [{ type: "text", text: JSON.stringify({ ideas: [idea] }) }] },
    { content: [search, { type: "text", text: "broken" }] },
  ];
  for (const [index, payload] of payloads.entries()) {
    const fetcher: typeof fetch = async (input) => Response.json(String(input).includes("/anthropic/v1/messages") ? payload : {});
    const result = await discoverWithProviders(request, new AbortController().signal, { key: "test", fetcher });
    assert.equal(result.provider, index === 0 ? "deepseek" : "none");
    assert.equal(result.issue, [undefined, "no_search_results", "invalid_response"][index]);
  }
  assert.equal(inspectSearchDiscovery(payloads[0], { ...request, excludeIds: [idea.id] }).issue, "no_new_results");
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
