import assert from "node:assert/strict";
import test from "node:test";
import { activityKind, isFeedIdea, isLowQualityVideo, inspirationIdeaId, onlineIdeaId, parseDiscoveredIdea, rememberShown, sourceUrl } from "./discovery.ts";
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
import { namedWorkKeys, resourceId, resourceKey, sameExperience } from "./activity-affinity.ts";
import { workHistory } from "./work-history.ts";
import { interestBookSubjects } from "./interest-discovery.ts";
import { discoveryDirections, discoveryTopics } from "./discovery-topics.ts";
import { DiscoveryBuffer, discoveryScope } from "./discovery-buffer.ts";
import type { DiscoveryResult } from "./discovery-status.ts";
import { feedbackForDiscovery, isRejectedIdea, recentActivitiesForDiscovery, recommendationScore } from "./recommendation-ranking.ts";
import { activityDomain, hasUsableEntry, isHandsOn, isMutedContent } from "./activity-diversity.ts";

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

test("fields rotate in search and a reading list does not turn every discovery into a book review", () => {
  const profile = { ...defaultProfile("serenity"), favoriteTitles: [] };
  const seenQueries: string[] = [];
  for (let seed = 0; seed < 32; seed++) {
    const directions = discoveryDirections("home", seed, profile);
    assert.equal(directions.length, 3);
    assert.equal(directions.some((item) => /天文|宇宙|月球/.test(item.query)), false);
    seenQueries.push(...directions.map((item) => item.query));
  }
  assert.ok(seenQueries.filter((query) => query.includes("《")).length <= 8);
  assert.ok(new Set(Array.from({ length: 32 }, (_, seed) => discoveryDirections("home", seed, profile)).flat().map((item) => item.domain)).size >= 9);
  const recent = ["文学", "饮食", "历史"].map((domain) => ({ domain, form: "观看" }));
  for (let seed = 0; seed < 8; seed++) assert.ok(discoveryDirections("home", seed, profile, recent).every((item) => !recent.some((past) => past.domain === item.domain)));
});

test("named films and live performances remain watching tasks even without generic video words", () => {
  const documentary = explorationIdeas.find((idea) => idea.id === "home-hexi-corridor")!;
  assert.equal(activityKind(documentary), "观看");
  assert.equal(activityDomain(documentary), "历史");
  assert.equal(activityKind({ ...ideaFor(), title: "看一场爵士现场演出" }), "观看");
  assert.equal(activityKind({ ...ideaFor(), title: "读一篇音乐家的传记" }), "阅读");
  assert.equal(isHandsOn(explorationIdeas.find((idea) => idea.id === "learn-map-story")!), false);
  assert.equal(activityKind(explorationIdeas.find((idea) => idea.id === "learn-caesar-cipher")!), "书写");
});

test("a stream of fresh books, recipes and documentaries cannot trap repeated rounds in those three forms", () => {
  let space = createEmptySpace("serenity");
  const forms = new Set<string>(), domains = new Set<string>();
  for (let round = 0; round < 12; round++) {
    const online = Array.from({ length: 9 }, (_, i) => ({
      ...ideaFor(`https://example.org/round/${round}/${i}`),
      title: i % 3 === 0 ? `读一篇新小说${round}-${i}` : i % 3 === 1 ? `看一部历史纪录片${round}-${i}` : `试做一道新菜${round}-${i}`,
      domain: i % 3 === 0 ? "文学" : i % 3 === 1 ? "历史" : "烹饪",
      form: i % 3 === 0 ? "阅读" as const : i % 3 === 1 ? "观看" as const : "烹饪" as const,
    }));
    const next = selectDiscoveredSuggestions(request.filters, space, online, [], { random: () => 0.5 });
    assert.equal(next.length, 3);
    // New content wins when open or hands-on choices have already been exhausted.
    assert.ok(next.every(({ idea }) => !space.shownIdeaIds.includes(idea.id)));
    assert.ok(next.every(({ idea }) => !space.shownIdeaIds.slice(-3).includes(idea.id)));
    next.forEach(({ idea }) => { forms.add(activityKind(idea)); domains.add(activityDomain(idea)); });
    space = { ...space, discoveredIdeas: mergeDiscoveredIdeas(space, online), shownIdeaIds: rememberShown(space.shownIdeaIds, next.map(({ idea }) => idea.id)) };
  }
  assert.ok(forms.size >= 6, `only ${[...forms]} were offered`);
  assert.ok(domains.size >= 6, `only ${[...domains]} were offered`);
});

test("muted fields apply to old cache and model results, preserve saved data and can be cleared", () => {
  const astronomy = { ...ideaFor("https://example.org/science/black-holes"), title: "看看黑洞怎样形成", domain: "天文", form: "观看" as const };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [astronomy], favorites: [{ ideaId: astronomy.id, addedAt: date, soon: false }] };
  assert.equal(isRejectedIdea(astronomy, space), true);
  assert.equal(selectDiscoveredSuggestions(request.filters, space, [astronomy]).some(({ idea }) => idea.id === astronomy.id), false);
  assert.equal(parseSpace(space, "serenity")?.favorites[0].ideaId, astronomy.id);
  assert.equal(isMutedContent({ title: "看看宇宙有多大", description: "", domain: "视频" }, "天文"), true);
  assert.equal(isMutedContent({ title: "画一张宇宙主题的封面", description: "画自己想画的", domain: "设计" }, "天文"), false);
  const allowed = { ...space, preferences: { ...space.preferences, profile: { ...defaultProfile("serenity"), mutedTopics: "" } } };
  assert.equal(isRejectedIdea(astronomy, allowed), false);
  assert.equal(profileFor(parseSpace(allowed, "serenity")!).mutedTopics, "");
  assert.equal(profileFor(createEmptySpace("zzz")).mutedTopics, "");
  const payload = { content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: astronomy.source!.url }] }, { type: "text", text: JSON.stringify({ ideas: [astronomy] }) }] };
  assert.deepEqual(parseSearchDiscovery(payload, { ...request, personalization: { ...defaultProfile("serenity"), favoriteTitles: [] } }), []);
});

