import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupInvitations, groupMembers, siteUsers } from "../../../../../db/schema";
import { getGroup, getMembership } from "../../group-access";
import { recordAudit } from "../../../../audit-log";

export const dynamic = "force-dynamic";

function loginRequired() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
    return Response.json({ error: "グループ管理者のみ確認できます" }, { status: 403 });
  }
  const invitations = await getDb().select().from(groupInvitations).where(eq(groupInvitations.groupId, id));
  return Response.json({ invitations });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { email?: string; action?: "accept" };
  const db = getDb();

  // 招待を受けた本人は、まだメンバーでなくても承認できます。
  if (body.action === "accept") {
    const [invitation] = await db.select().from(groupInvitations).where(and(
      eq(groupInvitations.groupId, id),
      eq(groupInvitations.inviteeEmail, user.email),
      eq(groupInvitations.status, "pending"),
    )).limit(1);
    if (!invitation || invitation.expiresAt <= new Date().toISOString()) {
      return Response.json({ error: "有効なグループ招待がありません" }, { status: 404 });
    }
    const [existing] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, user.email))).limit(1);
    if (!existing) await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: id, userEmail: user.email, role: "member", showInPersonal: true });
    await db.update(groupInvitations).set({ status: "accepted", acceptedAt: new Date().toISOString() }).where(eq(groupInvitations.id, invitation.id));
    await recordAudit({ groupId: id, userEmail: user.email, action: "group.invitation.accept", entityType: "groupInvitation", entityId: invitation.id, summary: "グループ招待を承認しました" });
    return Response.json({ ok: true, invitationId: invitation.id });
  }

  const membership = await getMembership(id, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
    return Response.json({ error: "グループ管理者のみ招待を作成できます" }, { status: 403 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) return Response.json({ error: "招待するメールアドレスを入力してください" }, { status: 400 });
  const [siteUser] = await db.select().from(siteUsers).where(and(eq(siteUsers.userEmail, email), eq(siteUsers.status, "active"))).limit(1);
  if (!siteUser) return Response.json({ error: "先にサイト利用者として承認してください" }, { status: 404 });
  const [existingMember] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, email))).limit(1);
  if (existingMember?.status === "active") return Response.json({ error: "すでにグループのメンバーです" }, { status: 409 });
  const [pending] = await db.select().from(groupInvitations).where(and(eq(groupInvitations.groupId, id), eq(groupInvitations.inviteeEmail, email), eq(groupInvitations.status, "pending"))).limit(1);
  if (pending) return Response.json({ invitation: pending });
  const invitation = { id: crypto.randomUUID(), groupId: id, inviteeEmail: email, invitedBy: user.email, status: "pending" as const, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  await db.insert(groupInvitations).values(invitation);
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.invitation.create", entityType: "groupInvitation", entityId: invitation.id, summary: `${email}をグループへ招待しました` });
  return Response.json({ invitation }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return loginRequired();
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "グループ管理者のみ招待を取り消せます" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { invitationId?: string };
  if (!body.invitationId) return Response.json({ error: "招待IDが必要です" }, { status: 400 });
  const result = await getDb().update(groupInvitations).set({ status: "revoked" }).where(and(eq(groupInvitations.id, body.invitationId), eq(groupInvitations.groupId, id), eq(groupInvitations.status, "pending")));
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.invitation.revoke", entityType: "groupInvitation", entityId: body.invitationId, summary: "グループ招待を取り消しました" });
  return Response.json({ ok: true, changed: result });
}
