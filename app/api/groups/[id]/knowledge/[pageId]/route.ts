import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { knowledgePages } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../audit-log";
import { requireGroupMembership } from "../../../group-access";

export const dynamic = "force-dynamic";
function manager(role: string) { return role === "owner" || role === "editor"; }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params;
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const membership = await requireGroupMembership(id, user.email);
  if (!manager(membership.role)) return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const body = await request.json() as { title?: string; content?: string; folderId?: string; status?: "draft" | "published"; imageUrl?: string; imageAlt?: string };
  const title = body.title?.trim().slice(0, 120) ?? "";
  if (!title || !body.folderId?.trim()) return Response.json({ error: "タイトルとフォルダを指定してください" }, { status: 400 });
  const db = getDb();
  const [page] = await db.update(knowledgePages).set({ title, folderId: body.folderId.trim(), body: body.content?.slice(0, 30000) ?? "", status: body.status === "published" ? "published" : "draft", imageUrl: body.imageUrl?.trim().slice(0, 2000) || null, imageAlt: body.imageAlt?.trim().slice(0, 200) ?? "", updatedAt: new Date().toISOString() }).where(and(eq(knowledgePages.id, pageId), eq(knowledgePages.groupId, id))).returning();
  if (!page) return Response.json({ error: "ページが見つかりません" }, { status: 404 });
  await recordAudit({ groupId: id, userEmail: user.email, action: "knowledge.page.update", entityType: "knowledge_page", entityId: pageId, summary: `業務ナレッジを更新: ${title}` });
  return Response.json({ page });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id, pageId } = await params;
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const membership = await requireGroupMembership(id, user.email);
  if (!manager(membership.role)) return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const db = getDb();
  const [page] = await db.delete(knowledgePages).where(and(eq(knowledgePages.id, pageId), eq(knowledgePages.groupId, id))).returning();
  if (!page) return Response.json({ error: "ページが見つかりません" }, { status: 404 });
  await recordAudit({ groupId: id, userEmail: user.email, action: "knowledge.page.delete", entityType: "knowledge_page", entityId: pageId, summary: `業務ナレッジを削除: ${page.title}` });
  return Response.json({ ok: true });
}