test("open directions need a usable entry, and a tutorial is not automatically just watching", async () => {
  const vague = { ...ideaFor(), title: "接触一下配音", approach: "open" as const, firstStep: "搜索相关资料。" };
  assert.equal(hasUsableEntry(vague), false);
  assert.equal(selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), [vague]).some(({ idea }) => idea.id === vague.id), false);
  const seed = Array.from({ length: 32 }, (_, i) => i).find((value) => discoveryDirections("home", value).some((direction) => direction.practice))!;
  let count = 0;
  const fetcher: typeof fetch = async (input) => {
    if (!String(input).includes("api.bilibili.com")) return Response.json({});
    const keyword = new URL(String(input)).searchParams.get("keyword")!;
    return Response.json({ code: 0, data: { result: [{ bvid: `BV${String(++count).padStart(10, "0")}`, title: keyword, description: keyword, author: "测试创作者", duration: "10:00" }] } });
  };
  const ideas = await discoverPublicIdeas({ ...request, seed }, new AbortController().signal, fetcher);
  assert.ok(ideas.some((idea) => idea.form !== "观看"));
  assert.ok(ideas.filter((idea) => idea.form !== "观看").every((idea) => idea.firstStep.startsWith("打开参考视频，") && idea.source?.url.includes("bilibili.com/video/")));
  const unrelated = await discoverPublicIdeas({ ...request, seed }, new AbortController().signal, async (input) => String(input).includes("api.bilibili.com")
    ? Response.json({ code: 0, data: { result: [{ bvid: "BV0000000001", title: "一段普通访谈", author: "测试创作者", duration: "10:00" }] } }) : Response.json({}));
  assert.ok(unrelated.every((idea) => idea.form === "观看"));
  const musicSeed = Array.from({ length: 64 }, (_, i) => i).find((value) => discoveryDirections("home", value).some((direction) => direction.form === "音乐创作"))!;
  const interview = await discoverPublicIdeas({ ...request, seed: musicSeed }, new AbortController().signal, async (input) => String(input).includes("api.bilibili.com")
    ? Response.json({ code: 0, data: { result: [{ bvid: "BV0000000001", title: "音乐与日常生活的关系：一段访谈", author: "测试创作者", duration: "10:00" }] } }) : Response.json({}));
  assert.ok(interview.length > 0);
  assert.ok(interview.every((idea) => idea.form === "观看"));
});

test("book and recipe catalogs are occasional sources instead of a mandatory pair on every request", async () => {
  let books = 0, recipes = 0;
  for (let seed = 0; seed < 24; seed++) {
    await discoverPublicIdeas({ ...request, seed }, new AbortController().signal, async (input) => {
      if (String(input).includes("openlibrary.org")) books++;
      if (String(input).includes("themealdb.com")) recipes++;
      return Response.json({});
    });
  }
  assert.ok(books > 0 && books < 24);
  assert.ok(recipes > 0 && recipes < 24);
});

test("the same resource cannot reappear under a new title or an online alias of a local tool", () => {
  const local = explorationIdeas.find((idea) => idea.id === "learn-song-maker")!;
  const online = { ...ideaFor(local.source!.url), category: "learn" as const, title: "用另一个标题试音乐工具", form: "音乐创作" as const };
  const space = { ...createEmptySpace("serenity"), shownIdeaIds: [local.id] };
  assert.equal(selectDiscoveredSuggestions({ ...request.filters, mode: "learn" }, space, [online]).some(({ idea }) => idea.id === online.id), false);
  assert.equal(parseDiscoveredIdea({ ...online, form: "anything" }), null);
  assert.equal(parseDiscoveredIdea(online)?.form, "音乐创作");
  assert.deepEqual(recentActivitiesForDiscovery(space), [{ form: "音乐创作", domain: "音乐", title: local.title, approach: local.approach ?? "specific" }]);
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
  const ideas = await discoverPublicIdeas({ ...request, seed: 0, filters: { mode: "create", time: "short", mood: "flow" } }, new AbortController().signal, fetcher);
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
      { bvid: "BV1yM4JeWERC", title: "这才是成年人看的片，过不了审！", author: "营销号" },
    ] } });
  };
  const ideas = await discoverPublicIdeas({ ...request, personalization: { ...defaultProfile("serenity"), favoriteTitles: [] } }, new AbortController().signal, fetcher);
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

test("sensational video packaging is skipped in cache recommendations without removing saved snapshots", () => {
  const old = { ...ideaFor("https://www.bilibili.com/video/BV1yM4JeWERC"), title: "这才是成年人看的片，过不了审！" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [old], favorites: [{ ideaId: old.id, addedAt: date, soon: false }] };
  assert.equal(isLowQualityVideo(old), true);
  assert.equal(isLowQualityVideo({ title: "关于一场历史事件的纪录片", source: old.source }), false);
  assert.equal(selectDiscoveredSuggestions(request.filters, space, []).some(({ idea }) => idea.id === old.id), false);
  assert.equal(parseSpace(space, "serenity")?.discoveredIdeas[0].id, old.id);
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
  assert.match(String(prompt.personalizationRule), /陌生体验/);
  const topics = discoveryTopics("home", 3, personalization);
  assert.equal(topics.some((topic) => topic.includes("《")), false);
});

