import assert from "node:assert/strict";
import test from "node:test";
import { localOutingArea, matchesOutingArea, outingAreaFor, outingGuidance } from "./outing-policy.ts";
import { defaultFilters, timeOptions, moodOptions } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";
import { createEmptySpace, mergeDiscoveredIdeas, parseSpace } from "./storage.ts";
import { onlineIdeaId, inspirationIdeaId, parseDiscoveredIdea } from "./discovery.ts";
import { requestDiscovery, selectDiscoveredSuggestions, fillMissingSuggestions } from "./discovery-client.ts";
import { isRejectedIdea } from "./recommendation-ranking.ts";
import { DiscoveryBuffer, discoveryWaitLimitMs } from "./discovery-buffer.ts";
import { DiscoveryReserve, preparationTargets } from "./discovery-reserve.ts";
import { discoveryDirections } from "./discovery-topics.ts";
import { inspectSearchDiscovery } from "./online-discovery.ts";
import { discoverWithProviders } from "./discovery-service.ts";
import { completeIdeaObjects, readModelResponse } from "./model-stream.ts";
import { defaultProfile } from "./profile.ts";
import { discoveryModeFor, intentFor, settingFor, withExplorationAxes } from "./exploration-filters.ts";
import { generateSuggestions, timeLimits, normalizeFilters } from "./generator.ts";
import { clearOldRecommendations } from "./recommendation-cleanup.ts";
import { canRetryDiscovery, isDiscoveryFailure } from "./discovery-status.ts";
import type { DiscoveryResult } from "./discovery-status.ts";

const date = "2026-10-10T00:00:00.000Z";
const filters = { ...defaultFilters, mode: "outside" as const, time: "short" as const };
const request = { filters, seed: 1, excludeIds: [], excludeTitles: [], outingArea: localOutingArea };
const placeIdea = (place: string, url: string, title = `去${place}`): ExplorationIdea => ({
  id: onlineIdeaId(url), category: "outside", title, place, description: "去这个地方试试感兴趣的东西。",
  minutes: 20, moods: ["curious"], domain: "地方生活", form: "出门", why: "给日常换一点口味。",
  firstStep: "打开地点资料，核对目标分店和当天营业，再决定出发。",
  source: { name: "地点资料", url, action: "核对地点" }, origin: "deepseek", discoveredAt: date,
});
const localIdeas = [
  { ...placeIdea("北京熙悦天街", "https://example.org/cake", "去熙悦天街挑一块蛋糕"), domain: "甜品" },
  { ...placeIdea("阳光邑上周边街边小店", "https://example.org/shop", "逛阳光邑上附近没去过的小店"), domain: "逛店" },
  { ...placeIdea("昊天公园", "https://example.org/park", "去昊天公园走一段"), domain: "自然" },
];
const searched = (ideas: ExplorationIdea[]) => ({ content: [
  { type: "web_search_tool_result", content: ideas.map((idea) => ({ type: "web_search_result", url: idea.source!.url })) },
  { type: "text", text: JSON.stringify({ ideas }) },
] });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("the intermediate time window survives storage and applies a 90-minute cap on both sides", () => {
  const hour = withExplorationAxes({ ...defaultFilters, time: "hour" }, "outside");
  assert.equal(normalizeFilters(hour).time, "hour");
  const base = createEmptySpace("serenity");
  assert.equal(parseSpace({ ...base, preferences: { ...base.preferences, ...hour } }, "serenity")?.preferences.time, "hour");
  const ideas = [60, 90, 91, 150].map((minutes, index) => ({ ...placeIdea("国家博物馆", `https://example.org/hour/${index}`, `时段作品${index}`), minutes }));
  for (const idea of ideas) assert.equal(inspectSearchDiscovery(searched([idea]), { ...request, filters: hour }).ideas.length, idea.minutes <= 90 ? 1 : 0);
  assert.ok(selectDiscoveredSuggestions(hour, createEmptySpace("serenity"), ideas).every(({ idea }) => idea.minutes <= 90));
});

