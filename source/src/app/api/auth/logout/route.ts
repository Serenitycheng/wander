import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionCookie } from "@/lib/server/session";

export async function POST() {
  const store = await cookies();
  store.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
  return NextResponse.json({ success: true });
}
