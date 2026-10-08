import { NextResponse } from "next/server";
import type { AmapTripPlan, TravelEstimate, TravelMode } from "@/features/beijing/lib/amap-types";
import { estimateRoute, findMeetingPoint, resolveBeijingAddress, resolveBeijingPlace } from "@/lib/server/amap";

const modes: TravelMode[] = ["transit", "driving", "walking", "bicycling"];

const unavailable = (mode: TravelMode): TravelEstimate => ({
  mode,
  available: false,
  durationMinutes: null,
  distanceKm: null,
  summary: "暂无可用路线",
  suburbanRail: [],
  polyline: [],
});

const safeEstimate = async (origin: { lng: number; lat: number }, destination: { lng: number; lat: number }, mode: TravelMode) => {
  try {
    return await estimateRoute(origin, destination, mode);
  } catch {
    return unavailable(mode);
  }
};

type PlanBody = {
  destinationQuery?: unknown;
  destinationLabel?: unknown;
  origins?: unknown;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as PlanBody | null;
  const destinationQuery = typeof body?.destinationQuery === "string" ? body.destinationQuery.trim() : "";
  const destinationLabel = typeof body?.destinationLabel === "string" ? body.destinationLabel.trim() : destinationQuery;
  const origins = Array.isArray(body?.origins)
    ? body.origins.filter((item): item is { id: "serenity" | "zzz"; name: string; address: string } => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return (value.id === "serenity" || value.id === "zzz") && typeof value.name === "string" && typeof value.address === "string";
    }).map((item) => ({ ...item, name: item.name.trim().slice(0, 30), address: item.address.trim().slice(0, 180) }))
    : [];

  if (!destinationQuery || destinationQuery.length > 180 || !origins.length || origins.length > 5 || origins.some((item) => !item.address)) {
    return NextResponse.json({ error: "请先填写每个人的具体出发地址，并选择目的地。" }, { status: 400 });
  }

  try {
    const [destination, ...resolvedOrigins] = await Promise.all([
      resolveBeijingPlace(destinationQuery),
      ...origins.map((item) => resolveBeijingAddress(item.address)),
    ]);
    const meetingPoint = await findMeetingPoint([
      ...resolvedOrigins,
      ...resolvedOrigins.map(() => destination),
    ]);

    const participants = await Promise.all(origins.map(async (participant, index) => {
      const origin = resolvedOrigins[index];
      const [estimates, toMeeting] = await Promise.all([
        Promise.all(modes.map((mode) => safeEstimate(origin, destination, mode))),
        safeEstimate(origin, meetingPoint, "transit"),
      ]);
      return {
        id: participant.id,
        name: participant.name,
        origin,
        estimates: Object.fromEntries(estimates.map((estimate) => [estimate.mode, estimate])) as AmapTripPlan["participants"][number]["estimates"],
        toMeeting,
      };
    }));

    const meetingToDestination = await safeEstimate(meetingPoint, destination, "transit");
    const warnings = [
      "路线为高德当前估算，不是详细时间安排；临出发前请重新确认。",
      "市郊铁路只识别路线中出现的线路，具体班次与末班车仍需查看官方时刻表。",
    ];
    if (destination.name !== destinationLabel) warnings.unshift(`高德将“${destinationLabel}”匹配为“${destination.name}”，请确认是否是你想去的地点。`);

    const plan: AmapTripPlan = {
      generatedAt: new Date().toISOString(),
      destination,
      destinationNeedsConfirmation: destination.name !== destinationLabel,
      meetingPoint,
      meetingToDestination,
      participants,
      warnings,
    };
    return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const notConfigured = message === "AMAP_NOT_CONFIGURED";
    const notFound = message === "AMAP_ADDRESS_NOT_FOUND";
    return NextResponse.json(
      { error: notConfigured ? "高德 API 尚未配置。" : notFound ? "有地址无法定位，请补充到街道、地标或小区。" : "高德路线暂时无法生成，请稍后重试。" },
      { status: notConfigured ? 503 : notFound ? 422 : 502 },
    );
  }
}
