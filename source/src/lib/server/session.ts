import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { UserId } from "@/features/beijing/lib/types";

const COOKIE_NAME = "beijing_play_session";

type SessionPayload = {
  userId: UserId;
  role: "admin" | "member";
  expiresAt: number;
};

const signatureFor = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export const createSessionToken = (payload: SessionPayload) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signatureFor(encoded, secret)}`;
};

export const readSessionToken = (token: string | undefined): SessionPayload | null => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expectedBuffer = Buffer.from(signatureFor(encoded, secret));
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.expiresAt <= Date.now()) return null;
    if (payload.userId !== "serenity" && payload.userId !== "zzz") return null;
    return payload;
  } catch {
    return null;
  }
};

export const getSession = async () => {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(COOKIE_NAME)?.value);
};

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};
