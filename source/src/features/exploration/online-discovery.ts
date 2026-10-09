import { contentKey, isChildrensPodcast, isFeedIdea, isLowQualityVideo, isObject, onlineIdeaId, parseDiscoveredIdea, sourceUrl } from "./discovery.ts";
import { timeLimits } from "./generator.ts";
import type { ExplorationFilters, ExplorationIdea } from "./types.ts";
import { discoveryTopics } from "./discovery-topics.ts";
import { readingReferences } from "./profile.ts";
import type { DiscoveryPersonalization } from "./profile.ts";

export type DiscoveryRequest = {
  filters: ExplorationFilters;
  seed: number;
  excludeIds: string[];
  excludeTitles: string[];
  avoidFormats?: Array<"feed">;
  allowFeeds?: boolean;
  personalization?: DiscoveryPersonalization;
};
type Fetcher = typeof fetch;

export class DiscoveryUpstreamError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`DISCOVERY_UPSTREAM_${status}`);
    this.name = "DiscoveryUpstreamError";
    this.status = status;
  }
}

export async function fetchJson(url: string, signal: AbortSignal, fetcher: Fetcher, init?: RequestInit): Promise<unknown> {
  const response = await fetcher(url, {
    ...init, cache: "no-store", signal,
    headers: { "User-Agent": "Manyou/2.0 (personal exploration; low-volume search)", ...init?.headers },
  });
  if (!response.ok) throw new DiscoveryUpstreamError(response.status);
  return response.json();
}

const eligible = (idea: ExplorationIdea, request: DiscoveryRequest) =>
  (request.filters.mode === "random" || request.filters.mode === idea.category) &&
  idea.minutes <= timeLimits[request.filters.time] && !request.excludeIds.includes(idea.id) &&
  !((!request.allowFeeds || request.avoidFormats?.includes("feed")) && isFeedIdea(idea));

function materialize(value: unknown, date: string): ExplorationIdea | null {
  if (!isObject(value) || !isObject(value.source)) return null;
  const url = sourceUrl(value.source.url);
  return url ? parseDiscoveredIdea({ ...value, id: onlineIdeaId(url), discoveredAt: date }) : null;
}

// A claimed source URL must occur in an actual server-side web-search result.
// Model text on its own is never treated as proof that a search took place.
export function parseSearchDiscovery(payload: unknown, request: DiscoveryRequest): ExplorationIdea[] {
  return inspectSearchDiscovery(payload, request).ideas;
}

export function inspectSearchDiscovery(payload: unknown, request: DiscoveryRequest, catalogIdeas: ExplorationIdea[] = []): {
  ideas: ExplorationIdea[];
  searchResultCount: number;
  issue?: "no_search_results" | "invalid_response" | "no_new_results";
} {
  if (!isObject(payload) || !Array.isArray(payload.content))
    return { ideas: [], searchResultCount: 0, issue: "invalid_response" };
  const verified = new Set<string>();
  for (const block of payload.content) {
    if (!isObject(block) || block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (!isObject(result) || result.type !== "web_search_result") continue;
      const url = sourceUrl(result.url);
      if (url) verified.add(url);
    }
  }
  if (!verified.size) return { ideas: [], searchResultCount: 0, issue: "no_search_results" };
  const searchResultCount = verified.size;
  // Public catalog entries were also obtained and validated by this request.
  // A model still must perform a real web search before using that context.
  for (const idea of catalogIdeas) if (idea.source) verified.add(idea.source.url);
  const messages = payload.content.filter((block) => isObject(block) && block.type === "text" && typeof block.text === "string");
  for (const message of messages.reverse()) {
    const raw = String(message.text);
    try {
      const decoded: unknown = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      if (!isObject(decoded) || !Array.isArray(decoded.ideas)) continue;
      const ideas = new Map<string, ExplorationIdea>();
      for (const value of decoded.ideas.slice(0, 12)) {
        const idea = materialize(value, new Date().toISOString());
        if (idea?.source && verified.has(idea.source.url) && !isLowQualityVideo(idea) && eligible(idea, request) &&
          !request.excludeTitles.some((title) => contentKey(title) === contentKey(idea.title))) ideas.set(idea.id, idea);
      }
      return { ideas: [...ideas.values()], searchResultCount,
        ...(ideas.size ? {} : { issue: "no_new_results" as const }) };
    } catch { /* A preamble or malformed JSON is not a usable discovery. */ }
  }
  return { ideas: [], searchResultCount, issue: "invalid_response" };
}