test("online discoveries and open activities make a complete round of three", () => {
  const space = createEmptySpace("serenity");
  const online = [ideaFor(), { ...ideaFor("https://example.org/course/two"), title: "听一首具体的爵士作品", domain: "音乐" }, { ...ideaFor("https://example.org/recipe/three"), title: "试做一道烤蔬菜", domain: "烹饪" }];
  const suggestions = selectDiscoveredSuggestions(request.filters, space, online);
  assert.equal(suggestions.length, 3);
  assert.ok(suggestions.some(({ idea }) => online.some((item) => item.id === idea.id)));
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

test("a large first podcast response cannot hide other selected sources in the discovery limit", async () => {
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
  for (const seed of [0, 12, 24]) {
    const ideas = await discoverPublicIdeas({ ...request, allowFeeds: true, seed, excludeIds: space.shownIdeaIds }, new AbortController().signal, fetcher);
    assert.ok(ideas.length <= 24);
    assert.ok(ideas.some((idea) => idea.domain === "阅读"));
    assert.ok(ideas.some((idea) => idea.domain === "烹饪"));
    const next = selectDiscoveredSuggestions(request.filters, space, ideas);
    assert.equal(next.length, 3);
    assert.ok(next.every(({ idea }) => !space.shownIdeaIds.includes(idea.id)));
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

test("DeepSeek HTTP failures stay observable without publishing uncurated public search hits", async () => {
  for (const [status, issue] of [[401, "key_rejected"], [402, "quota_exceeded"], [400, "request_rejected"], [403, "request_rejected"], [429, "rate_limited"], [503, "provider_unavailable"]] as const) {
    const logs: unknown[] = [];
    const fetcher: typeof fetch = async (input) => String(input).includes("/anthropic/v1/messages")
      ? Response.json({ error: "secret response must not escape" }, { status })
      : String(input).includes("api.bilibili.com") ? Response.json({ code: 0, data: { result: [{
        bvid: "BV1y5zdBZE7r", title: "音乐 游戏 绘画 文学 设计 历史 自然 科学 手工 舞蹈 语言 心理 摄影 电影", author: "创作者", duration: "12:00",
      }] } }) : Response.json({});
    const result = await discoverWithProviders(request, new AbortController().signal, { key: "private-test-key", fetcher, log: (entry) => logs.push(entry) });
    assert.equal(result.provider, "none");
    assert.equal(result.issue, issue);
    assert.equal(result.ideas.length, 0);
    assert.ok(JSON.stringify(logs).includes(`"upstreamStatus":${status}`));
    assert.equal(JSON.stringify(logs).includes("private-test-key"), false);
    assert.equal(JSON.stringify(logs).includes("secret response"), false);
    const next = selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), result.ideas);
    assert.equal(discoveryNoteFor(result, next).includes("公开来源发现"), false);
    assert.equal(discoveryNoteFor(result, next).includes("DeepSeek 推荐"), false);
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

test("the editable preference brief upgrades old profiles without overwriting custom tastes or leaking to another account", () => {
  const space = createEmptySpace("serenity");
  const saved = { ...defaultProfile("serenity"), interests: "我自己的偏好" };
  delete saved.preferenceNotes;
  const upgraded = profileFor({ ...space, preferences: { ...space.preferences, profile: saved } });
  assert.equal(upgraded.interests, "我自己的偏好");
  assert.match(upgraded.preferenceNotes!, /故事和人物/);
  assert.match(upgraded.preferenceNotes!, /纯|审美/);
  assert.match(upgraded.preferenceNotes!, /唱一首歌/);
  assert.match(upgraded.preferenceNotes!, /陌生领域/);
  assert.equal(profileFor(createEmptySpace("zzz")).preferenceNotes, "");
  assert.equal(profileFor({ ...space, preferences: { ...space.preferences, profile: { ...saved, preferenceNotes: "" } } }).preferenceNotes, "");
  assert.equal(parsePersonalization({ interests: "", readingList: "", favoriteTitles: [], preferenceNotes: "x".repeat(2001) }), null);
});

test("feedback excludes rejected resources and their renamed copies, while positive feedback affects the next draw and request", async () => {
  const rejected = ideaFor("https://example.org/fiction/rejected");
  const liked = { ...ideaFor("https://example.org/music/live"), title: "唱一首现场听到的歌", domain: "唱歌", description: "跟着旋律唱起来。" };
  const alternative = { ...ideaFor("https://example.org/music/other"), title: "唱一首新的歌", domain: "唱歌", description: "试试另一段旋律。" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [rejected, liked], feedback: [
    { ideaId: rejected.id, vote: "less" as const, updatedAt: date },
    { ideaId: liked.id, vote: "more" as const, updatedAt: date },
  ] };
  const copy = { ...rejected, id: onlineIdeaId("https://example.org/fiction/copy"), source: { name: "另一个来源", url: "https://example.org/fiction/copy" } };
  const next = selectDiscoveredSuggestions(request.filters, space, [rejected, copy, alternative]);
  assert.equal(next.length, 3);
  assert.equal(next.some(({ idea }) => [rejected.id, copy.id].includes(idea.id)), false);
  assert.ok(recommendationScore(alternative, space) > recommendationScore(alternative, createEmptySpace("serenity")));
  const feedback = feedbackForDiscovery(space);
  assert.deepEqual(feedback.lessTitles, [rejected.title]);
  assert.ok(feedback.moreKinds.includes("歌唱 · 音乐"));
  let sent: Record<string, unknown> = {};
  await requestDiscovery(request.filters, space, new AbortController().signal, async (_input, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  });
  assert.ok((sent.excludeIds as string[]).includes(rejected.id));
  assert.deepEqual(parsePersonalization(sent.personalization)?.feedback, feedback);
  assert.match(parsePersonalization(sent.personalization)!.preferenceNotes!, /不喜欢/);
});

test("NDJSON discovery exposes public choices before completion and handles split UTF-8 without losing model candidates", async () => {
  const first = ideaFor(), second = { ...ideaFor("https://example.org/second"), title: "看看另一部作品" };
  const encoder = new TextEncoder();
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let arrived!: () => void;
  const received = new Promise<void>((resolve) => { arrived = resolve; });
  const stream = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
  const updates: DiscoveryResult[] = [];
  let completed = false;
  const resultPromise = requestDiscovery(request.filters, createEmptySpace("serenity"), new AbortController().signal,
    async () => new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }), (result) => { updates.push(result); arrived(); })
    .then((result) => { completed = true; return result; });
  const bytes = encoder.encode(JSON.stringify({ ideas: [first], provider: "public" }) + "\n");
  output.enqueue(bytes.slice(0, 83)); output.enqueue(bytes.slice(83));
  await received;
  assert.equal(completed, false);
  assert.equal(updates[0].ideas[0].title, first.title);
  output.enqueue(encoder.encode(JSON.stringify({ ideas: [second], provider: "deepseek" }) + "\n"));
  output.close();
  const result = await resultPromise;
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].id, second.id);
  assert.equal(result.provider, "deepseek");
});

test("configured model screens public candidates before publishing, and receives actual metadata", async () => {
  let releaseModel!: (value: Response) => void, modelReady!: () => void;
  const early = new Promise<void>((resolve) => { modelReady = resolve; });
  const heldModel = new Promise<Response>((resolve) => { releaseModel = resolve; });
  const updates: DiscoveryResult[] = [];
  let sent: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("/anthropic/v1/messages")) { sent = JSON.parse(String(init?.body)); modelReady(); return heldModel; }
    return String(input).includes("api.bilibili.com") ? Response.json({ code: 0, data: { result: [{ bvid: "BV1y5zdBZE7r", title: "真实文学视频", author: "创作者", duration: "12:00" }] } }) : Response.json({});
  };
  let completed = false;
  const pending = discoverWithProviders({ ...request, personalization: { ...defaultProfile("serenity"), favoriteTitles: [] } }, new AbortController().signal, { key: "test", fetcher,
    onResult: (result) => { updates.push(result);  } }).then((result) => { completed = true; return result; });
  await early;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(updates.length, 0);
  const message = JSON.parse((sent.messages as Array<{ content: string }>)[0].content);
  assert.equal(message.catalogCandidates[0].title, "看看《真实文学视频》");
  assert.match(message.request, /9 个/);
  assert.match(message.preferences.interests, /故事与人物/);
  assert.match(message.preferences.readingList, /边城/);
  assert.match(message.preferences.preferenceNotes, /故事和人物/);
  assert.match(message.fitRule, /具体、可信的连接/);
  assert.match(message.personalizationRule, /至少一半/);
  const idea = ideaFor();
  releaseModel(Response.json({ content: [
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: idea.source!.url }] },
    { type: "text", text: JSON.stringify({ ideas: [idea] }) },
  ] }));
  assert.equal((await pending).provider, "deepseek");
  assert.equal(updates.at(-1)?.provider, "deepseek");
});