test("nearby open outings form three fresh options without inventing a school or venue source", () => {
  const make = (title: string, form: ExplorationIdea["form"], domain: string): ExplorationIdea => ({
    ...localIdeas[0], id: inspirationIdeaId("outside", title), title, form, domain, source: undefined,
    place: "阳光邑上附近学校周边", approach: "open", description: "在附近选一个允许使用的公共空间。",
    firstStep: "带上需要的物品，在校外或明确允许公众进入的空间开始。",
  });
  const ideas = [make("带个球和朋友玩一会儿", "运动", "球类"), make("和朋友拍一段街头短片", "出门", "摄影"), make("逛街时挑一家自己想进的小店", "出门", "逛店")];
  const payload = { content: [{ type: "text", text: JSON.stringify({ ideas }) }] };
  const discovered = inspectSearchDiscovery(payload, request).ideas;
  assert.equal(discovered.length, 3);
  assert.equal(selectDiscoveredSuggestions(filters, clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z"), discovered).length, 3);
  assert.equal(parseDiscoveredIdea({ ...ideas[0], place: "某个未经核实的中学" }), null);
  assert.equal(parseDiscoveredIdea({ ...ideas[0], description: "这里每天开放，无需预约。" }), null);
  assert.equal(parseDiscoveredIdea({ ...ideas[0], title: "读《虚构作品》" }), null);
  assert.equal(inspectSearchDiscovery(payload, { ...request, excludeIds: [ideas[0].id] }).ideas.length, 2);
  const home = withExplorationAxes(filters, "home");
  assert.equal(inspectSearchDiscovery(payload, { ...request, filters: home }).ideas.length, 0);
});

test("all continuations share a 30-second budget rather than stacking three timeouts", async () => {
  let now = 0, calls = 0;
  const buffer = new DiscoveryBuffer(async () => {
    calls++; now += 16000;
    return { ideas: [localIdeas[(calls - 1) % 3]], provider: "deepseek" };
  }, () => now);
  const space = createEmptySpace("serenity");
  await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve));
  assert.equal(buffer.canRefill(filters, space), true);
  await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve, true));
  assert.ok(now >= discoveryWaitLimitMs);
  assert.equal(buffer.canRefill(filters, space), false);
  assert.equal(calls, 2);
  assert.equal(buffer.peek(filters, space).ideas.length, 2);
  buffer.clear();
});

test("aborting a stalled discovery body stops the reader immediately", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Type": "application/x-ndjson" } });
  const pending = requestDiscovery(filters, createEmptySpace("serenity"), controller.signal, async () => response);
  await tick(); controller.abort();
  await assert.rejects(pending);
  assert.equal(cancelled, true);
});

test("shared validated reserves cover every setting, intent, time and mood after reload", () => {
  const home = ["home", "learn", "create"].flatMap((category, group) => localIdeas.map((idea, index): ExplorationIdea => ({
    ...idea, category: category as ExplorationIdea["category"], place: undefined,
    id: onlineIdeaId(`https://example.org/matrix/${group}/${index}`), title: `试试《新入口${group}-${index}》`,
    source: { name: "已核实", url: `https://example.org/matrix/${group}/${index}` },
  })));
  const base = clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z");
  const space = parseSpace({ ...base, discoveredIdeas: [...home, ...localIdeas] }, "serenity")!;
  assert.ok(preparationTargets(defaultFilters).length <= 25);
  const buffer = new DiscoveryBuffer();
  for (const setting of ["outside", "home", "any"] as const)
    for (const intent of ["any", "learn", "create"] as const)
      for (const { id: time } of timeOptions)
        for (const { id: mood } of moodOptions) {
          const conditions = withExplorationAxes({ ...defaultFilters, time, mood }, setting, intent);
          const choices = selectDiscoveredSuggestions(conditions, space, [], [], { random: () => 0.5 });
          assert.equal(choices.length, 3, JSON.stringify(conditions));
          assert.ok(choices.every(({ idea }) => idea.minutes <= timeLimits[time]));
          assert.ok(buffer.available(conditions, space) >= 3);
        }
  const excluded = { ...space, shownIdeaIds: localIdeas.map((idea) => idea.id), favorites: home.map((idea) => ({ ideaId: idea.id, soon: false, addedAt: date })) };
  assert.equal(buffer.available(withExplorationAxes(defaultFilters, "any"), excluded), 0);
});

