import { contentKey, isChildrensPodcast, isObject, onlineIdeaId, parseDiscoveredIdea, sourceUrl } from "./discovery.ts";
import { timeLimits } from "./generator.ts";
import type { ExplorationFilters, ExplorationIdea } from "./types.ts";

export type DiscoveryRequest = {
  filters: ExplorationFilters;
  seed: number;
  excludeIds: string[];
  excludeTitles: string[];
};
type Fetcher = typeof fetch;

export async function fetchJson(url: string, signal: AbortSignal, fetcher: Fetcher, init?: RequestInit): Promise<unknown> {
  const response = await fetcher(url, {
    ...init, cache: "no-store", signal,
    headers: { "User-Agent": "Manyou/2.0 (personal exploration; low-volume search)", ...init?.headers },
  });
  if (!response.ok) throw new Error(`DISCOVERY_UPSTREAM_${response.status}`);
  return response.json();
}

const eligible = (idea: ExplorationIdea, request: DiscoveryRequest) =>
  (request.filters.mode === "random" || request.filters.mode === idea.category) &&
  idea.minutes <= timeLimits[request.filters.time] && !request.excludeIds.includes(idea.id);

function materialize(value: unknown, date: string): ExplorationIdea | null {
  if (!isObject(value) || !isObject(value.source)) return null;
  const url = sourceUrl(value.source.url);
  return url ? parseDiscoveredIdea({ ...value, id: onlineIdeaId(url), discoveredAt: date }) : null;
}

// A claimed source URL must occur in an actual server-side web-search result.
// Model text on its own is never treated as proof that a search took place.
export function parseSearchDiscovery(payload: unknown, request: DiscoveryRequest): ExplorationIdea[] {
  if (!isObject(payload) || !Array.isArray(payload.content)) return [];
  const verified = new Set<string>();
  for (const block of payload.content) {
    if (!isObject(block) || block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (!isObject(result) || result.type !== "web_search_result") continue;
      const url = sourceUrl(result.url);
      if (url) verified.add(url);
    }
  }
  if (!verified.size) return [];
  const messages = payload.content.filter((block) => isObject(block) && block.type === "text" && typeof block.text === "string");
  for (const message of messages.reverse()) {
    const raw = String(message.text);
    try {
      const decoded: unknown = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      if (!isObject(decoded) || !Array.isArray(decoded.ideas)) continue;
      const ideas = new Map<string, ExplorationIdea>();
      for (const value of decoded.ideas.slice(0, 12)) {
        const idea = materialize(value, new Date().toISOString());
        if (idea?.source && verified.has(idea.source.url) && eligible(idea, request) &&
          !request.excludeTitles.some((title) => contentKey(title) === contentKey(idea.title))) ideas.set(idea.id, idea);
      }
      return [...ideas.values()];
    } catch { /* A preamble or malformed JSON is not a usable discovery. */ }
  }
  return [];
}

function podcastIdeas(payload: unknown, request: DiscoveryRequest, topic: string): ExplorationIdea[] {
  if (!isObject(payload) || !Array.isArray(payload.results)) return [];
  const category = request.filters.mode === "learn" ? "learn" : "home";
  return payload.results.flatMap((value) => {
    if (!isObject(value) || value.kind !== "podcast" || typeof value.collectionName !== "string" ||
      typeof value.artistName !== "string" || /儿童|幼儿|宝宝|睡前故事|[0-9]-[0-9]岁|抖音|快手|破亿|爆火|步频|车载|串烧/.test(value.collectionName)) return [];
    const title = value.collectionName.slice(0, 100);
    const idea = materialize({
      category, title: `听一期《${title}》`, minutes: 25,
      description: `这是${value.artistName.slice(0, 80)}的播客。打开节目列表，挑一期你还没听过的内容，先听 25 分钟；不要求听完整期。`,
      moods: ["gentle", "curious", "flow"], domain: `播客 · ${typeof value.primaryGenreName === "string" ? value.primaryGenreName.slice(0, 35) : topic}`,
      why: "从一个具体节目的某一期开始，跟着讲述认识一个新话题。",
      firstStep: "打开节目，看看最近几期的标题，选一个具体问题或故事，开始播放。节目介绍和播放条件以来源页面为准。",
      source: { name: "Apple Podcasts", url: value.collectionViewUrl, action: "打开节目" },
    }, new Date().toISOString());
    return idea && !isChildrensPodcast(idea) && eligible(idea, request) ? [idea] : [];
  });
}