test("model recommendations may use catalog-verified resources without repeating the search", () => {
  const catalog = ideaFor("https://example.org/catalog");
  const text = { type: "text", text: JSON.stringify({ ideas: [{ ...catalog, angle: "play" }] }) };
  const search = { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.org/other" }] };
  assert.equal(inspectSearchDiscovery({ content: [search, text] }, request, [catalog]).ideas[0].angle, "play");
  assert.equal(inspectSearchDiscovery({ content: [text] }, request, [catalog]).ideas.length, 1);
  assert.equal(inspectSearchDiscovery({ content: [search, text] }, request).ideas.length, 0);
  assert.equal(parseDiscoveredIdea({ ...catalog, angle: "invented" }), null);
});

test("prepared choices mix actionable forms and open directions without requiring fixed angle slots", () => {
  const ideas: ExplorationIdea[] = [
    { ...ideaFor("https://example.org/story"), title: "读一篇从渡船讲起的故事", angle: "familiar" },
    { ...ideaFor("https://example.org/music"), title: "听听一场陌生风格的现场音乐", description: "可以自己选一场感兴趣的现场。", domain: "音乐", angle: "surprise", approach: "open" },
    { ...ideaFor("https://example.org/game"), title: "玩一局需要猜词的游戏", domain: "游戏", angle: "play", approach: "open" },
  ];
  const next = selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), ideas);
  assert.equal(next.length, 3);
  assert.ok(next.some(({ idea }) => isHandsOn(idea)));
  assert.ok(next.every(({ idea }) => hasUsableEntry(idea)));
  assert.equal(new Set(next.map(({ idea }) => activityKind(idea))).size, 3);
  assert.ok(next.some(({ idea }) => idea.approach === "open"));
  assert.ok(next.some(({ idea }) => idea.approach !== "open"));
});

