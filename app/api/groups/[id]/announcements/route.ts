import { and, asc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { announcementReads, announcementReplies, groupAnnouncements, groupMembers } from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { canViewAdminNote, toPublicMember } from "../../member-dto";
import { requireGroupMembership } from "../../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await requireGroupMembership(id, user.email);
  const db = getDb();
  const announcements = await db.select().from(groupAnnouncements).where(eq(groupAnnouncements.groupId, id)).orderBy(asc(groupAnnouncements.createdAt));
  const announcementIds = announcements.map((row) => row.id);
  const reads = announcementIds.length
    ? await db.select().from(announcementReads).where(and(inArray(announcementReads.announcementId, announcementIds), eq(announcementReads.userEmail, user.email)))
    : [];
  const readDetails = membership.role === "owner" || membership.role === "editor"
    ? announcementIds.length ? await db.select().from(announcementReads).where(inArray(announcementReads.announcementId, announcementIds)) : []
    : [];
  const replies = announcementIds.length ? await db.select().from(announcementReplies).where(inArray(announcementReplies.announcementId, announcementIds)) : [];
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")));
  return Response.json({ announcements, reads, readDetails, replies, members: members.map((member) => toPublicMember(member, canViewAdminNote(membership.role))), role: membership.role, currentEmail: user.email });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await requireGroupMembership(id, user.email);
  const body = await request.json() as { action?: "create" | "read" | "reply" | "contact"; announcementId?: string; title?: string; body?: string };
  const db = getDb();

  if (body.action === "create" && (membership.role === "owner" || membership.role === "editor")) {
    if (!body.title?.trim() || !body.body?.trim()) return Response.json({ error: "タイトルと本文が必要です" }, { status: 400 });
    const announcementId = crypto.randomUUID();
    await db.insert(groupAnnouncements).values({ id: announcementId, groupId: id, createdBy: user.email, title: body.title.trim().slice(0, 120), body: body.body.trim().slice(0, 2000) });
    await recordAudit({ groupId: id, userEmail: user.email, action: "announcement.create", entityType: "announcement", entityId: announcementId, summary: `お知らせを作成: ${body.title.trim()}` });
    return Response.json({ ok: true }, { status: 201 });
  }
  if (body.action === "read" && body.announcementId) {
    const [existing] = await db.select().from(announcementReads).where(and(eq(announcementReads.announcementId, body.announcementId), eq(announcementReads.userEmail, user.email))).limit(1);
    if (!existing) await db.insert(announcementReads).values({ id: crypto.randomUUID(), announcementId: body.announcementId, userEmail: user.email });
    await recordAudit({ groupId: id, userEmail: user.email, action: "announcement.read", entityType: "announcement", entityId: body.announcementId, summary: "お知らせを既読にしました" });
    return Response.json({ ok: true });
  }
  if ((body.action === "reply" || body.action === "contact") && body.announcementId && body.body?.trim()) {
    await db.insert(announcementReplies).values({ id: crypto.randomUUID(), announcementId: body.announcementId, userEmail: user.email, body: body.body.trim().slice(0, 2000) });
    await recordAudit({ groupId: id, userEmail: user.email, action: body.action === "reply" ? "announcement.reply" : "announcement.contact", entityType: "announcement", entityId: body.announcementId, summary: body.action === "reply" ? "お知らせに返信しました" : "お知らせから管理者へ連絡しました" });
    return Response.json({ ok: true }, { status: 201 });
  }
  return Response.json({ error: "不正な操作です" }, { status: 400 });
}
