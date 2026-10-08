import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { cloudDatabaseConfigured, readWorkspace, saveWorkspace } from "@/lib/server/workspace";
import type { TripDraft, UserId } from "@/features/beijing/lib/types";

const allowedSpace = (value: string | null): value is UserId => value === "serenity" || value === "zzz";
const canAccess = (session: { userId: UserId; role: "admin" | "member" }, spaceId: UserId) => session.userId === spaceId || session.role === "admin";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!cloudDatabaseConfigured()) return NextResponse.json({ error: "云数据库尚未接入。", code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const spaceId = new URL(request.url).searchParams.get("space");
  if (!allowedSpace(spaceId)) return NextResponse.json({ error: "空间不存在。" }, { status: 400 });
  if (!canAccess(session, spaceId)) return NextResponse.json({ error: "没有权限查看这个空间。" }, { status: 403 });
  try {
    return NextResponse.json({ workspace: await readWorkspace(spaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/workspace] read failed", { spaceId, error: String(error) });
    return NextResponse.json({ error: "云空间暂时无法读取。" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!cloudDatabaseConfigured()) return NextResponse.json({ error: "云数据库尚未接入。", code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const body = await request.json().catch(() => null) as { spaceId?: unknown; draft?: unknown; expectedRevision?: unknown; savedTrip?: unknown } | null;
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : null;
  if (!allowedSpace(spaceId) || !canAccess(session, spaceId)) return NextResponse.json({ error: "没有权限保存这个空间。" }, { status: 403 });
  const draft = body?.draft as TripDraft | undefined;
  const expectedRevision = Number(body?.expectedRevision);
  if (!draft || typeof draft.id !== "string" || !draft.answers || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return NextResponse.json({ error: "云端保存的数据格式不正确。" }, { status: 400 });
  try {
    const workspace = await saveWorkspace({ spaceId, draft, expectedRevision, editor: session.userId, savedTrip: body?.savedTrip === true });
    if (!workspace) {
      const current = await readWorkspace(spaceId);
      return NextResponse.json({ error: "云端已有更新版本，本页已停止覆盖。", code: "REVISION_CONFLICT", workspace: current }, { status: 409 });
    }
    return NextResponse.json({ workspace }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/workspace] save failed", { spaceId, expectedRevision, error: String(error) });
    return NextResponse.json({ error: "云空间暂时无法保存。" }, { status: 502 });
  }
}