test("one preparation serves repeated clicks, counts only unseen choices and refills only when needed", async () => {
  let calls = 0, complete!: (result: DiscoveryResult) => void;
  const ideas = Array.from({ length: 9 }, (_, index) => ({ ...ideaFor(`https://example.org/prepared/${index}`), title: `读《新的作品 ${index}》` }));
  const load: typeof requestDiscovery = async (_filters, _space, _signal, _fetcher, onResult) => {
    calls++; onResult?.({ ideas, provider: "public" });
    return new Promise<DiscoveryResult>((resolve) => { complete = resolve; });
  };
  let clock = 100000;
  const buffer = new DiscoveryBuffer(load, () => clock), space = createEmptySpace("serenity");
  assert.equal(buffer.prepare(request.filters, space, () => {}, () => {}), true);
  const first = selectDiscoveredSuggestions(request.filters, space, buffer.peek(request.filters, space).ideas);
  const nextSpace = { ...space, shownIdeaIds: first.map(({ idea }) => idea.id), discoveredIdeas: ideas };
  assert.equal(buffer.prepare(request.filters, nextSpace, () => {}, () => {}), false);
  assert.equal(calls, 1);
  assert.ok(buffer.available(request.filters, nextSpace) >= 6);
  complete({ ideas, provider: "public" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  clock += 11000;
  assert.equal(buffer.prepare(request.filters, nextSpace, () => {}, () => {}), false);
  const depleted = { ...space, shownIdeaIds: ideas.slice(0, 7).map((idea) => idea.id) };
  assert.equal(buffer.available(request.filters, depleted), 2);
  assert.equal(buffer.prepare(request.filters, depleted, () => {}, () => {}), true);
  assert.equal(calls, 2);
  complete({ ideas, provider: "public" });
  buffer.clear();
});

test("changing account, filters, saved tastes or feedback invalidates preparation and late responses cannot enter another scope", async () => {
  const jobs: Array<{ signal: AbortSignal; publish?: (result: DiscoveryResult) => void; resolve: (result: DiscoveryResult) => void }> = [];
  const load: typeof requestDiscovery = async (_filters, _space, signal, _fetcher, publish) => new Promise<DiscoveryResult>((resolve) => { jobs.push({ signal, publish, resolve }); });
  const buffer = new DiscoveryBuffer(load), serenity = createEmptySpace("serenity"), zzz = createEmptySpace("zzz");
  const updates: DiscoveryResult[] = [];
  buffer.prepare(request.filters, serenity, (result) => updates.push(result), () => {});
  buffer.prepare(request.filters, zzz, (result) => updates.push(result), () => {});
  assert.equal(jobs[0].signal.aborted, true);
  jobs[0].publish?.({ ideas: [ideaFor()], provider: "deepseek" }); jobs[0].resolve({ ideas: [ideaFor()], provider: "deepseek" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(updates.length, 0);
  assert.equal(buffer.peek(request.filters, zzz).ideas.length, 0);
  assert.notEqual(discoveryScope(request.filters, serenity), discoveryScope({ ...request.filters, mode: "learn" }, serenity));
  assert.notEqual(discoveryScope(request.filters, serenity), discoveryScope(request.filters, { ...serenity, preferences: { ...serenity.preferences, profile: { ...defaultProfile("serenity"), interests: "改过的偏好" } } }));
  assert.notEqual(discoveryScope(request.filters, serenity), discoveryScope(request.filters, { ...serenity, feedback: [{ ideaId: "home-open-sing", vote: "more", updatedAt: date }] }));
  jobs[1].resolve({ ideas: [], provider: "none" }); buffer.clear();
});


test("commercial and irrelevant screenshot videos are excluded without deleting favorites", () => {
  for (const title of ["18.8米，蚂蚁纹桃核散籽福利购，粉丝福利一键三连评论免费得", "B站必剪文本朗读语音大全（很无聊的一个视频）", "【英语达人必看】TED-ED动画全系列：全球人文历史知识大揭秘（1-142集）"]) {
    const idea = { ...ideaFor("https://www.bilibili.com/video/BV1y5zdBZE7r"), title };
    assert.equal(isLowQualityVideo(idea), true);
    const space = { ...createEmptySpace("serenity"), discoveredIdeas: [idea], favorites: [{ ideaId: idea.id, addedAt: date, soon: false }] };
    assert.ok(selectDiscoveredSuggestions(request.filters, space, [idea]).every((item) => item.idea.id !== idea.id));
    assert.equal(parseSpace(space, "serenity")?.favorites.length, 1);
  }
});

test("ordinary creative actions need no invented source but named books still require verified evidence", () => {
  const action = { ...ideaFor(), source: undefined, title: "把脑海里的一幕画成图片", description: "写下场景、光线和人物的动作，再让 AI 帮你画出来。", firstStep: "先用三句话描述那幅画面。", form: "绘画", approach: "open", origin: "deepseek" };
  const result = inspectSearchDiscovery({ content: [{ type: "text", text: JSON.stringify({ ideas: [action] }) }] }, request);
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].id, inspirationIdeaId("home", action.title));
  assert.equal(parseDiscoveredIdea(result.ideas[0])?.source, undefined);
  assert.equal(inspectSearchDiscovery({ content: [{ type: "text", text: JSON.stringify({ ideas: [{ ...action, title: "读《虚构书名》" }] }) }] }, request).ideas.length, 0);
});


test("personal searches follow actual interests and preserve an unfamiliar direction", () => {
  const personal = { ...defaultProfile("serenity"), favoriteTitles: [] };
  for (let seed = 0; seed < 12; seed++) {
    const directions = discoveryDirections("home", seed, personal);
    assert.ok(directions.some((item) => /人物 访谈|角色 对白|文学 散文|角色 叙事|电影 美术|绘画 想象|歌词 故事|情感 表达/.test(item.query)));
    assert.equal(directions.length, 3);
  }
  assert.ok(interestBookSubjects(personal).includes("fiction"));
  assert.equal(interestBookSubjects(personal).includes("science"), false);
  assert.deepEqual(interestBookSubjects({ interests: "音乐", readingList: "", favoriteTitles: [] }), ["music"]);
  assert.deepEqual(interestBookSubjects({ interests: "", readingList: "", favoriteTitles: [] }), []);
});


test("unseen specific content wins over exhausted open and participation slots", () => {
  const online = ["渡船上的人", "灯下的对白", "街头的颜色"].map((name, index) => ({
    ...ideaFor(`https://example.org/fresh/${index}`), title: `看《${name}》`, form: "观看" as const, origin: "deepseek" as const,
  }));
  const space = { ...createEmptySpace("serenity"), shownIdeaIds: explorationIdeas.map((idea) => idea.id) };
  const next = selectDiscoveredSuggestions(request.filters, space, online, [], { random: () => 0.5 });
  assert.equal(next.length, 3);
  assert.ok(next.every(({ idea }) => online.some((item) => item.id === idea.id)));
});

test("a work stays seen across unquoted titles, author labels, editions and different platforms", () => {
  const original = { ...ideaFor(), title: "读《乡土中国》", form: "阅读" as const };
  const keys = workHistory({ ...createEmptySpace("serenity"), shownIdeaIds: [original.id], discoveredIdeas: [original] });
  assert.ok(keys.includes("乡土中国"));
  const aliases = ["看看乡土中国里的地方生活", "读《费孝通：乡土中国》的一段", "看《乡土中国（图文版）》的导读"]
    .map((title, index) => ({ ...ideaFor(`https://example.org/alternate/${index}`), title, form: "观看" as const }));
  const space = { ...createEmptySpace("serenity"), shownIdeaIds: [original.id], discoveredIdeas: [original], shownWorkKeys: keys };
  for (const alias of aliases) {
    assert.ok(namedWorkKeys(alias.title, keys).includes("乡土中国"));
    assert.ok(selectDiscoveredSuggestions(request.filters, space, [alias]).every(({ idea }) => idea.id !== alias.id));
    const payload = { content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: alias.source!.url }] },
      { type: "text", text: JSON.stringify({ ideas: [alias] }) }] };
    assert.equal(inspectSearchDiscovery(payload, { ...request, excludeWorks: keys }).ideas.length, 0);
  }
  assert.deepEqual(namedWorkKeys("看《雪国列车》", ["雪国"]), ["雪国列车"]);
  assert.equal(sameExperience({ ...original, title: "读《雪国》" }, { ...aliases[0], title: "看《雪国列车》" }), false);
});