test("background preparation rotates pools, preserves preferences and isolates late account responses", async () => {
  let publish!: (result: DiscoveryResult) => void;
  let finish!: (result: DiscoveryResult) => void;
  let calls = 0;
  const scopes: string[] = [];
  let space = clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z");
  const preferences = space.preferences;
  const reserve = new DiscoveryReserve(async (conditions, _space, _signal, _fetcher, receive, _reserved, preparation) => {
    calls++; assert.equal(preparation, true); scopes.push(JSON.stringify(conditions)); publish = receive!;
    return new Promise<DiscoveryResult>((resolve) => { finish = resolve; });
  });
  const receive = (result: DiscoveryResult) => { space = { ...space, discoveredIdeas: mergeDiscoveredIdeas(space, result.ideas) }; };
  assert.equal(reserve.prepare(filters, space, receive, () => {}), true);
  assert.equal(reserve.prepare(filters, space, receive, () => {}), false);
  const late = publish;
  finish({ ideas: [], provider: "none", issue: "no_new_results" }); await tick();
  assert.equal(reserve.prepare(filters, space, receive, () => {}), true);
  assert.notEqual(scopes[0], scopes[1]);
  finish({ ideas: localIdeas, provider: "deepseek" }); await tick();
  assert.deepEqual(space.preferences, preferences);
  assert.deepEqual(space.shownIdeaIds, []);
  assert.equal(calls, 2);
  assert.equal(reserve.prepare(filters, space, receive, () => {}), true);
  const other = createEmptySpace("zzz");
  reserve.prepare(filters, other, () => {}, () => {});
  const before = space.discoveredIdeas.length;
  late({ ideas: [placeIdea("阳光邑上周边街区", "https://example.org/stale")], provider: "deepseek" });
  assert.equal(space.discoveredIdeas.length, before);
  reserve.clear();
});

test("terminal failures block automatic preparation and sparse batches have a finite attempt budget", async () => {
  const space = createEmptySpace("serenity");
  let calls = 0;
  const reserve = new DiscoveryReserve(async () => { calls++; return { ideas: [], provider: "none", issue: "no_new_results" }; });
  while (reserve.prepare(defaultFilters, space, () => {}, () => {})) await tick();
  assert.equal(calls, preparationTargets(defaultFilters).length * 2);
  assert.equal(reserve.prepare(defaultFilters, space, () => {}, () => {}), false);
  reserve.retry();
  assert.equal(reserve.prepare(defaultFilters, space, () => {}, () => {}), true);
  await tick();
  assert.equal(calls, preparationTargets(defaultFilters).length * 2 + 1);
  reserve.clear();
  for (const issue of ["key_rejected", "quota_exceeded", "rate_limited", "login_required", "forbidden", "invalid_request", "not_configured"] as const) {
    reserve.stopOnFailure({ ideas: [], provider: "none", issue }, space);
    assert.equal(reserve.prepare(defaultFilters, space, () => {}, () => {}), false);
    reserve.clear();
  }
});

