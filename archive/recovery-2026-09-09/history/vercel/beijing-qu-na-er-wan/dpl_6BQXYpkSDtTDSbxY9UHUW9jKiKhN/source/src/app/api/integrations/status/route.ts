import { NextResponse } from "next/server";

export async function GET() {
  const database = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const auth = Boolean(process.env.AUTH_SECRET && process.env.SERENITY_PASSWORD_SCRYPT && process.env.ZZZ_PASSWORD_SCRYPT);
  return NextResponse.json({
    amap: Boolean(process.env.AMAP_WEB_SERVICE_KEY && process.env.NEXT_PUBLIC_AMAP_JS_KEY && process.env.AMAP_SECURITY_JS_CODE),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    deepseekDataSharingEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
    database,
    cloudSensitiveDataSharingEnabled: database && auth,
    auth,
  });
}