test("work history survives snapshot eviction, reload, backup merging and account isolation", async () => {
  const original = { ...ideaFor(), title: "读《乡土中国》" };
  const empty = createEmptySpace("serenity");
  const before = { ...empty, discoveredIdeas: [original], shownIdeaIds: [original.id] };
  const keys = workHistory(before);
  const replacements = Array.from({ length: 250 }, (_, i) => ({ ...ideaFor(`https://example.org/evict/${i}`), discoveredAt: "2026-10-09T10:00:00.000Z" }));
  const space = { ...before, shownWorkKeys: keys, discoveredIdeas: mergeDiscoveredIdeas(before, replacements) };
  assert.equal(space.discoveredIdeas.some((idea) => idea.id === original.id), false);
  const restored = parseSpace(JSON.parse(JSON.stringify(space)), "serenity")!;
  assert.deepEqual(restored.shownWorkKeys, keys);
  const merged = mergeSpaces(restored, { ...empty, shownWorkKeys: ["边城"] });
  assert.ok(workHistory(merged).includes("乡土中国"));
  assert.ok(workHistory(merged).includes("边城"));
  let sent: Record<string, unknown> = {};
  await requestDiscovery(request.filters, merged, new AbortController().signal, async (_input, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  });
  assert.ok((sent.excludeWorks as string[]).includes("乡土中国"));
  assert.deepEqual(workHistory(createEmptySpace("zzz")), []);
  assert.ok(parseSpace({ ...empty, shownWorkKeys: undefined }, "serenity"));
  assert.equal(parseSpace({ ...empty, shownWorkKeys: ["x", "x"] }, "serenity"), null);
  assert.equal(parseSpace({ ...empty, shownWorkKeys: Array.from({ length: 601 }, (_, i) => `作品${i}`) }, "serenity"), null);
});

test("sixteen home rounds cannot recycle one book by changing its title or activity classification", () => {
  let space = { ...createEmptySpace("serenity"), shownIdeaIds: explorationIdeas.map((idea) => idea.id) };
  const offeredWorks: string[] = [];
  const titles = ["读《乡土中国》", "看《费孝通：乡土中国》的一段解读", "看看乡土中国里的地方生活", "翻开《乡土中国（重排版）》"];
  for (let round = 0; round < 16; round++) {
    const alias = { ...ideaFor(`https://example.org/book-alias/${round}`), title: titles[round % titles.length], form: round % 2 ? "观看" as const : "阅读" as const, origin: "deepseek" as const };
    const others = Array.from({ length: 3 }, (_, i) => ({ ...ideaFor(`https://example.org/new-work/${round}/${i}`), title: `读《新作品 ${round}-${i}》`, form: "阅读" as const, origin: "deepseek" as const }));
    const online = [alias, ...others];
    const next = selectDiscoveredSuggestions(request.filters, space, online, [], { random: () => 0.5 });
    assert.equal(next.length, 3);
    const keys = next.flatMap(({ idea }) => namedWorkKeys(idea.title, ["乡土中国"]));
    assert.ok(keys.every((key) => !offeredWorks.includes(key)), `round ${round}: ${keys}`);
    offeredWorks.push(...keys);
    space = { ...space, shownWorkKeys: workHistory(space, next.map(({ idea }) => idea)),
      shownIdeaIds: rememberShown(space.shownIdeaIds, next.map(({ idea }) => idea.id)), discoveredIdeas: mergeDiscoveredIdeas(space, online) };
  }
  assert.ok(offeredWorks.filter((key) => key === "乡土中国").length <= 1);
  assert.equal(offeredWorks.length, 48);
});