test("preparation skips filled time and intent pools but refills a depleted nearby pool", async () => {
  const make = (category: ExplorationIdea["category"], minutes: number, index: number): ExplorationIdea => ({
    ...localIdeas[index % 3], category, minutes,
    id: onlineIdeaId(`https://example.org/stock/${category}/${minutes}/${index}`),
    title: `试试《储备作品${category}-${minutes}-${index}》`,
    source: { name: "核对入口", url: `https://example.org/stock/${category}/${minutes}/${index}` },
  });
  const ideas = (["home", "learn", "create", "outside"] as const).flatMap((category) =>
    [20, 60, 110, 150].flatMap((minutes) => Array.from({ length: 6 }, (_, index) => make(category, minutes, index))));
  const space = { ...clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z"), discoveredIdeas: ideas };
  let calls = 0;
  const reserve = new DiscoveryReserve(async (conditions) => {
    calls++;
    assert.equal(settingFor(conditions), "outside");
    assert.equal(conditions.time, "short");
    return { ideas: [], provider: "none" };
  });
  assert.equal(reserve.prepare(defaultFilters, space, () => {}, () => {}), false);
  assert.equal(calls, 0);
  const excluded = { ...space, favorites: ideas.filter((idea) => idea.category === "outside" && idea.minutes === 20)
    .map((idea) => ({ ideaId: idea.id, soon: false, addedAt: date })) };
  assert.equal(reserve.prepare(defaultFilters, excluded, () => {}, () => {}), true);
  await tick();
  assert.equal(calls, 1);
  reserve.clear();
});

test("rejection diagnostics distinguish area, time and missing evidence without logging personal text", () => {
  const bad = [placeIdea("国家图书馆", "https://example.org/far"), { ...localIdeas[0], minutes: 90 }, placeIdea("昊天公园", "https://example.org/unverified")];
  const payload = { content: [{ type: "web_search_tool_result", content: bad.slice(0, 2).map((idea) => ({ type: "web_search_result", url: idea.source!.url })) }, { type: "text", text: JSON.stringify({ ideas: bad }) }] };
  assert.deepEqual(inspectSearchDiscovery(payload, request).rejected, { outing_area: 1, setting_or_time: 1, unverified_source: 1 });
});

test("short outings restrict the destination, while longer outings and other accounts keep the whole city", () => {
  const far = ["国家博物馆", "国家图书馆", "龙湖北京房山天街", "朝阳公园", "良乡"].map((place, i) => placeIdea(place, `https://example.org/far/${i}`));
  for (const idea of far) {
    assert.equal(matchesOutingArea({ ...idea, description: "从阳光邑上出发，附近走走。" }, filters, localOutingArea), false);
    for (const time of ["medium", "half-day", "any"] as const) assert.equal(matchesOutingArea(idea, { ...filters, time }, localOutingArea), true);
    assert.equal(matchesOutingArea(idea, filters, outingAreaFor("zzz")), true);
  }
  assert.equal(matchesOutingArea({ ...localIdeas[0], place: undefined }, filters, localOutingArea), false);
  assert.equal(matchesOutingArea({ ...localIdeas[0], place: "阳光邑上到国家博物馆" }, filters, localOutingArea), false);
  for (const idea of localIdeas) assert.equal(matchesOutingArea(idea, filters, localOutingArea), true);
  const home = { ...localIdeas[0], category: "home" as const, place: undefined };
  assert.equal(matchesOutingArea(home, { ...filters, mode: "random" }, localOutingArea), true);
  assert.equal(JSON.stringify(outingGuidance(filters, outingAreaFor("zzz"))).includes("麦德林"), false);
});

test("location restrictions survive server validation, old cache selection and sparse-group filling", () => {
  const far = placeIdea("国家图书馆", "https://example.org/library");
  const ideas = [far, ...localIdeas];
  assert.deepEqual(inspectSearchDiscovery(searched(ideas), request).ideas.map((idea) => idea.id), localIdeas.map((idea) => idea.id));
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: ideas };
  const selected = selectDiscoveredSuggestions(filters, space, []);
  assert.equal(selected.length, 3);
  assert.ok(selected.every(({ idea }) => localIdeas.some((local) => local.id === idea.id)));
  assert.ok(fillMissingSuggestions(filters, space, [{ idea: far, reasons: [] }], localIdeas).every(({ idea }) => idea.id !== far.id));
  const long = { ...filters, time: "medium" as const };
  assert.equal(inspectSearchDiscovery(searched([far]), { ...request, filters: long }).ideas.length, 1);
  assert.ok(selectDiscoveredSuggestions(long, createEmptySpace("serenity"), [far]).some(({ idea }) => idea.id === far.id));
});

test("outdoor search directions include everyday shops and only short location searches narrow to the neighborhood", () => {
  const all = Array.from({ length: 80 }, (_, seed) => discoveryDirections("outside", seed)).flat();
  assert.ok(all.some((item) => /蛋糕|甜品/.test(item.query)));
  assert.ok(all.some((item) => /小店|逛街|文具/.test(item.query)));
  for (const item of discoveryDirections("outside", 3, undefined, [], localOutingArea)) {
    assert.match(item.query, /阳光邑上附近/);
    assert.doesNotMatch(item.query, /^北京 /);
  }
  assert.ok(discoveryDirections("outside", 3).every((item) => item.query.startsWith("北京 ")));
});

