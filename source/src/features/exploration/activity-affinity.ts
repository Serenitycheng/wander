import { activityKind, contentKey, onlineIdeaId, sourceUrl } from "./discovery.ts";
import { activityDomain } from "./activity-diversity.ts";
import type { ExplorationIdea } from "./types.ts";

// Describe content, rather than trusting the model's explanation of why it fits.
// These are comparison features, not a fixed recommendation library.
const topics: Array<[string, RegExp]> = [
  ["摄影作品", /摄影师|摄影作品|摄影集|照片集|摄影展|影集/],
  ["街头摄影", /街拍|街头摄影|街道.*摄影/], ["人像摄影", /人像|肖像.*摄/],
  ["胶片摄影", /胶片|胶卷/], ["摄影器材", /镜头评测|相机评测|器材评测|选购.*相机/],
  ["摄影实践", /构图|拍摄|拍照|光影|布光/],
  ["人物故事", /人物.*(?:故事|经历|生活)|角色|传记|访谈|对白/], ["地域生活", /地方生活|地域|民俗|民族|乡土|生活方式/],
  ["诗词", /诗词|纳兰|诗歌|古诗/], ["小说叙事", /小说|叙事|短篇|散文/],
  ["机械原理", /齿轮|机械|传动|发动机|机构运动/],
  ["AI 生图", /(?:AI|GPT|人工智能|图像生成工具|生图工具).*(?:画面|图片|绘画|生图|场景)|(?:画面|图片|绘画|生图|场景).*(?:AI|GPT|人工智能|图像生成工具|生图工具)|文生图|图像生成/i],
  ["AI 写歌", /(?:AI|GPT|人工智能).*(?:歌词|写歌|音乐)|Suno/i],
  ["歌唱表达", /唱歌|唱首|唱一首|跟唱|声乐|演唱/], ["编曲", /编曲|鼓点|采样|作曲|音符/],
  ["配音", /配音|声音表演|声优/], ["舞蹈", /舞蹈|街舞|跳舞/],
  ["棋类", /象棋|围棋|五子棋/], ["纸牌桌游", /纸牌|桌游|UNO|扑克/i],
  ["解谜", /解谜|谜题|拼图/], ["折纸", /折纸/], ["编织", /编织|刺绣/],
  ["烹饪", /烹饪|食谱|做菜|料理|烘焙/], ["园艺", /园艺|养花|种植/],
];

export const activityTopics = (idea: Pick<ExplorationIdea, "title" | "description">): string[] => {
  const text = `${idea.title} ${idea.description}`;
  return topics.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
};

export function resourceKey(value: unknown): string | null {
  const normalized = sourceUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (/^(chatgpt\.com|suno\.com|www\.suno\.com)$/.test(url.hostname) && url.pathname === "/") return null;
  if (/(^|\.)bilibili\.com$/.test(url.hostname)) {
    const video = url.pathname.match(/\/video\/(BV[\dA-Za-z]{10})/i)?.[1] ?? url.searchParams.get("bvid");
    if (video && /^BV[\dA-Za-z]{10}$/i.test(video)) return `bilibili:BV${video.slice(2)}`;
  }
  if (/(^|\.)instagram\.com$/.test(url.hostname)) return `instagram:${url.pathname.replace(/\/$/, "")}`;
  return normalized;
}

export const resourceId = (idea: ExplorationIdea) => {
  const key = resourceKey(idea.source?.url); return key ? onlineIdeaId(key) : null;
};

// Work identity survives a different activity, publisher page or video about it.
// References disambiguate unquoted names; a prefix is not enough (雪国 ≠ 雪国列车).
export function namedWorkKeys(title: string, references: string[] = []): string[] {
  const normalized = title.normalize("NFKC").toLowerCase();
  const compact = normalized.replace(/\s/g, "");
  const quoted = [...normalized.matchAll(/《([^《》]+)》/g)].map((match) =>
    contentKey(match[1].replace(/[（(](?:[^）)]*(?:版|edition))[^）)]*[）)]/gi, "")));
  const mentioned = references.filter((key) => {
    if (key.length < 2 || !compact.includes(key)) return false;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[《〈「『“\"'：:、，\\s]|的|读|看|听|翻开|阅读|欣赏|玩|唱|跟唱)${escaped}(?=$|[》〉」』”\"'：:、，。\\s(（]|的|里|中|第|导读|解读|读书)`, "u");
    return pattern.test(normalized) || pattern.test(compact);
  });
  return [...new Set([...quoted, ...mentioned].filter((key) => key.length >= 2 && key.length <= 160))];
}