test("an AI image activity cannot bypass cooldown by changing form; making a song is a distinct action", () => {
  const first = { ...ideaFor(), title: "把你脑海里的一个画面，用 AI 画出来", description: "描述场景给 AI 生图工具，生成后调整。", form: "交互探索" as const, approach: "open" as const };
  const copy = explorationIdeas.find((idea) => idea.id === "home-open-ai-scene")!;
  const song = explorationIdeas.find((idea) => idea.id === "create-open-ai-scene-song")!;
  assert.ok(song);
  assert.equal(sameExperience(first, copy), true);
  assert.equal(sameExperience(first, song), false);
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [first], shownIdeaIds: [first.id, ...explorationIdeas.filter((idea) => idea.category !== "home").slice(0, 14).map((idea) => idea.id)] };
  assert.ok(selectDiscoveredSuggestions(request.filters, space, []).every(({ idea }) => idea.id !== copy.id));
});

test("book catalog queries use taste subjects rather than repeatedly looking up the recommended reading list", async () => {
  const calls: string[] = [];
  const personalization = { ...defaultProfile("serenity"), favoriteTitles: [] };
  for (let seed = 0; seed < 16; seed++) await discoverPublicIdeas({ ...request, seed, personalization }, new AbortController().signal,
    async (input) => { calls.push(String(input)); return Response.json({}); });
  const queries = calls.filter((url) => url.includes("openlibrary.org/search.json")).map((url) => new URL(url).searchParams.get("q")!);
  assert.ok(queries.length >= 4);
  assert.ok(queries.every((query) => query.startsWith("subject:") && !query.includes("title:")));
  assert.ok(calls.every((url) => !decodeURIComponent(url).includes("乡土中国")));
  assert.match(personalization.preferenceNotes!, /口味分析/);
  assert.match(personalization.preferenceNotes!, /书单是依据口味分析建立的推荐结果/);
  assert.ok(parsePersonalization(personalization));
});

test("a photographer introduction article obeys the feed preference instead of pretending to be a works page", () => {
  const article = { ...ideaFor("https://zhuanlan.zhihu.com/p/123456"), title: "翻一位摄影师的作品，看光怎么落下来", domain: "摄影" };
  assert.equal(isFeedIdea(article), true);
  assert.ok(selectDiscoveredSuggestions(request.filters, createEmptySpace("serenity"), [article]).every(({ idea }) => idea.id !== article.id));
  assert.ok(selectDiscoveredSuggestions(request.filters, feedSpace(), [article]).some(({ idea }) => idea.id === article.id));
});

test("renamed open activities rest while distinct named works remain discoverable", () => {
  const action = (title: string): ExplorationIdea => ({ ...ideaFor(), id: inspirationIdeaId("home", title), source: undefined,
    title, description: "用自己可用的图像生成工具创作想象中的场景。", firstStep: "写下你想画的场景。", form: "绘画", domain: "绘画", approach: "open", origin: "deepseek" });
  const previous = action("让 GPT 生成脑海中的画面"), renamed = action("用 AI 画出一个想象中的场景");
  assert.equal(sameExperience(previous, renamed), true);
  assert.equal(sameExperience({ ...ideaFor(), title: "读《边城》" }, { ...ideaFor("https://example.org/other"), title: "读《受戒》" }), false);
  const space = { ...createEmptySpace("serenity"), shownIdeaIds: [previous.id], discoveredIdeas: [previous] };
  assert.ok(selectDiscoveredSuggestions(request.filters, space, [renamed]).every(({ idea }) => idea.id !== renamed.id));
  const result = inspectSearchDiscovery({ content: [{ type: "text", text: JSON.stringify({ ideas: [renamed] }) }] },
    { ...request, recentActivities: recentActivitiesForDiscovery(space) });
  assert.equal(result.ideas.length, 0);
});

test("Bilibili aliases and episode parameters share identity in history, dislikes and the model request", async () => {
  const first = { ...ideaFor("https://www.bilibili.com/video/BV1y5zdBZE7r/?p=1"), title: "看《摄影作品 A》", domain: "摄影" };
  const alias = { ...ideaFor("https://m.bilibili.com/video/BV1y5zdBZE7r?p=2&utm_source=x"), title: "欣赏另一种标题的画面", domain: "摄影" };
  assert.equal(resourceKey(first.source!.url), resourceKey(alias.source!.url));
  assert.notEqual(resourceKey(first.source!.url), resourceKey("https://www.bilibili.com/video/BV1Y5zdBZE7r"));
  const space = { ...createEmptySpace("serenity"), shownIdeaIds: [first.id], discoveredIdeas: [first], feedback: [{ ideaId: first.id, vote: "less" as const, updatedAt: date }] };
  assert.equal(isRejectedIdea(alias, space), true);
  assert.ok(selectDiscoveredSuggestions(request.filters, space, [alias]).every(({ idea }) => idea.id !== alias.id));
  let sent: Record<string, unknown> = {};
  await requestDiscovery(request.filters, space, new AbortController().signal, async (_url, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  });
  assert.ok((sent.excludeIds as string[]).includes(resourceId(alias)!));
  const result = inspectSearchDiscovery({ content: [
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: alias.source!.url }] },
    { type: "text", text: JSON.stringify({ ideas: [alias] }) },
  ] }, { ...request, excludeIds: sent.excludeIds as string[] });
  assert.equal(result.ideas.length, 0);
});

