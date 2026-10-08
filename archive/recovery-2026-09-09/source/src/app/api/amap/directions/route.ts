import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getAmapDirections } from "@/lib/server/amap";

const coordinate = /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,2}(\.\d+)?$/;
const allowedModes = ["transit", "driving", "walking", "bicycling"] as const;

export async function POST(request: Request) {
  if (!await getSession()) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { origin?: string; destination?: string; mode?: typeof allowedModes[number] } | null;
  if (!body?.origin || !body.destination || !body.mode || !coordinate.test(body.origin) || !coordinate.test(body.destination) || !allowedModes.includes(body.mode)) {
    return NextResponse.json({ error: "路线参数不正确" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getAmapDirections(body.origin, body.destination, body.mode));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "AMAP_NOT_CONFIGURED" ? "高德地图尚未配置" : "高德地图暂时不可用" }, { status: message === "AMAP_NOT_CONFIGURED" ? 503 : 502 });
  }
}
