import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupMembers, groups } from "../../../../../db/schema";
import { getGroup, getMembership } from "../../group-access";
import { recordAudit } from "../../../../audit-log";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const body = await request.json() as { userEmail?: string; role?: "owner" | "editor" | "member"; showInPersonal?: boolean; displayName?: string; adminNote?: string };
  if (!body.userEmail) return Response.json({ error: "userEmailが必要です" }, { status: 400 });
  const self = await getMembership(id, user.email);
  if (!self) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const isAdmin = self.role === "owner" || self.role === "editor";
  if (!isAdmin && body.userEmail !== user.email) return Response.json({ error: "他のメンバーの設定変更には管理者権限が必要です" }, { status: 403 });
  if (body.role && self.role !== "owner") return Response.json({ error: "権限の変更はオーナーだけが実行できます" }, { status: 403 });
  if (body.role && !["editor", "member"].includes(body.role)) return Response.json({ error: "指定できる権限が不正です" }, { status: 400 });
  if (body.role === "owner" && body.userEmail !== user.email) return Response.json({ error: "ownerの引き継ぎは別操作で行います" }, { status: 400 });
  const target = await getMembership(id, body.userEmail);
  if (!target) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 40) : undefined;
  if (displayName !== undefined && body.userEmail !== user.email) return Response.json({ error: "グループ内ニックネームは本人が基本設定から変更してください" }, { status: 403 });
  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : undefined;
  await getDb().update(groupMembers).set({ ...(body.role ? { role: body.role } : {}), ...(typeof body.showInPersonal === "boolean" ? { showInPersonal: body.showInPersonal } : {}), ...(displayName !== undefined ? { displayName } : {}), ...(isAdmin && adminNote !== undefined ? { adminNote } : {}) }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, body.userEmail)));
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.member", entityType: "groupMember", entityId: body.userEmail, summary: `${body.userEmail}のメンバー情報を変更しました`, details: { role: body.role, displayName: displayName !== undefined, adminNote: adminNote !== undefined } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { userEmail?: string };
  const targetEmail = body.userEmail ?? user.email;
  const self = await getMembership(id, user.email);
  if (!self || (user.email !== targetEmail && self.role !== "owner")) return Response.json({ error: "この操作は許可されていません" }, { status: 403 });
  const db = getDb();
  if (targetEmail === group.ownerEmail) {
    const remaining = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
    const nextOwner = remaining.find((member) => member.userEmail !== targetEmail);
    if (!nextOwner) return Response.json({ error: "引き継ぎ先のメンバーがいません" }, { status: 400 });
    await db.batch([
      db.update(groups).set({ ownerEmail: nextOwner.userEmail }).where(eq(groups.id, id)),
      db.update(groupMembers).set({ role: "owner" }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, nextOwner.userEmail))),
      db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, targetEmail))),
    ]);
    await recordAudit({ groupId: id, userEmail: user.email, action: "group.member", entityType: "groupMember", entityId: targetEmail, summary: `${targetEmail}が退会し、代表管理者を引き継ぎました`, details: { transferredTo: nextOwner.userEmail } });
    return Response.json({ ok: true, transferredTo: nextOwner.userEmail });
  }
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, targetEmail)));
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.member", entityType: "groupMember", entityId: targetEmail, summary: `${targetEmail}がグループから退会しました` });
  return Response.json({ ok: true });
}