test("favorites exclude original resources and same-work aliases without removing saved snapshots or banning new works", async () => {
  const url = "https://www.bilibili.com/video/BV1y5zdBZE7r";
  const saved: ExplorationIdea = { ...localIdeas[0], category: "home", id: onlineIdeaId(url), title: "听一段《安静的河流》", form: "聆听", source: { name: "作品", url } };
  const aliases = [
    { ...saved, title: "换一种描述", source: { name: "作品", url: `${url}?utm_source=test#part` } },
    { ...saved, id: onlineIdeaId("https://example.org/river"), title: "唱《安静的河流》中的一段", source: { name: "另一个入口", url: "https://example.org/river" } },
  ];
  const fresh = { ...saved, id: onlineIdeaId("https://example.org/new-song"), title: "听一段《穿过山间》", source: { name: "新作品", url: "https://example.org/new-song" } };
  const base = createEmptySpace("serenity");
  const space = { ...base, favorites: [{ ideaId: saved.id, soon: false, addedAt: date }], discoveredIdeas: [saved, fresh],
    preferences: { ...base.preferences, profile: { ...defaultProfile("serenity"), personalized: false } } };
  assert.equal(isRejectedIdea(saved, space), true);
  for (const alias of aliases) assert.equal(isRejectedIdea(alias, space), true);
  assert.equal(isRejectedIdea(fresh, space), false);
  const home = { ...defaultFilters, mode: "home" as const };
  assert.ok(selectDiscoveredSuggestions(home, space, aliases).every(({ idea }) => !isRejectedIdea(idea, space)));
  const stored = parseSpace({ ...space, discoveredIdeas: mergeDiscoveredIdeas(space, [fresh]) }, "serenity");
  assert.equal(stored?.favorites[0].ideaId, saved.id);
  assert.ok(stored?.discoveredIdeas.some((idea) => idea.id === saved.id));
  let sent: Record<string, unknown> = {};
  await requestDiscovery(home, space, new AbortController().signal, async (_url, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  }, undefined, [fresh]);
  assert.ok((sent.excludeIds as string[]).includes(saved.id));
  assert.ok((sent.excludeIds as string[]).includes(fresh.id));
  assert.ok((sent.excludeTitles as string[]).includes(saved.title));
  assert.ok((sent.excludeWorks as string[]).some((work) => work.includes("安静的河流")));
  assert.equal(sent.personalization, undefined);
  assert.equal(sent.outingArea, localOutingArea);
});

test("refill batches reserve unpublished choices, stop after two continuations, and do not retry configuration errors", async () => {
  const space = createEmptySpace("serenity");
  const reserved: ExplorationIdea[][] = [];
  let round = 0;
  const load: typeof requestDiscovery = async (_filters, _space, _signal, _fetcher, _onResult, pending) => {
    reserved.push(pending ?? []);
    return { ideas: [localIdeas[round++ % 3]], provider: "deepseek" };
  };
  const buffer = new DiscoveryBuffer(load);
  const settle = () => new Promise<void>((resolve) => { assert.equal(buffer.prepare(filters, space, () => {}, resolve, round > 0), true); });
  await settle();
  assert.equal(buffer.canRefill(filters, space), true);
  await settle(); await settle();
  assert.equal(round, 3);
  assert.equal(reserved[1][0].id, localIdeas[0].id);
  assert.equal(reserved[2].length, 2);
  assert.equal(buffer.canRefill(filters, space), false);
  assert.equal(buffer.prepare(filters, space, () => {}, () => {}, true), false);
  buffer.clear();
  for (const issue of ["key_rejected", "quota_exceeded", "rate_limited", "login_required", "forbidden", "invalid_request", "request_rejected", "not_configured", "timeout"] as const) {
    const failed = new DiscoveryBuffer(async () => ({ ideas: [], provider: "none", issue }));
    await new Promise<void>((resolve) => failed.prepare(filters, space, () => {}, resolve));
    assert.equal(failed.canRefill(filters, space), false);
    assert.equal(failed.prepare(filters, space, () => {}, () => {}, true), false);
    failed.clear();
  }
});

test("one automatic recovery can restore three choices without dropping favorites or dislike exclusions", async () => {
  const favorite = { ...placeIdea("旧画廊", "https://example.org/saved-gallery", "去已收藏的画廊"), domain: "艺术" };
  const disliked = { ...placeIdea("旧演出", "https://example.org/rejected-show", "去已排除的演出"), domain: "演出" };
  const space = { ...clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z"), discoveredIdeas: [favorite, disliked],
    favorites: [{ ideaId: favorite.id, soon: false, addedAt: date }], feedback: [{ ideaId: disliked.id, vote: "less" as const, updatedAt: date }] };
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(body.excludeIds.includes(favorite.id));
    assert.ok(body.excludeIds.includes(disliked.id));
    if (calls === 1) throw new TypeError("connection reset");
    return new Response(JSON.stringify({ ideas: localIdeas, provider: "deepseek" }) + "\n", { headers: { "Content-Type": "application/x-ndjson" } });
  };
  const buffer = new DiscoveryBuffer((conditions, value, signal, _fetcher, publish, reserved) =>
    requestDiscovery(conditions, value, signal, fetcher, publish, reserved));
  await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve));
  assert.equal(buffer.peek(filters, space).issue, "network_error");
  assert.equal(buffer.canRefill(filters, space), true);
  await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve, true));
  const result = buffer.peek(filters, space);
  assert.equal(calls, 2);
  assert.equal(result.issue, undefined);
  assert.equal(buffer.available(filters, space), 3);
  const choices = selectDiscoveredSuggestions(filters, space, result.ideas);
  assert.equal(choices.length, 3);
  assert.ok(choices.every(({ idea }) => !isRejectedIdea(idea, space)));
  buffer.clear();
});

