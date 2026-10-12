export type SpaceOwner = "serenity" | "zzz";
export type ExplorationCategory = "outside" | "home" | "learn" | "create";
export type ExplorationMode = ExplorationCategory | "random";
export type ExplorationSetting = "outside" | "home" | "any";
export type ExplorationIntent = "any" | "learn" | "create";
export type TimeWindow = "short" | "hour" | "medium" | "half-day" | "any";
export type ExplorationMood = "gentle" | "curious" | "focused" | "flow";
export type ExplorationTheme = "sage" | "lavender";
export type ExplorationPage =
  "home" | "explore" | "favorites" | "records" | "me";
export type ExplorationAppearance = {
  tone?: string;
  // Retained for reading older v1 storage and backups; new choices use tone.
  pageColors?: Partial<Record<ExplorationPage, string>>;
  colorSchemes?: Array<{ id: string; name: string; tone: string }>;
};
export type ExplorationProfile = {
  preferenceVersion?: 1 | 2 | 3;
  personalized: boolean;
  interests: string;
  readingList: string;
  allowFeeds: boolean;
  preferenceNotes?: string;
  mutedTopics?: string;
};
export const activityForms = ["阅读", "观看", "聆听", "歌唱", "音乐创作", "游戏", "舞蹈", "运动", "手工", "绘画", "书写", "社交", "出门", "交互探索", "知识", "烹饪"] as const;
export type ActivityForm = typeof activityForms[number];
export type RecommendationAngle = "familiar" | "surprise" | "play";
export type ExplorationFeedback = { ideaId: string; vote: "more" | "less"; updatedAt: string };
// Minimal exclusion evidence; not a cached recommendation or a detail page.
export type SuppressedIdea = Pick<ExplorationIdea, "id" | "category" | "title" | "description" | "approach" | "form" | "domain" | "source"> & { reason: "cleanup" | "dislike" };

export type ExplorationFilters = {
  mode: ExplorationMode;
  time: TimeWindow;
  mood: ExplorationMood;
  // Optional so existing spaces and backups keep their original behavior.
  setting?: ExplorationSetting;
  intent?: ExplorationIntent;
};

export type ExplorationIdea = {
  id: string;
  category: ExplorationCategory;
  title: string;
  description: string;
  minutes: number;
  moods: ExplorationMood[];
  why: string;
  firstStep: string;
  place?: string;
  search?: string;
  source?: { name: string; url: string; action?: string };
  domain?: string;
  approach?: "open" | "specific";
  discoveredAt?: string;
  angle?: RecommendationAngle;
  form?: ActivityForm;
  origin?: "deepseek" | "public";
};

export type ExplorationSuggestion = {
  idea: ExplorationIdea;
  reasons: string[];
  angle?: RecommendationAngle;
};
export type ExplorationFavorite = {
  ideaId: string;
  addedAt: string;
  soon: boolean;
};
export type ExplorationRecord = {
  id: string;
  ideaId: string | null;
  category: ExplorationCategory;
  title: string;
  feeling: "" | "relaxed" | "surprised" | "absorbed" | "ordinary";
  reflection: string;
  again: "yes" | "maybe" | "no";
  date: string;
  place: string;
  createdAt: string;
};

export type ExplorationSpace = {
  schemaVersion: 1;
  owner: SpaceOwner;
  revision: number;
  updatedAt: string | null;
  preferences: ExplorationFilters &
    ExplorationAppearance & { theme: ExplorationTheme; profile?: ExplorationProfile };
  favorites: ExplorationFavorite[];
  records: ExplorationRecord[];
  shownIdeaIds: string[];
  shownWorkKeys?: string[];
  discoveredIdeas: ExplorationIdea[];
  feedback?: ExplorationFeedback[];
  suppressedIdeas?: SuppressedIdea[];
  recommendationCleanup?: { version: 1; completedAt: string; active: boolean };
};

export const modes: Array<{
  id: ExplorationMode;
  label: string;
  note: string;
}> = [
  { id: "outside", label: "出去走走", note: "换条路，看看城市" },
  { id: "home", label: "在家探索", note: "熟悉的房间，新鲜的事" },
  { id: "learn", label: "学点东西", note: "让好奇心带一小段路" },
  { id: "create", label: "做点东西", note: "一个念头，一点小创作" },
  { id: "random", label: "完全随机", note: "把方向交给偶然" },
];

export const categoryLabels: Record<ExplorationCategory, string> = {
  outside: "出去走走",
  home: "在家探索",
  learn: "学点东西",
  create: "做点东西",
};
export const timeOptions: Array<{ id: TimeWindow; label: string }> = [
  { id: "short", label: "10～30 分钟" },
  { id: "hour", label: "30 分钟～1.5 小时" },
  { id: "medium", label: "1～2 小时" },
  { id: "half-day", label: "半天" },
  { id: "any", label: "无所谓" },
];
export const moodOptions: Array<{ id: ExplorationMood; label: string }> = [
  { id: "gentle", label: "想轻松一点" },
  { id: "curious", label: "想有点新鲜感" },
  { id: "focused", label: "想认真投入一点" },
  { id: "flow", label: "完全随缘" },
];
export const feelingOptions: Array<{
  id: ExplorationRecord["feeling"];
  label: string;
}> = [
  { id: "relaxed", label: "放松了一点" },
  { id: "surprised", label: "有点惊喜" },
  { id: "absorbed", label: "很投入" },
  { id: "ordinary", label: "普普通通也可以" },
];
export const defaultFilters: ExplorationFilters = {
  mode: "random",
  time: "any",
  mood: "flow",
};

export const isCategory = (value: unknown): value is ExplorationCategory =>
  value === "outside" ||
  value === "home" ||
  value === "learn" ||
  value === "create";
export const isMode = (value: unknown): value is ExplorationMode =>
  value === "random" || isCategory(value);
export const isTimeWindow = (value: unknown): value is TimeWindow =>
  timeOptions.some((item) => item.id === value);
export const isMood = (value: unknown): value is ExplorationMood =>
  moodOptions.some((item) => item.id === value);
export const isSetting = (value: unknown): value is ExplorationSetting =>
  value === "outside" || value === "home" || value === "any";
export const isIntent = (value: unknown): value is ExplorationIntent =>
  value === "any" || value === "learn" || value === "create";

export function minutesLabel(minutes: number) {
  if (minutes < 60) return `约 ${minutes} 分钟`;
  if (minutes % 60 === 0) return `约 ${minutes / 60} 小时`;
  return `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}