function bookIdeas(payload: unknown, request: DiscoveryRequest, topic: string): ExplorationIdea[] {
  if (!isObject(payload) || !Array.isArray(payload.docs)) return [];
  return payload.docs.flatMap((value) => {
    if (!isObject(value) || typeof value.key !== "string" || !/^\/works\/OL\d+W$/.test(value.key) ||
      typeof value.title !== "string" || !Array.isArray(value.author_name)) return [];
    const author = value.author_name.filter((item): item is string => typeof item === "string").join("、").slice(0, 100);
    const idea = materialize({
      category: request.filters.mode === "learn" ? "learn" : "home",
      title: `翻开《${value.title.slice(0, 110)}》`, minutes: 25, domain: "阅读",
      description: `${author ? `${author}的作品。` : ""}从${topic}里发现的一本书。先看简介、目录或你能找到的试读，再挑一段感兴趣的内容；25 分钟只是选读时间。`,
      moods: ["gentle", "curious", "focused", "flow"],
      why: "给阅读换一个具体入口，不用先决定读完一本。",
      firstStep: "打开书目查看作者、版本与简介。有试读就读几页；否则在自己的书架或图书馆找这个书名，来源页面不保证全文可读。",
      source: { name: "Open Library", url: `https://openlibrary.org${value.key}`, action: "看看这本书" },
    }, new Date().toISOString());
    return idea && eligible(idea, request) ? [idea] : [];
  });
}

function recipeIdeas(payload: unknown, request: DiscoveryRequest): ExplorationIdea[] {
  if (!isObject(payload) || !Array.isArray(payload.meals)) return [];
  return payload.meals.flatMap((value) => {
    if (!isObject(value) || typeof value.idMeal !== "string" || !/^\d+$/.test(value.idMeal) || typeof value.strMeal !== "string") return [];
    const ingredients = Array.from({ length: 20 }, (_, i) => value[`strIngredient${i + 1}`])
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 5).join("、");
    const minutes = request.filters.time === "short" ? 20 : 60;
    const idea = materialize({
      category: request.filters.mode === "home" ? "home" : "create",
      title: request.filters.time === "short" ? `研究一道新菜：${value.strMeal.slice(0, 100)}` : `试做一道 ${value.strMeal.slice(0, 100)}`,
      minutes, domain: "烹饪", moods: ["curious", "focused", "flow"],
      description: `从食谱库发现的具体菜式，${typeof value.strArea === "string" && value.strArea ? `属于${value.strArea}菜系。` : ""}原食谱为英文。${minutes === 20 ? "这次先读步骤、整理材料，20 分钟不含烹饪。" : "先看材料与步骤，实际烹饪时间以食谱和准备情况为准，可以只试其中一个步骤。"}`,
      why: "从一道有材料和步骤的菜开始，试试不熟悉的做法。",
      firstStep: `打开完整食谱，先核对材料${ingredients ? `（例如 ${ingredients}）` : ""}和所需器具，再决定做哪一步。缺材料时先列清单，下次再做也可以。`,
      source: { name: "TheMealDB", url: `https://www.themealdb.com/meal/${value.idMeal}`, action: "打开完整食谱" },
    }, new Date().toISOString());
    return idea && eligible(idea, request) ? [idea] : [];
  });
}

