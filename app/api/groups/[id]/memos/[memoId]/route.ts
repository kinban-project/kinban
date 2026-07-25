import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { memoFolders, memos } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../audit-log";
import { requireGroupMembership } from "../../../group-access";

export const dynamic = "force-dynamic";

async function auth(context: { params: Promise<{ id: string; memoId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return null;
  const params = await context.params;
  const membership = await requireGroupMembership(params.id, user.email);
  return { user, membership, ...params };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; memoId: string }> }) {
  const input = await auth(context);
  if (!input) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const db = getDb();
  const [note] = await db.select().from(memos).where(and(eq(memos.id, input.memoId), eq(memos.groupId, input.id))).limit(1);
  if (!note || note.deletedAt) return Response.json({ error: "メモが見つかりません" }, { status: 404 });
  const admin = input.membership.role === "owner" || input.membership.role === "editor";
  if (!admin && note.authorEmail !== input.user.email) return Response.json({ error: "編集権限がありません" }, { status: 403 });
  const body = await request.json() as { folderId?: string; targetDate?: string; title?: string; body?: string; visibility?: string };
  if (body.folderId) {
    const [folder] = await db.select().from(memoFolders).where(and(eq(memoFolders.id, body.folderId), eq(memoFolders.groupId, input.id))).limit(1);
    if (!folder) return Response.json({ error: "フォルダが見つかりません" }, { status: 404 });
  }
  const visibility = body.visibility && ["group", "managers", "private"].includes(body.visibility) ? body.visibility : note.visibility;
  await db.update(memos).set({
    folderId: body.folderId ?? note.folderId,
    targetDate: body.targetDate?.trim() || note.targetDate,
    title: body.title?.trim().slice(0, 120) || note.title,
    body: body.body === undefined ? note.body : body.body.trim().slice(0, 10000),
    visibility: visibility as "group" | "managers" | "private",
    updatedAt: new Date().toISOString(),
  }).where(eq(memos.id, input.memoId));
  await recordAudit({ groupId: input.id, userEmail: input.user.email, action: "memo.update", entityType: "memo", entityId: input.memoId, summary: `業務メモを更新: ${body.title?.trim() || note.title}` });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; memoId: string }> }) {
  const input = await auth(context);
  if (!input) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const db = getDb();
  const [note] = await db.select().from(memos).where(and(eq(memos.id, input.memoId), eq(memos.groupId, input.id))).limit(1);
  if (!note || note.deletedAt) return Response.json({ error: "メモが見つかりません" }, { status: 404 });
  const admin = input.membership.role === "owner" || input.membership.role === "editor";
  if (!admin && note.authorEmail !== input.user.email) return Response.json({ error: "削除権限がありません" }, { status: 403 });
  await db.update(memos).set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(memos.id, input.memoId));
  await recordAudit({ groupId: input.id, userEmail: input.user.email, action: "memo.delete", entityType: "memo", entityId: input.memoId, summary: `業務メモを削除: ${note.title}` });
  return Response.json({ ok: true });
}
