import { NextResponse } from "next/server";
import { getBeijingWeather } from "@/lib/server/amap";

export async function GET() {
  try {
    return NextResponse.json(await getBeijingWeather(), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: message === "AMAP_NOT_CONFIGURED" ? "高德天气尚未配置" : "天气暂时无法获取" },
      { status: message === "AMAP_NOT_CONFIGURED" ? 503 : 502 },
    );
  }
}
