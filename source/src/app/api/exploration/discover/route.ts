import { NextResponse } from "next/server";
import { isObject } from "@/features/exploration/discovery";
import { isMode, isMood, isTimeWindow } from "@/features/exploration/types";
import { getSession } from "@/lib/server/session";
import { discoverOnlineIdeas } from "@/lib/server/exploration-discovery";
import type { DiscoveryRequest } from "@/lib/server/exploration-discovery";

export const maxDuration = 45;
const requests = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "请从漫游页面发起探索。" }, { status: 403 });
  const session = await getSession();
  if ((process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" || process.env.AUTH_SECRET) && !session)
    return NextResponse.json({ error: "登录后再发现新的内容。" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 48000) return NextResponse.json({ error: "本次探索信息过多。" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!isObject(body) || !isObject(body.filters) || !isMode(body.filters.mode) || !isTimeWindow(body.filters.time) || !isMood(body.filters.mood) ||
    !Number.isSafeInteger(body.seed) || Number(body.seed) < 0 || Number(body.seed) > 2147483647 ||
    !Array.isArray(body.excludeIds) || body.excludeIds.length > 600 || !body.excludeIds.every((id) => typeof id === "string" && id.length <= 100) ||
    !Array.isArray(body.excludeTitles) || body.excludeTitles.length > 60 || !body.excludeTitles.every((title) => typeof title === "string" && title.length <= 160))
    return NextResponse.json({ error: "探索条件不完整。" }, { status: 400 });
  const now = Date.now();
  for (const [key, value] of requests) if (now - value.startedAt > 60000) requests.delete(key);
  const key = session?.userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const counter = requests.get(key) ?? { startedAt: now, count: 0 };
  if (counter.count >= 12) return NextResponse.json({ error: "歇几秒，再看看新的内容。" }, { status: 429, headers: { "Retry-After": "10" } });
  counter.count++;
  requests.set(key, counter);
  if (requests.size > 1000) requests.delete(requests.keys().next().value!);
  const input: DiscoveryRequest = {
    filters: { mode: body.filters.mode, time: body.filters.time, mood: body.filters.mood },
    seed: Number(body.seed), excludeIds: body.excludeIds, excludeTitles: body.excludeTitles,
  };
  const ideas = await discoverOnlineIdeas(input, request.signal).catch(() => []);
  return NextResponse.json({ ideas, status: ideas.length ? "online" : "unavailable" }, { headers: { "Cache-Control": "no-store" } });
}
