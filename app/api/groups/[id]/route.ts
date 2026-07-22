import { eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { assistantAnnouncementDrafts, assistantMessageExecutions, assistantMessages, events, groupAssistants, groupInvitations, groupJoinRequests, groupMembers, groupPreferences, groups, shiftAvailability, shiftSwapCandidates, shiftSwapRequests } from "../../../../db/schema";
import { getGroup, getMembership } from "../group-access";
import { recordAudit } from "../../../audit-log";
import { canViewAdminNote, toPublicMember } from "../member-dto";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  const db = getDb();
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  const [assistant] = await db.select().from(groupAssistants).where(eq(groupAssistants.groupId, id)).limit(1);
  const requests = membership.role === "owner" ? await db.select().from(groupJoinRequests).where(eq(groupJoinRequests.groupId, id)) : [];
  const invitations = isAdmin ? await db.select().from(groupInvitations).where(eq(groupInvitations.groupId, id)) : [];
  const isAdmin = canViewAdminNote(membership.role);
  const visiblePreferenceEmails = isAdmin ? members.map((member) => member.userEmail) : [user.email];
  const preferences = visiblePreferenceEmails.length
    ? await db.select().from(groupPreferences).where(eq(groupPreferences.groupId, id))
    : [];
  const availability = visiblePreferenceEmails.length
    ? await db.select().from(shiftAvailability).where(eq(shiftAvailability.groupId, id))
    : [];
  const safeMembers = members.map((member) => ({
    ...toPublicMember(member, isAdmin),
    preference: visiblePreferenceEmails.includes(member.userEmail)
      ? preferences.find((preference) => preference.userEmail === member.userEmail) ?? null
      : null,
    availability: visiblePreferenceEmails.includes(member.userEmail)
      ? availability.filter((entry) => entry.userEmail === member.userEmail)
      : [],
  }));
  return Response.json({ currentEmail: user.email, group, membership: toPublicMember(membership, isAdmin), members: safeMembers, requests, invitations, assistant: assistant ?? null });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  if (group.ownerEmail !== user.email) return Response.json({ error: "グループ削除はownerだけが実行できます" }, { status: 403 });
  const db = getDb();
  const groupEvents = await db.select().from(events).where(eq(events.groupId, id));
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.delete", entityType: "group", entityId: id, summary: `グループを削除: ${group.name}` });
  await db.batch([
    db.delete(events).where(eq(events.groupId, id)),
    db.delete(groupJoinRequests).where(eq(groupJoinRequests.groupId, id)),
    db.delete(assistantAnnouncementDrafts).where(eq(assistantAnnouncementDrafts.groupId, id)),
    db.delete(shiftSwapCandidates).where(eq(shiftSwapCandidates.groupId, id)),
    db.delete(shiftSwapRequests).where(eq(shiftSwapRequests.groupId, id)),
    db.delete(assistantMessageExecutions).where(eq(assistantMessageExecutions.groupId, id)),
    db.delete(assistantMessages).where(eq(assistantMessages.groupId, id)),
    db.delete(groupAssistants).where(eq(groupAssistants.groupId, id)),
    db.delete(groupMembers).where(eq(groupMembers.groupId, id)),
    db.delete(groups).where(eq(groups.id, id)),
  ]);
  return Response.json({ ok: true });
}