function placeIdeas(payload: unknown, request: DiscoveryRequest): ExplorationIdea[] {
  if (!isObject(payload) || !isObject(payload.query) || !Array.isArray(payload.query.pages)) return [];
  return payload.query.pages.flatMap((value) => {
    if (!isObject(value) || typeof value.title !== "string" || typeof value.extract !== "string" ||
      !/北京/.test(value.extract) || !/公园|图书馆|书店|博物馆|美术馆|植物园/.test(value.title) || /列表|消歧义/.test(value.title)) return [];
    const idea = materialize({
      category: "outside", title: `去看看${value.title.slice(0, 100)}`, minutes: 30,
      description: `${value.extract.slice(0, 300)} 可以先留半小时看一小部分；不包含往返路程。`,
      domain: /公园|植物园/.test(value.title) ? "自然" : "城市文化", moods: ["gentle", "curious", "flow"],
      why: "换一个有名字、有来历的地方走走。",
      firstStep: "先打开地点资料，核对名字和位置，再查当天开放与预约信息，确认后出发。资料页不代表当前正在开放。",
      place: value.title.slice(0, 160), source: { name: "维基百科地点资料", url: value.fullurl, action: "看看地点资料" },
    }, new Date().toISOString());
    return idea && eligible(idea, request) ? [idea] : [];
  });
}

// Public catalog APIs keep online discovery available without a model key.
// All displayed titles come from the current response, never from a preset list.
export async function discoverPublicIdeas(request: DiscoveryRequest, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<ExplorationIdea[]> {
  const searches: Array<Promise<ExplorationIdea[]>> = [];
  const mode = request.filters.mode;
  const seed = Math.abs(request.seed);
  if (["home", "learn", "random"].includes(mode)) {
    const terms = ["历史", "电影", "音乐", "科学", "文学", "艺术", "哲学", "设计", "自然", "建筑", "语言", "摄影", "游戏", "考古", "旅行", "心理学"];
    for (let index = 0; index < 2; index++) {
      const term = terms[(seed + index * 7) % terms.length];
      const params = new URLSearchParams({ term, media: "podcast", entity: "podcast", country: "cn", limit: "30" });
      searches.push(fetchJson(`https://itunes.apple.com/search?${params}`, signal, fetcher).then((value) => podcastIdeas(value, request, term)));
    }
    const subjects = ["poetry", "fiction", "history", "science", "art", "philosophy", "music", "nature", "design", "short stories"];
    const topic = subjects[seed % subjects.length];
    const params = new URLSearchParams({ q: `subject:${topic} language:chi`, sort: "random", limit: "8", fields: "key,title,author_name" });
    searches.push(fetchJson(`https://openlibrary.org/search.json?${params}`, signal, fetcher).then((value) => bookIdeas(value, request, topic)));
  }
  if (["home", "create", "random"].includes(mode)) {
    const letter = "abcdefghijklmnopqrstvw"[seed % 22];
    searches.push(fetchJson(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letter}`, signal, fetcher).then((value) => recipeIdeas(value, request)));
  }
  if (["outside", "random"].includes(mode)) {
    const kind = ["公园", "图书馆", "博物馆", "美术馆", "植物园"][seed % 5];
    const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `北京 ${kind}`, gsrlimit: "10", gsroffset: String((Math.floor(seed / 5) % 4) * 10), prop: "extracts|info", exintro: "1", explaintext: "1", exchars: "320", inprop: "url", format: "json", formatversion: "2", variant: "zh-cn" });
    searches.push(fetchJson(`https://zh.wikipedia.org/w/api.php?${params}`, signal, fetcher).then((value) => placeIdeas(value, request)));
  }
  const results = await Promise.allSettled(searches);
  const ideas = new Map<string, ExplorationIdea>();
  for (const result of results) if (result.status === "fulfilled") for (const idea of result.value) ideas.set(idea.id, idea);
  return [...ideas.values()].slice(0, 24);
}
