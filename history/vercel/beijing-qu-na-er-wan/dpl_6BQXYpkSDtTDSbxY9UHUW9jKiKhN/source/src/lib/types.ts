export type UserId = "serenity" | "zzz";

export type ViewName =
  | "dashboard"
  | "questionnaire"
  | "recommendations"
  | "route"
  | "library"
  | "week"
  | "history";

export type ActivityCategory =
  | "手作与创作"
  | "运动与挑战"
  | "表演与声音"
  | "自然与户外"
  | "城市与摄影"
  | "食物与感官"
  | "阅读与文化"
  | "科技与创客"
  | "展览与现场"
  | "轻松社交";

export type EnergyLevel = "轻松" | "适中" | "有挑战";

export type Activity = {
  id: string;
  name: string;
  category: ActivityCategory;
  venue: string;
  area: string;
  durationHours: [number, number];
  budgetYuan: [number, number];
  energy: EnergyLevel;
  indoor: boolean;
  seasons: Array<"春" | "夏" | "秋" | "冬" | "四季">;
  tags: string[];
  takeaway: string;
  caveat: string;
  verification: "基础资料" | "需匹配商户" | "需查当周日历";
};

export type ParticipantAnswer = {
  address: string;
  interests: ActivityCategory[];
  vibes: string[];
  vetoes: string[];
  freeText: string;
  aiSummary: string;
  aiConstraints: string[];
  completed: boolean;
};

export type TripDraft = {
  id: string;
  title: string;
  date: string;
  participantIds: UserId[];
  answers: Record<UserId, ParticipantAnswer>;
  availableHours: number;
  budgetPerPerson: number;
  maxOneWayMinutes: number;
  energy: EnergyLevel;
  transport: Array<"公共交通" | "驾车" | "骑行步行" | "市郊铁路">;
  mode: "plan" | "surprise";
  roll: number;
  updatedAt: string;
};

export type Recommendation = {
  activity: Activity;
  score: number;
  reasons: string[];
  warnings: string[];
  live?: boolean;
  sources?: RecommendationSource[];
};

export type RecommendationSource = {
  type: "official" | "xiaohongshu" | "amap";
  name: string;
  url: string;
  note: string;
};

export type RecommendationSearchResult = {
  recommendations: Recommendation[];
  generatedAt: string;
  sourceStatus: "complete" | "partial";
  message: string;
};

export const emptyAnswer = (): ParticipantAnswer => ({
  address: "",
  interests: [],
  vibes: [],
  vetoes: [],
  freeText: "",
  aiSummary: "",
  aiConstraints: [],
  completed: false,
});

export const createTripDraft = (): TripDraft => ({
  id: `trip-${Date.now()}`,
  title: "下个周末去哪儿",
  date: "",
  participantIds: ["serenity", "zzz"],
  answers: {
    serenity: emptyAnswer(),
    zzz: emptyAnswer(),
  },
  availableHours: 5,
  budgetPerPerson: 400,
  maxOneWayMinutes: 90,
  energy: "适中",
  transport: ["公共交通", "驾车", "市郊铁路"],
  mode: "plan",
  roll: 0,
  updatedAt: new Date().toISOString(),
});