function videoIdeas(payload: unknown, request: DiscoveryRequest): ExplorationIdea[] {
  if (!isObject(payload) || payload.code !== 0 || !isObject(payload.data) || !Array.isArray(payload.data.result)) return [];
  const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  return payload.data.result.flatMap((value) => {
    if (!isObject(value) || typeof value.bvid !== "string" || !/^BV[0-9A-Za-z]{10}$/.test(value.bvid) ||
      typeof value.title !== "string" || !value.title.trim() || typeof value.author !== "string") return [];
    const title = plain(value.title).slice(0, 115);
    const author = plain(value.author).slice(0, 60);
    const category = request.filters.mode === "learn" ? "learn" : request.filters.mode === "create" ? "create" : "home";
    const duration = typeof value.duration === "string" ? value.duration : "";
    const parts = /^\d{1,3}:\d{2}(?::\d{2})?$/.test(duration) ? duration.split(":").map(Number) : [];
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    const minutes = seconds ? Math.max(5, Math.min(25, Math.ceil(seconds / 60))) : 20;
    const description = typeof value.description === "string" ? plain(value.description).split(/\d{1,2}:\d{2}:\d{2}/)[0].slice(0, 120) : "";
    const idea = materialize({
      category, title: `${category === "create" ? "跟着视频试试" : "看看"}《${title}》`, minutes,
      approach: "specific", domain: category === "create" ? "视频教程" : "视频",
      description: `${author}发布的视频。${description ? `${description} ` : ""}${duration ? `视频标注时长 ${duration}。` : ""}可以先看让你感兴趣的一段，卡片上的时间只是开始观看或尝试的参考。`,
      moods: ["gentle", "curious", "focused", "flow"],
      why: `从${author}的这段内容里，看看一个具体的故事、想法或做法。`,
      firstStep: category === "create" ? "打开视频先看看做法，确认手边的材料，再选你想试的部分。" : "打开视频，看简介或章节，选你想看的部分开始。也可以顺着创作者找其他内容。",
      source: { name: "哔哩哔哩", url: `https://www.bilibili.com/video/${value.bvid}`, action: "打开 B 站视频" },
    }, new Date().toISOString());
    return idea && !isLowQualityVideo(idea) && eligible(idea, request) ? [idea] : [];
  });
}