test("transient discovery errors get at most one recovery and never retry once three choices are ready", async () => {
  const space = clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z");
  for (const issue of ["network_error", "service_unavailable", "provider_unavailable", "invalid_response"] as const) {
    let calls = 0;
    const buffer = new DiscoveryBuffer(async () => { calls++; return { ideas: [], provider: "none", issue }; });
    await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve));
    assert.equal(buffer.canRefill(filters, space), true);
    await new Promise<void>((resolve) => buffer.prepare(filters, space, () => {}, resolve, true));
    assert.equal(buffer.canRefill(filters, space), false);
    assert.equal(buffer.prepare(filters, space, () => {}, () => {}, true), false);
    assert.equal(calls, 2);
    assert.equal(isDiscoveryFailure(buffer.peek(filters, space)), true);
    buffer.clear();
  }
  const ready = new DiscoveryBuffer(async () => ({ ideas: localIdeas, provider: "deepseek", issue: "network_error" }));
  await new Promise<void>((resolve) => ready.prepare(filters, space, () => {}, resolve));
  assert.equal(ready.available(filters, space), 3);
  assert.equal(ready.canRefill(filters, space), false);
  ready.clear();
  for (const issue of ["no_new_results", "no_search_results"] as const) {
    assert.equal(isDiscoveryFailure({ ideas: [], provider: "none", issue }), false);
    assert.equal(canRetryDiscovery({ ideas: [], provider: "none", issue }), false);
  }
});

test("saved unseen choices are already ready after refresh, without another model request", async () => {
  const home = withExplorationAxes(defaultFilters, "home", "any");
  const ideas = Array.from({ length: 6 }, (_, index): ExplorationIdea => ({
    ...localIdeas[index % 3], id: onlineIdeaId(`https://example.org/ready/${index}`), category: "home",
    title: `试试《缓存新作品${index}》`, source: { name: "已核对的入口", url: `https://example.org/ready/${index}` },
  }));
  const space = { ...createEmptySpace("serenity"), discoveredIdeas: ideas };
  let calls = 0;
  const buffer = new DiscoveryBuffer(async () => { calls++; return { ideas: [], provider: "none" }; });
  assert.equal(buffer.available(home, space), 6);
  assert.equal(buffer.prepare(home, space, () => {}, () => {}), false);
  assert.equal(calls, 0);
  assert.equal(selectDiscoveredSuggestions(home, space, []).length, 3);
  const excluded = { ...space, shownIdeaIds: ideas.slice(0, 3).map((idea) => idea.id),
    favorites: ideas.slice(3).map((idea) => ({ ideaId: idea.id, soon: false, addedAt: date })) };
  assert.equal(buffer.available(home, excluded), 0);
  await new Promise<void>((resolve) => buffer.prepare(home, excluded, () => {}, resolve));
  assert.equal(calls, 1);
  buffer.clear();
});

