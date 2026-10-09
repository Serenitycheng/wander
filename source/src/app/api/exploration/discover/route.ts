import { NextResponse } from "next/server";
import { isObject } from "@/features/exploration/discovery";
import { isMode, isMood, isTimeWindow } from "@/features/exploration/types";
import { getSession } from "@/lib/server/session";
import { discoverOnlineIdeas } from "@/lib/server/exploration-discovery";
import type { DiscoveryRequest } from "@/lib/server/exploration-discovery";
import { parsePersonalization } from "@/features/exploration/profile";

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
  const personalization = isObject(body) && body.personalization !== undefined ? parsePersonalization(body.personalization) : undefined;
  if (!isObject(body) || !isObject(body.filters) || !isMode(body.filters.mode) || !isTimeWindow(body.filters.time) || !isMood(body.filters.mood) ||
    personalization === null || (body.allowFeeds !== undefined && typeof body.allowFeeds !== "boolean") ||
    (body.recentActivities !== undefined && (!Array.isArray(body.recentActivities) || body.recentActivities.length > 12 ||
      !body.recentActivities.every((item) => isObject(item) && typeof item.form === "string" && item.form.length <= 60 && typeof item.domain === "string" && item.domain.length <= 60 &&
        (item.title === undefined || (typeof item.title === "string" && item.title.length <= 160)) &&
        (item.approach === undefined || item.approach === "open" || item.approach === "specific")))) ||
    !Number.isSafeInteger(body.seed) || Number(body.seed) < 0 || Number(body.seed) > 2147483647 ||
    !Array.isArray(body.excludeIds) || body.excludeIds.length > 600 || !body.excludeIds.every((id) => typeof id === "string" && id.length <= 100) ||
    !Array.isArray(body.excludeTitles) || body.excludeTitles.length > 60 || !body.excludeTitles.every((title) => typeof title === "string" && title.length <= 160) ||
    (body.excludeWorks !== undefined && (!Array.isArray(body.excludeWorks) || body.excludeWorks.length > 120 || !body.excludeWorks.every((key) => typeof key === "string" && key.length > 0 && key.length <= 160))) ||
    (body.avoidFormats !== undefined && (!Array.isArray(body.avoidFormats) || body.avoidFormats.length > 1 || !body.avoidFormats.every((format) => format === "feed"))))
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
    ...(body.excludeWorks ? { excludeWorks: body.excludeWorks as string[] } : {}),
    avoidFormats: body.avoidFormats as Array<"feed"> | undefined,
    allowFeeds: body.allowFeeds === true,
    ...(Array.isArray(body.recentActivities) ? { recentActivities: body.recentActivities.map((item) => ({ form: item.form, domain: item.domain,
      ...(item.title ? { title: item.title } : {}), ...(item.approach ? { approach: item.approach } : {}) })) } : {}),
    ...(personalization ? { personalization } : {}),
  };
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const stream = new ReadableStream<Uint8Array>({
      start(output) {
        const send = (value: unknown) => {
          if (!signal.aborted) output.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        };
        void discoverOnlineIdeas(input, signal, send).catch(() => {
          if (!signal.aborted) send({ ideas: [], provider: "none", issue: "provider_unavailable" });
        }).finally(() => {
          if (!signal.aborted) output.close();
        });
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  }
  const result = await discoverOnlineIdeas(input, request.signal).catch(() => {
    if (request.signal.aborted) return { ideas: [], provider: "none", issue: "timeout" };
    console.warn(JSON.stringify({ event: "manyou_discovery", provider: "none", issue: "provider_unavailable" }));
    return { ideas: [], provider: "none", issue: "provider_unavailable" };
  });
  return NextResponse.json({ ...result, status: result.ideas.length ? "online" : "unavailable" }, { headers: { "Cache-Control": "no-store" } });
}
