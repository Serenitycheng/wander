import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "包含具体出发地址的云端同步尚未获得明确授权。", code: "CLOUD_SENSITIVE_DATA_SHARING_NOT_AUTHORIZED" }, { status: 403 });
}

export async function PUT() {
  return NextResponse.json({ error: "包含具体出发地址的云端同步尚未获得明确授权。", code: "CLOUD_SENSITIVE_DATA_SHARING_NOT_AUTHORIZED" }, { status: 403 });
}