test("warming and clicking share one request, reserve saved choices, and expose a group before the request ends", async () => {
  const home = withExplorationAxes(defaultFilters, "home", "any");
  const make = (index: number): ExplorationIdea => ({ ...localIdeas[index % 3], category: "home",
    id: onlineIdeaId(`https://example.org/warm/${index}`), title: `试试《提前准备${index}》`,
    source: { name: "核对入口", url: `https://example.org/warm/${index}` } });
  let space = { ...clearOldRecommendations(createEmptySpace("serenity"), "2026-10-09T00:00:00.000Z"),
    discoveredIdeas: [make(0), make(1), make(2)] };
  let publish!: (result: DiscoveryResult) => void;
  let finish!: (result: DiscoveryResult) => void;
  let reserved: ExplorationIdea[] = [], calls = 0;
  const buffer = new DiscoveryBuffer(async (_filters, _space, _signal, _fetcher, onResult, pending) => {
    calls++; reserved = pending ?? []; publish = onResult!;
    return new Promise<DiscoveryResult>((resolve) => { finish = resolve; });
  });
  const receive = (result: DiscoveryResult) => { space = { ...space, discoveredIdeas: mergeDiscoveredIdeas(space, result.ideas) }; };
  assert.equal(buffer.prepare(home, space, receive, () => {}), true);
  assert.equal(buffer.prepare(home, space, receive, () => {}), false);
  assert.deepEqual(reserved.map((idea) => idea.id), space.discoveredIdeas.map((idea) => idea.id));
  const first = selectDiscoveredSuggestions(home, space, []);
  space = { ...space, shownIdeaIds: first.map(({ idea }) => idea.id) };
  const fresh = [make(3), make(4), make(5)];
  publish({ ideas: fresh, provider: "deepseek" });
  const next = selectDiscoveredSuggestions(home, space, buffer.peek(home, space).ideas, space.shownIdeaIds);
  assert.equal(next.length, 3);
  assert.ok(next.every(({ idea }) => fresh.some((item) => item.id === idea.id)));
  assert.equal(buffer.preparing, true);
  assert.equal(calls, 1);
  finish({ ideas: fresh, provider: "deepseek" }); await tick();
  buffer.clear();
});

test("only complete streamed objects are parsed, including nested data, escaped quotes and braces in text", () => {
  const first = { title: '画面里有 {风} 和 "雨"', source: { url: "https://example.org/a" }, moods: ["curious"] };
  const text = `{"ideas":[${JSON.stringify(first)}, {"title":"unfinished`;
  assert.deepEqual(completeIdeaObjects(text), [first]);
  assert.deepEqual(completeIdeaObjects('{"ideas":['), []);
  assert.deepEqual(completeIdeaObjects('{"ideas":[{"bad":undefined}]'), []);
});

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;
test("model SSE publishes a validated first group before completion and retains search evidence across split UTF8 chunks", async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
  const encoder = new TextEncoder();
  const updates: DiscoveryResult[] = [];
  const timings: Array<{ elapsedMs: number; firstGroupMs?: number; firstCandidateMs?: number; modelStartedMs?: number; modelResponseMs?: number }> = [];
  const pending = discoverWithProviders(request, new AbortController().signal, {
    key: "fixture", fetcher: async (url) => String(url).includes("/anthropic/v1/messages")
      ? new Response(stream, { headers: { "Content-Type": "text/event-stream" } }) : Response.json({}),
    onResult: (result) => updates.push(result),
    log: (entry) => timings.push(entry),
  });
  const send = (value: unknown) => output.enqueue(encoder.encode(frame(value)));
  send({ type: "content_block_start", index: 0, content_block: searched(localIdeas).content[0] });
  send({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } });
  const data = encoder.encode(frame({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: `{"ideas":[${localIdeas.map((idea) => JSON.stringify(idea)).join(",")}` } }));
  for (let i = 0; i < data.length; i += 17) output.enqueue(data.slice(i, i + 17));
  await tick();
  assert.equal(updates.at(-1)?.ideas.length, 3);
  assert.equal(updates.at(-1)?.provider, "deepseek");
  const invented = placeIdea("阳光邑上周边街边小店", "https://example.org/invented", "去一个未核实的小店");
  send({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: `,${JSON.stringify(invented)}]}` } });
  send({ type: "message_stop" }); output.close();
  const result = await pending;
  assert.equal(result.ideas.length, 3);
  assert.equal(result.ideas.some((idea) => idea.id === invented.id), false);
  assert.ok(timings[0].modelStartedMs !== undefined && timings[0].modelResponseMs !== undefined);
  assert.ok(timings[0].firstCandidateMs !== undefined && timings[0].firstGroupMs !== undefined);
  assert.ok(timings[0].firstGroupMs <= timings[0].elapsedMs);
});

