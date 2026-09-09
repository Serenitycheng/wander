import { scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie } from "@/lib/server/session";
import type { UserId } from "@/lib/types";

const verifyPassword = (password: string, stored: string | undefined) => {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = body?.username?.trim().toLowerCase();
  const password = body?.password ?? "";
  if ((username !== "serenity" && username !== "zzz") || !password || password.length > 160) {
    return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });
  }

  const userId = username as UserId;
  const hash = userId === "serenity" ? process.env.SERENITY_PASSWORD_SCRYPT : process.env.ZZZ_PASSWORD_SCRYPT;
  if (!process.env.AUTH_SECRET || !hash) {
    return NextResponse.json({ error: "账号环境尚未初始化", code: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!verifyPassword(password, hash)) return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });

  const token = createSessionToken({ userId, role: userId === "serenity" ? "admin" : "member", expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  const response = NextResponse.json({ user: { id: userId, role: userId === "serenity" ? "admin" : "member" } });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return response;
}
