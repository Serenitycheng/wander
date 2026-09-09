import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { geocodeBeijingAddress } from "@/lib/server/amap";

export async function POST(request: Request) {
  if (!await getSession()) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { address?: string } | null;
  const address = body?.address?.trim();
  if (!address || address.length > 180) return NextResponse.json({ error: "地址格式不正确" }, { status: 400 });
  try {
    return NextResponse.json(await geocodeBeijingAddress(address));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "AMAP_NOT_CONFIGURED" ? "高德地图尚未配置" : "高德地图暂时不可用" }, { status: message === "AMAP_NOT_CONFIGURED" ? 503 : 502 });
  }
}