test("a provider stream error preserves only already validated cards, never raw search material", async () => {
  const data = frame({ type: "content_block_start", index: 0, content_block: searched(localIdeas).content[0] }) +
    frame({ type: "content_block_start", index: 1, content_block: { type: "text", text: JSON.stringify({ ideas: [localIdeas[0]] }) } }) +
    frame({ type: "error", error: { message: "fixture failure" } });
  const result = await discoverWithProviders(request, new AbortController().signal, { key: "fixture",
    fetcher: async (url) => String(url).includes("/anthropic/v1/messages") ? new Response(data, { headers: { "Content-Type": "text/event-stream" } }) : Response.json({}) });
  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].id, localIdeas[0].id);
  assert.equal(result.issue, "provider_unavailable");
});

test("the model starts before a stalled public catalog finishes, with streaming and outdoor diversity guidance", async () => {
  let modelStarted = false;
  const started = Date.now();
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("/anthropic/v1/messages")) {
      modelStarted = true;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.stream, true);
      const message = JSON.parse(body.messages[0].content);
      assert.match(message.request, /6 个/);
      assert.match(message.request, /不限制出门这种形式/);
      assert.match(message.outing.scope, /阳光邑上附近/);
      assert.ok(message.directions.every((query: string) => query.includes("阳光邑上附近")));
      return Response.json(searched(localIdeas));
    }
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  };
  const result = await discoverWithProviders(request, new AbortController().signal, { key: "fixture", fetcher });
  assert.equal(modelStarted, true);
  assert.ok(Date.now() - started < 2000);
  assert.equal(result.ideas.length, 3);
});

test("ordinary JSON model responses remain compatible", async () => {
  const body = searched(localIdeas);
  assert.deepEqual(await readModelResponse(Response.json(body), new AbortController().signal, () => { throw new Error("not streaming"); }), body);
});

test("scene and experience combine without splitting home activities into mutually exclusive pools", () => {
  const home = withExplorationAxes(defaultFilters, "home", "learn");
  const ideas = [
    { ...localIdeas[0], category: "home" as const, title: "唱一首《联调新歌》", form: "歌唱" as const },
    { ...localIdeas[1], category: "learn" as const, title: "试试一个编曲工具", form: "交互探索" as const },
    { ...localIdeas[2], category: "create" as const, title: "画一个自己的角色", form: "绘画" as const },
    placeIdea("国家博物馆", "https://example.org/far-museum"),
  ];
  const generated = generateSuggestions(home, { ideas, random: () => 0 });
  assert.equal(generated.length, 3);
  assert.equal(generated[0].idea.category, "learn");
  assert.ok(generated.every(({ idea }) => idea.category !== "outside"));
  const result = inspectSearchDiscovery(searched(ideas), { ...request, filters: home });
  assert.equal(result.ideas.length, 3);
  assert.equal(selectDiscoveredSuggestions(home, createEmptySpace("serenity"), result.ideas).length, 3);
  const outside = withExplorationAxes({ ...defaultFilters, time: "medium" }, "outside", "create");
  assert.equal(generateSuggestions(outside, { ideas }).length, 1);
  assert.equal(discoveryModeFor(outside), "outside");
  assert.equal(discoveryModeFor(home), "learn");
  assert.equal(intentFor(withExplorationAxes({ ...defaultFilters, mode: "learn" })), "learn");
  assert.equal(settingFor(withExplorationAxes({ ...defaultFilters, mode: "learn" })), "any");
});

test("new scene and intent persist while old backups, favorites and account separation stay intact", async () => {
  const space = createEmptySpace("serenity");
  const preferences = { ...space.preferences, ...withExplorationAxes(filters, "outside", "learn") };
  const updated = { ...space, preferences, favorites: [{ ideaId: localIdeas[0].id, soon: false, addedAt: date }], discoveredIdeas: [localIdeas[0]] };
  assert.deepEqual(parseSpace(updated, "serenity")?.preferences, preferences);
  assert.equal(parseSpace(updated, "serenity")?.favorites[0].ideaId, localIdeas[0].id);
  assert.equal(parseSpace(space, "serenity")?.preferences.setting, undefined);
  assert.equal(parseSpace({ ...updated, preferences: { ...preferences, intent: "invalid" } }, "serenity"), null);
  assert.equal(parseSpace(updated, "zzz"), null);
  let sent: Record<string, unknown> = {};
  await requestDiscovery(preferences, updated, new AbortController().signal, async (_url, init) => {
    sent = JSON.parse(String(init?.body)); return Response.json({ ideas: [], provider: "none" });
  });
  assert.equal((sent.filters as Record<string, string>).intent, "learn");
  assert.equal((sent.filters as Record<string, string>).setting, "outside");
});
