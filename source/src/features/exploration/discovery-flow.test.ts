import assert from "node:assert/strict";
import test from "node:test";
import { localOutingArea, matchesOutingArea, outingAreaFor, outingGuidance } from "./outing-policy.ts";
import { defaultFilters } from "./types.ts";
import type { ExplorationIdea } from "./types.ts";
import { createEmptySpace, mergeDiscoveredIdeas, parseSpace } from "./storage.ts";
import { onlineIdeaId } from "./discovery.ts";
import { requestDiscovery, selectDiscoveredSuggestions, fillMissingSuggestions } from "./discovery-client.ts";
import { isRejectedIdea } from "./recommendation-ranking.ts";
import { DiscoveryBuffer } from "./discovery-buffer.ts";
import { discoveryDirections } from "./discovery-topics.ts";
import { inspectSearchDiscovery } from "./online-discovery.ts";
import { discoverWithProviders } from "./discovery-service.ts";
import { completeIdeaObjects, readModelResponse } from "./model-stream.ts";
import { defaultProfile } from "./profile.ts";
import { discoveryModeFor, intentFor, settingFor, withExplorationAxes } from "./exploration-filters.ts";
import { generateSuggestions } from "./generator.ts";
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
  for (const issue of ["key_rejected", "quota_exceeded", "rate_limited", "login_required", "provider_unavailable"] as const) {
    const failed = new DiscoveryBuffer(async () => ({ ideas: [], provider: "none", issue }));
    await new Promise<void>((resolve) => failed.prepare(filters, space, () => {}, resolve));
    assert.equal(failed.canRefill(filters, space), false);
    assert.equal(failed.prepare(filters, space, () => {}, () => {}, true), false);
    failed.clear();
  }
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
  const pending = discoverWithProviders(request, new AbortController().signal, {
    key: "fixture", fetcher: async (url) => String(url).includes("/anthropic/v1/messages")
      ? new Response(stream, { headers: { "Content-Type": "text/event-stream" } }) : Response.json({}),
    onResult: (result) => updates.push(result),
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
