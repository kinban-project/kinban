import { and, asc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { announcementReads, announcementReplies, groupAnnouncements, groupMembers } from "../../../../../db/schema";
import { requireGroupMembership } from "../../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params; const membership = await requireGroupMembership(id, user.email); const db = getDb();
  const announcements = await db.select().from(groupAnnouncements).where(eq(groupAnnouncements.groupId, id)).orderBy(asc(groupAnnouncements.createdAt));
  const reads = announcements.length ? await db.select().from(announcementReads).where(and(inArray(announcementReads.announcementId, announcements.map((row) => row.id)), eq(announcementReads.userEmail, user.email))) : [];
  const replies = announcements.length ? await db.select().from(announcementReplies).where(inArray(announcementReplies.announcementId, announcements.map((row) => row.id))) : [];
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  return Response.json({ announcements, reads, replies, members, role: membership.role, currentEmail: user.email });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params; const membership = await requireGroupMembership(id, user.email); const body = await request.json() as { action?: "create" | "read" | "reply" | "contact"; announcementId?: string; title?: string; body?: string };
  const db = getDb();
  if (body.action === "create" && (membership.role === "owner" || membership.role === "editor")) { if (!body.title?.trim() || !body.body?.trim()) return Response.json({ error: "タイトルと本文が必要です" }, { status: 400 }); await db.insert(groupAnnouncements).values({ id: crypto.randomUUID(), groupId: id, createdBy: user.email, title: body.title.trim().slice(0, 120), body: body.body.trim().slice(0, 2000) }); return Response.json({ ok: true }, { status: 201 }); }
  if (body.action === "read" && body.announcementId) { await db.insert(announcementReads).values({ id: crypto.randomUUID(), announcementId: body.announcementId, userEmail: user.email }); return Response.json({ ok: true }); }
  if ((body.action === "reply" || body.action === "contact") && body.announcementId && body.body?.trim()) { await db.insert(announcementReplies).values({ id: crypto.randomUUID(), announcementId: body.announcementId, userEmail: user.email, body: body.body.trim().slice(0, 2000) }); return Response.json({ ok: true }, { status: 201 }); }
  return Response.json({ error: "操作が不正です" }, { status: 400 });
}
