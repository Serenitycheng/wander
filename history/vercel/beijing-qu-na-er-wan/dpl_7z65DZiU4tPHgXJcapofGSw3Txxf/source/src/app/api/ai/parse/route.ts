import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "自由文字尚未获授权发送给第三方 DeepSeek；当前使用本地规则解析。",
      code: "EXTERNAL_TEXT_SHARING_NOT_AUTHORIZED",
    },
    { status: 403 },
  );
}
