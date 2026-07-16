import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { accountProfiles, groupMembers, groupPreferences, groups, shiftAssignments, shiftAvailability, shiftPlans, shiftRequestPeriods, shiftRequests, shiftRequestSubmissions, shiftSlots } from "../../../../../db/schema";
import { getAnyMembership, getGroup, getMembership } from "../../group-access";
import { recordAudit } from "../../../../audit-log";

export const dynamic = "force-dynamic";

async function clearMemberAssignments(groupId: string, userEmail: string) {
  const db = getDb();
  const plans = await db.select({ id: shiftPlans.id }).from(shiftPlans).where(eq(shiftPlans.groupId, groupId));
  const planIds = plans.map((plan) => plan.id);
  if (!planIds.length) return;
  const slots = await db.select({ id: shiftSlots.id }).from(shiftSlots).where(inArray(shiftSlots.planId, planIds));
  const slotIds = slots.map((slot) => slot.id);
  for (let offset = 0; offset < slotIds.length; offset += 50) {
    const chunk = slotIds.slice(offset, offset + 50);
    await db.delete(shiftAssignments).where(and(inArray(shiftAssignments.slotId, chunk), eq(shiftAssignments.userEmail, userEmail)));
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const body = await request.json() as { userEmail?: string; role?: "owner" | "editor" | "member"; status?: "active" | "inactive"; showInPersonal?: boolean; displayName?: string; adminNote?: string };
  if (!body.userEmail) return Response.json({ error: "userEmailが必要です" }, { status: 400 });
  const self = await getMembership(id, user.email);
  if (!self) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const isAdmin = self.role === "owner" || self.role === "editor";
  if (!isAdmin && body.userEmail !== user.email) return Response.json({ error: "他のメンバーの変更には管理者権限が必要です" }, { status: 403 });
  if (body.role && self.role !== "owner") return Response.json({ error: "権限の変更は代表管理者だけが実行できます" }, { status: 403 });
  if (body.status && !isAdmin) return Response.json({ error: "利用停止の変更には管理者権限が必要です" }, { status: 403 });
  if (body.role && !["editor", "member"].includes(body.role)) return Response.json({ error: "指定できる権限が不正です" }, { status: 400 });
  if (body.role === "owner" && body.userEmail !== user.email) return Response.json({ error: "代表管理者の引き継ぎは別操作で行います" }, { status: 400 });
  const target = await getAnyMembership(id, body.userEmail);
  if (!target) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
  if (body.status && (target.role === "owner" || target.userEmail === user.email)) return Response.json({ error: "代表管理者自身は利用停止にできません" }, { status: 400 });
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 40) : undefined;
  if (displayName !== undefined && body.userEmail !== user.email) return Response.json({ error: "グループ内ニックネームは本人が基本設定から変更してください" }, { status: 403 });
  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : undefined;
  await getDb().update(groupMembers).set({ ...(body.role ? { role: body.role } : {}), ...(body.status ? { status: body.status } : {}), ...(typeof body.showInPersonal === "boolean" ? { showInPersonal: body.showInPersonal } : {}), ...(displayName !== undefined ? { displayName } : {}), ...(isAdmin && adminNote !== undefined ? { adminNote } : {}) }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, body.userEmail)));
  if (body.status === "inactive") await clearMemberAssignments(id, body.userEmail);
  await recordAudit({ groupId: id, userEmail: user.email, action: body.status ? "group.member.status" : "group.member", entityType: "groupMember", entityId: body.userEmail, summary: body.status === "inactive" ? `${body.userEmail}を利用停止にしました` : body.status === "active" ? `${body.userEmail}を有効化しました` : `${body.userEmail}のメンバー情報を変更しました`, details: { role: body.role, status: body.status, displayName: displayName !== undefined, adminNote: adminNote !== undefined } });
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
  if (!self || (targetEmail !== user.email && self.role !== "owner" && self.role !== "editor")) return Response.json({ error: "この操作は許可されていません" }, { status: 403 });
  const target = await getAnyMembership(id, targetEmail);
  if (!target) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
  if (target.role === "owner" && targetEmail !== user.email) return Response.json({ error: "代表管理者は先に引き継ぎが必要です" }, { status: 400 });
  const db = getDb();
  await clearMemberAssignments(id, targetEmail);
  const periods = await db.select({ id: shiftRequestPeriods.id }).from(shiftRequestPeriods).where(eq(shiftRequestPeriods.groupId, id));
  const periodIds = periods.map((period) => period.id);
  if (periodIds.length) {
    await db.delete(shiftRequests).where(and(inArray(shiftRequests.periodId, periodIds), eq(shiftRequests.userEmail, targetEmail)));
    await db.delete(shiftRequestSubmissions).where(and(inArray(shiftRequestSubmissions.periodId, periodIds), eq(shiftRequestSubmissions.userEmail, targetEmail)));
  }
  await db.delete(groupPreferences).where(and(eq(groupPreferences.groupId, id), eq(groupPreferences.userEmail, targetEmail)));
  await db.delete(shiftAvailability).where(and(eq(shiftAvailability.groupId, id), eq(shiftAvailability.userEmail, targetEmail)));
  if (targetEmail === group.ownerEmail) {
    const remaining = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")));
    const nextOwner = remaining.find((member) => member.userEmail !== targetEmail);
    if (!nextOwner) return Response.json({ error: "引き継ぎ先のメンバーがいません" }, { status: 400 });
    await db.update(groups).set({ ownerEmail: nextOwner.userEmail }).where(eq(groups.id, id));
    await db.update(groupMembers).set({ role: "owner" }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, nextOwner.userEmail)));
  }
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, targetEmail)));
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.member", entityType: "groupMember", entityId: targetEmail, summary: targetEmail === user.email ? `${targetEmail}がグループから退会しました` : `${targetEmail}をグループから削除しました` });
  return Response.json({ ok: true });
}