function podcastIdeas(payload: unknown, request: DiscoveryRequest, topic: string): ExplorationIdea[] {
  if (!isObject(payload) || !Array.isArray(payload.results)) return [];
  const category = request.filters.mode === "learn" ? "learn" : "home";
  return payload.results.flatMap((value, index) => {
    if (!isObject(value) || value.kind !== "podcast" || typeof value.collectionName !== "string" ||
      typeof value.artistName !== "string" || /儿童|幼儿|宝宝|早教|胎教|儿歌|睡前故事|[0-9]-[0-9]岁|抖音|快手|破亿|爆火|步频|车载|串烧/.test(value.collectionName)) return [];
    const title = value.collectionName.slice(0, 100);
    const author = value.artistName.slice(0, 80);
    const open = (request.seed + index) % 4 === 0;
    const idea = materialize({
      category, title: open ? `听听${author}的播客` : `听一期《${title}》`, minutes: 25,
      approach: open ? "open" : "specific",
      description: open ? `可以从《${title}》的节目列表看看有什么感兴趣的话题，也可以沿着这个方向找别的节目。听什么、听多久，都由你来选。`
        : `这是${author}的播客。打开节目列表，挑一期你还没听过的内容，先听 25 分钟；不要求听完整期。`,
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
  return payload.docs.flatMap((value, index) => {
    if (!isObject(value) || typeof value.key !== "string" || !/^\/works\/OL\d+W$/.test(value.key) ||
      typeof value.title !== "string" || !Array.isArray(value.author_name)) return [];
    const author = value.author_name.filter((item): item is string => typeof item === "string").join("、").slice(0, 100);
    const open = Boolean(author) && (request.seed + index) % 3 === 0;
    const idea = materialize({
      category: request.filters.mode === "learn" ? "learn" : "home",
      title: open ? `读读${author}的作品` : `翻开《${value.title.slice(0, 110)}》`, minutes: 25, domain: "阅读",
      approach: open ? "open" : "specific",
      description: open ? `发现了《${value.title.slice(0, 110)}》。可以先看简介、试读，也可以找这位作者其他让你好奇的作品，不必限定读哪一本或读完多少。`
        : `${author ? `${author}的作品。` : ""}从${topic}里发现的一本书。先看简介、目录或你能找到的试读，再挑一段感兴趣的内容；25 分钟只是选读时间。`,
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
export async function discoverPublicIdeas(request: DiscoveryRequest, signal: AbortSignal, fetcher: Fetcher = fetch,
  onIdeas?: (ideas: ExplorationIdea[]) => void): Promise<ExplorationIdea[]> {
  const searches: Array<Promise<ExplorationIdea[]>> = [];
  const mode = request.filters.mode;
  const seed = Math.abs(request.seed);
  if (["home", "learn", "create", "random"].includes(mode)) {
    const directions = discoveryTopics(mode, seed, request.personalization);
    for (let index = 0; index < 2; index++) {
      const params = new URLSearchParams({ search_type: "video", keyword: directions[index], page: String(1 + Math.floor(seed / 17) % 4), order: "totalrank" });
      searches.push(fetchJson(`https://api.bilibili.com/x/web-interface/search/type?${params}`, signal, fetcher, {
        headers: { Referer: "https://www.bilibili.com/", "User-Agent": "Mozilla/5.0" },
      }).then((value) => videoIdeas(value, request)));
    }
  }
  if (["home", "learn", "random"].includes(mode)) {
    const terms = ["历史", "电影", "音乐", "科学", "文学", "艺术", "哲学", "设计", "自然", "建筑", "语言", "摄影", "游戏", "考古", "旅行", "心理学"];
    for (let index = 0; request.allowFeeds && !request.avoidFormats?.includes("feed") && index < 2; index++) {
      const term = terms[(seed + index * 7) % terms.length];
      const params = new URLSearchParams({ term, media: "podcast", entity: "podcast", country: "cn", limit: "30" });
      searches.push(fetchJson(`https://itunes.apple.com/search?${params}`, signal, fetcher).then((value) => podcastIdeas(value, request, term)));
    }
    const subjects = ["poetry", "fiction", "history", "science", "art", "philosophy", "music", "nature", "design", "short stories"];
    const topic = subjects[seed % subjects.length];
    const references = readingReferences(request.personalization);
    const reference = references.length && seed % 3 !== 2 ? references[Math.floor(seed / 3) % references.length] : null;
    const params = new URLSearchParams({ q: reference ? `title:${reference}` : `subject:${topic} language:chi`, sort: "random", limit: "8", fields: "key,title,author_name" });
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
  const completed = new Map<string, ExplorationIdea>();
  const results = await Promise.allSettled(searches.map(async (search) => {
    const ideas = await search;
    if (!signal.aborted && ideas.length) {
      for (const idea of ideas) completed.set(idea.id, idea);
      onIdeas?.([...completed.values()].slice(0, 24));
    }
    return ideas;
  }));
  const pools = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const ideas = new Map<string, ExplorationIdea>();
  // Interleave sources before limiting the payload. A large first podcast
  // response must not hide all later books, recipes or places.
  for (let index = 0; pools.some((pool) => index < pool.length) && ideas.size < 24; index++) {
    for (const pool of pools) {
      const idea = pool[index];
      if (idea && !ideas.has(idea.id)) ideas.set(idea.id, idea);
      if (ideas.size === 24) break;
    }
  }
  return [...ideas.values()];
}