export function sameContent(left: ExplorationIdea, right: ExplorationIdea): boolean {
  const resource = resourceKey(left.source?.url);
  const works = [...namedWorkKeys(left.title), ...namedWorkKeys(right.title)];
  const leftWorks = namedWorkKeys(left.title, works);
  return left.id === right.id || contentKey(left.title) === contentKey(right.title) ||
    Boolean(resource && resource === resourceKey(right.source?.url)) ||
    namedWorkKeys(right.title, works).some((key) => leftWorks.includes(key));
}

const titleTokens = (title: string) => {
  const text = contentKey(title).replace(/看看|试着|试试|一小段|一段|一个|一首|一部|两分钟|脑海中|脑海里|自己/g, "");
  return new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
};
const creativeTask = (idea: ExplorationIdea) => {
  const features = activityTopics(idea);
  if (features.includes("AI 写歌") && /歌词|写歌|一首歌|旋律|编曲|音乐|作曲|Suno/i.test(idea.title)) return "AI 写歌";
  if (features.includes("AI 生图")) return "AI 生图";
  return features.includes("AI 写歌") ? "AI 写歌" : null;
};

const bodyRelease = (idea: ExplorationIdea) =>
  !/^(看|观看|读|阅读|了解)/.test(idea.title) &&
  /慢歌|音乐|歌曲|一首.*歌/.test(`${idea.title} ${idea.description}`) &&
  /肩颈|颈肩|身体|从头到脚|转颈|转头|抬手/.test(`${idea.title} ${idea.description}`) &&
  /松一|松出|放松|拉伸|舒展|僵|转颈|转头|抬手/.test(`${idea.title} ${idea.description}`);

// Distinct named works remain distinct. A renamed open activity needs a break,
// even if the generated ID or a tutorial URL changed.
export function sameExperience(left: ExplorationIdea, right: ExplorationIdea): boolean {
  if (sameContent(left, right)) return true;
  // The action is unchanged when the model calls free stretching music or dance.
  if (bodyRelease(left) && bodyRelease(right)) return true;
  if (namedWorkKeys(left.title).length && namedWorkKeys(right.title).length) return false;
  // Model classifications are not reliable identity boundaries.
  const task = creativeTask(left);
  if (left.approach === "open" && right.approach === "open" && task && task === creativeTask(right)) return true;
  const a = titleTokens(left.title), b = titleTokens(right.title);
  const overlap = [...a].filter((token) => b.has(token)).length;
  if (Math.min(a.size, b.size) >= 4 && 2 * overlap / (a.size + b.size) >= 0.65) return true;
  if (activityKind(left) !== activityKind(right)) return false;
  if (/《/.test(left.title) && /《/.test(right.title)) return false;
  if (left.approach !== "open" || right.approach !== "open") return false;
  const leftTopics = activityTopics({ title: left.title, description: "" });
  const rightTopics = activityTopics({ title: right.title, description: "" });
  return leftTopics.length > 0 && leftTopics.length === rightTopics.length &&
    leftTopics.every((topic) => rightTopics.includes(topic));
}

export function contentAffinity(left: ExplorationIdea, right: ExplorationIdea): number {
  const shared = activityTopics(left).filter((topic) => activityTopics(right).includes(topic)).length;
  const domain = activityDomain(left);
  if (shared) return Math.min(4, shared * 2) + (activityKind(left) === activityKind(right) ? 1 : 0);
  // A single vote about a mechanical video is not a vote on all videos.
  return domain !== "综合" && domain === activityDomain(right) && activityKind(left) === activityKind(right) ? 0.5 : 0;
}

export const isPressuringPitch = (idea: ExplorationIdea) =>
  /别只|别再|认真补|你必须|你应该|一定要/.test(idea.title.replace(/《[^》]+》/g, ""));