test("votes target subject and experience instead of all videos and carry real examples to the model", () => {
  const photo = { ...ideaFor("https://example.org/photo"), title: "欣赏一位摄影师的街头摄影作品", description: "街拍里的光影和人物。", domain: "摄影", form: "观看" as const };
  const related = { ...photo, ...ideaFor("https://example.org/another-photo"), title: "看看另一位摄影师的街拍作品", domain: "摄影", form: "观看" as const };
  const gear = { ...ideaFor("https://example.org/gears"), title: "看一段齿轮传动机械动画", description: "机械原理示范。", domain: "机械原理", form: "观看" as const };
  const fiction = { ...ideaFor("https://example.org/story-video"), title: "看一段人物对白短片", domain: "文学", form: "观看" as const };
  const empty = createEmptySpace("serenity");
  const space = { ...empty, discoveredIdeas: [photo, gear], feedback: [
    { ideaId: photo.id, vote: "more" as const, updatedAt: date }, { ideaId: gear.id, vote: "less" as const, updatedAt: date },
  ] };
  assert.ok(recommendationScore(related, space) > recommendationScore(related, empty));
  assert.ok(recommendationScore(gear, space) < recommendationScore(gear, empty));
  assert.equal(recommendationScore(fiction, space), recommendationScore(fiction, empty));
  const feedback = feedbackForDiscovery(space);
  assert.equal(feedback.moreExamples![0].description, photo.description);
  assert.ok(feedback.moreExamples![0].topics.includes("街头摄影"));
  assert.deepEqual(parsePersonalization({ ...defaultProfile("serenity"), favoriteTitles: [], feedback })?.feedback, feedback);
  assert.equal(parsePersonalization({ ...defaultProfile("serenity"), favoriteTitles: [], feedback: { ...feedback, moreExamples: [{ title: "broken" }] } }), null);
  const disabled = { ...space, preferences: { ...space.preferences, profile: { ...defaultProfile("serenity"), personalized: false } } };
  assert.equal(recommendationScore(fiction, disabled), recommendationScore(fiction, { ...empty, preferences: disabled.preferences }));
});

test("photography enters the default and old stock profiles without overwriting edited or empty interests", () => {
  const empty = createEmptySpace("serenity"), defaults = defaultProfile("serenity");
  assert.match(defaults.interests, /摄影/);
  assert.match(defaults.preferenceNotes!, /Instagram.*B 站/);
  const old = { ...defaults, preferenceVersion: 1 as const, interests: "故事与人物、文学审美、哲学、地域文化、社会观察。也愿意唱首歌、看看视频，尝试其他陌生领域。",
    preferenceNotes: defaults.preferenceNotes!.split("\n").filter((line) => !line.startsWith("摄影也是明确的兴趣")).join("\n") };
  assert.match(profileFor({ ...empty, preferences: { ...empty.preferences, profile: old } }).interests, /摄影/);
  const intentionallyEdited = { ...old, preferenceVersion: 2 as const };
  assert.equal(profileFor({ ...empty, preferences: { ...empty.preferences, profile: intentionallyEdited } }).interests, old.interests);
  const custom = { ...defaults, interests: "我的自定义", preferenceNotes: "" };
  assert.equal(profileFor({ ...empty, preferences: { ...empty.preferences, profile: custom } }).interests, "我的自定义");
  assert.equal(profileFor({ ...empty, preferences: { ...empty.preferences, profile: custom } }).preferenceNotes, "");
  assert.equal(defaultProfile("zzz").interests, "");
  assert.ok(Array.from({ length: 20 }, (_, seed) => discoveryDirections("home", seed, { ...defaults, favoriteTitles: [] })).flat().some((item) => item.domain === "摄影" && /作品/.test(item.query)));
});

test("a buffer of rewritten activities cannot masquerade as several ready new choices", async () => {
  const titles = ["让 GPT 生成脑海中的画面", "用 AI 画出一个想象中的场景", "请 AI 把脑海中的场景画出来"];
  const ideas: ExplorationIdea[] = titles.map((title) => ({ ...ideaFor(), id: inspirationIdeaId("home", title), title, source: undefined, form: "绘画", approach: "open", domain: "绘画", origin: "deepseek" }));
  const load: typeof requestDiscovery = async () => ({ ideas, provider: "deepseek" });
  const buffer = new DiscoveryBuffer(load);
  const space = createEmptySpace("serenity");
  buffer.prepare(request.filters, space, () => {}, () => {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(buffer.available(request.filters, space), 1);
  assert.equal(buffer.available(request.filters, { ...space, shownIdeaIds: [ideas[0].id], discoveredIdeas: [ideas[0]] }), 0);
  buffer.clear();
});

test("pressuring pitches stay readable when saved but leave recommendations, and exhausted pools are honest", () => {
  const pitch = { ...ideaFor(), title: "认真补一部纪录片，别只看别人的片段" };
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: [pitch], favorites: [{ ideaId: pitch.id, addedAt: date, soon: false }] };
  assert.equal(isRejectedIdea(pitch, space), true);
  assert.equal(parseSpace(space, "serenity")?.favorites.length, 1);
  const suggestions = selectDiscoveredSuggestions(request.filters, { ...space, shownIdeaIds: explorationIdeas.map((idea) => idea.id) }, []);
  assert.equal(suggestions.length, 3);
  assert.match(discoveryNoteFor({ ideas: [], provider: "none" }, suggestions, explorationIdeas.map((idea) => idea.id)), /之前看过/);
});

test("a renamed fallback experience is reported as reused even with a new ID and form", () => {
  const previous = { ...ideaFor(), approach: "open" as const, title: "把脑海里的画面用 AI 画出来", form: "绘画" as const };
  const renamed = { ...previous, id: "inspiration-renamed-image", title: "让 AI 生成一幅想象的图片", form: "交互探索" as const };
  const note = discoveryNoteFor({ ideas: [renamed], provider: "deepseek" }, [{ idea: renamed, reasons: [] }], [previous.id], [previous]);
  assert.match(note, /1 个之前看过的选择/);
  assert.match(note, /新内容暂时不足/);
});
