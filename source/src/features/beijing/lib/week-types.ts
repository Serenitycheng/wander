import type { AmapWeather } from "@/features/beijing/lib/amap-types";

export type WeekItem = {
  id: string;
  title: string;
  category: string;
  venue: string;
  dateText: string;
  startDate: string;
  endDate: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  lastVerified: string;
  verification: "official" | "xiaohongshu";
};

export type WeekSearchResult = {
  periodLabel: string;
  query: string;
  generatedAt: string;
  officialItems: WeekItem[];
  xiaohongshuItems: WeekItem[];
  discardedCount: number;
};

export type WeekPageData = {
  weather: AmapWeather | null;
  search: WeekSearchResult | null;
};
