import { jsonSchema } from "ai";
import { NextResponse } from "next/server";
import type { WeekItem, WeekSearchResult } from "@/lib/week-types";

type RawWeekItem = Omit<WeekItem, "id" | "lastVerified" | "verification">;
type RawWeekResult = { officialItems: RawWeekItem[]; xiaohongshuItems: RawWeekItem[] };

const itemProperties = {
  title: { type: "string" },
  category: { type: "string" },
  venue: { type: "string" },
  dateText: { type: "string" },
  startDate: { type: "string" },
  endDate: { type: "string" },
  summary: { type: "string" },
  sourceName: { type: "string" },
  sourceUrl: { type: "string" },
} as const;

const isRawWeekItem = (value: unknown): value is RawWeekItem => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(itemProperties).every((key) => typeof item[key] === "string");
};

const weekSchema = jsonSchema<RawWeekResult>({
  type: "object",
  additionalProperties: false,
  properties: {
    officialItems: { type: "array", items: { type: "object", additionalProperties: false, properties: itemProperties, required: Object.keys(itemProperties) } },
    xiaohongshuItems: { type: "array", items: { type: "object", additionalProperties: false, properties: itemProperties, required: Object.keys(itemProperties) } },
  },
  required: ["officialItems", "xiaohongshuItems"],
}, {
  validate: (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { success: false, error: new Error("INVALID_WEEK_DATA") };
    const result = value as Record<string, unknown>;
    if (!Array.isArray(result.officialItems) || !result.officialItems.every(isRawWeekItem) || !Array.isArray(result.xiaohongshuItems) || !result.xiaohongshuItems.every(isRawWeekItem)) {
      return { success: false, error: new Error("INVALID_WEEK_DATA") };
    }
    return { success: true, value: result as RawWeekResult };
  },
});

type DeepSeekResponse = {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  choices?: Array<{ message?: { content?: string } }>;
};

const officialHosts = [
  "dpm.org.cn",
  "chnmuseum.cn",
  "namoc.org",
  "cstm.org.cn",
  "bjartmuseum.com",
  "bjp.org.cn",
  "bjd.com.cn",
  "beijing.gov.cn",
  "visitbeijing.com.cn",
  "whtbj.gov.cn",
];

const validUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
};

const isOfficial = (url: URL) => url.hostname.endsWith(".gov.cn") || officialHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
const isXiaohongshu = (url: URL) => url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com");
const beijingDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const displayDate = (date: string) => date.replace(/-/g, ".");

const textFromResponse = (payload: DeepSeekResponse) => {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output || []) {
    const text = item.content?.find((content) => content.type === "output_text" && content.text)?.text;
    if (text) return text;
  }
  return payload.choices?.[0]?.message?.content || "";
};

const cleanItem = (item: RawWeekItem, verification: WeekItem["verification"], index: number, now: string): WeekItem => ({
  id: `${verification}-${index}-${item.title.slice(0, 16)}`,
  title: item.title.trim().slice(0, 100),
  category: item.category.trim().slice(0, 30),
  venue: item.venue.trim().slice(0, 80),
  dateText: item.dateText.trim().slice(0, 80),
  startDate: item.startDate.trim().slice(0, 10),
  endDate: item.endDate.trim().slice(0, 10),
  summary: item.summary.trim().slice(0, 240),
  sourceName: item.sourceName.trim().slice(0, 60),
  sourceUrl: item.sourceUrl.trim(),
  lastVerified: now,
  verification,
});

const cache = new Map<string, { expiresAt: number; value: WeekSearchResult }>();
const requestWindows = new Map<string, { count: number; resetsAt: number }>();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 80) : "";
  const searchQuery = query || "北京本周展览 演出 快闪 市集 花期 季节活动";
  const cached = cache.get(searchQuery);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value, { headers: { "Cache-Control": "private, max-age=300" } });

  const clientId = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const currentWindow = requestWindows.get(clientId);
  const nextWindow = !currentWindow || currentWindow.resetsAt <= now ? { count: 1, resetsAt: now + 60 * 60_000 } : { ...currentWindow, count: currentWindow.count + 1 };
  requestWindows.set(clientId, nextWindow);
  if (nextWindow.count > 6) return NextResponse.json({ error: "这一小时已经刷新过多次，请稍后再试。" }, { status: 429 });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DeepSeek API Key 尚未配置，无法联网检索本周内容。" }, { status: 503 });

  const startDate = beijingDate(new Date());
  const endDate = beijingDate(new Date(now + 6 * 86_400_000));
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const schema = await weekSchema.jsonSchema;

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: "你负责为私人北京周末决策工具检索公开网页。只返回实际搜索到、有可打开来源页面的内容。禁止补全、猜测或把聚合转载当官方。小红书内容只能作为未核验用户线索。" },
          { role: "user", content: `当前北京时间范围是 ${startDate} 至 ${endDate}。请联网搜索“${searchQuery}”。officialItems 只收录政府、场馆、主办方自有官网发布且在这个日期范围内仍可参加的北京活动；优先展览、演出、快闪、市集、花期和季节项目。xiaohongshuItems 只收录可公开访问的 xiaohongshu.com 页面，用作体验线索，不视为事实来源。每项必须给直接来源 URL、地点、日期；无法确定起止日期时不要收录。最多各 6 项，没有合格内容就返回空数组。` },
        ],
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
        text: { format: { type: "json_schema", name: "beijing_week_events", strict: true, schema } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return NextResponse.json({ error: `联网检索暂时没有成功响应（${response.status}）。` }, { status: 502 });

    const rawText = textFromResponse(await response.json() as DeepSeekResponse);
    const parsed = JSON.parse(rawText) as unknown;
    const validation = await weekSchema.validate?.(parsed);
    if (!validation?.success) throw new Error("INVALID_WEEK_DATA");

    let discardedCount = 0;
    const officialItems = validation.value.officialItems.flatMap((item, index) => {
      const url = validUrl(item.sourceUrl);
      if (!url || !isOfficial(url) || item.endDate < startDate || item.startDate > endDate) { discardedCount += 1; return []; }
      return [cleanItem(item, "official", index, new Date().toISOString())];
    });
    const xiaohongshuItems = validation.value.xiaohongshuItems.flatMap((item, index) => {
      const url = validUrl(item.sourceUrl);
      if (!url || !isXiaohongshu(url) || item.endDate < startDate || item.startDate > endDate) { discardedCount += 1; return []; }
      return [cleanItem(item, "xiaohongshu", index, new Date().toISOString())];
    });
    const result: WeekSearchResult = {
      periodLabel: `${displayDate(startDate)}—${displayDate(endDate)}`,
      query: searchQuery,
      generatedAt: new Date().toISOString(),
      officialItems,
      xiaohongshuItems,
      discardedCount,
    };
    cache.set(searchQuery, { expiresAt: Date.now() + 30 * 60_000, value: result });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json({ error: timedOut ? "联网检索超时，请稍后再试。" : "检索结果未通过来源校验，本次没有展示。" }, { status: 502 });
  }
}
