import { NextResponse } from "next/server";

const allowedVersion = /^(v3|v4|v5)$/;

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const securityCode = process.env.AMAP_SECURITY_JS_CODE;
  if (!securityCode) return NextResponse.json({ error: "高德安全代理尚未配置" }, { status: 503 });

  const { path } = await context.params;
  if (!path.length || !allowedVersion.test(path[0]) || path.some((part) => !/^[a-zA-Z0-9._-]+$/.test(part))) {
    return NextResponse.json({ error: "不允许的高德服务路径" }, { status: 400 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`https://restapi.amap.com/${path.join("/")}`);
  incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.searchParams.set("jscode", securityCode);

  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "高德安全代理暂时不可用" }, { status: 502 });
  }
}
