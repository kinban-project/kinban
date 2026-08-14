import { eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { apiTokens, assistantAnnouncementDrafts, assistantMessageExecutions, assistantMessages, events, groupAssistants, groupDuties, groupInvitations, groupJoinRequests, groupMembers, groupPreferences, groups, knowledgeAssets, knowledgeFolders, knowledgePages, memberDuties, memoFolders, memos, shiftAvailability, shiftSwapCandidates, shiftSwapRequests } from "../../../../db/schema";
import { getGroup, getMembership } from "../group-access";
import { recordAudit } from "../../../audit-log";
import { canViewAdminNote, toPublicMember } from "../member-dto";

export const dynamic = "force-dynamic";

const laborRuleBooleanKeys = [
  "laborPlannedBreakWarning",
  "laborDailyHoursWarning",
  "laborWeeklyHoursWarning",
  "laborRestIntervalWarning",
  "laborConsecutiveDaysWarning",
  "laborWeeklyRestWarning",
] as const;
const laborRuleNumberKeys = [
  "laborDailyHoursLimitMinutes",
  "laborWeeklyHoursLimitMinutes",
  "laborRestIntervalMinutes",
  "laborConsecutiveDaysLimit",
  "laborWeeklyRestDaysRequired",
  "laborFourWeekRestDaysRequired",
] as const;
const laborRuleKeys = [...laborRuleBooleanKeys, ...laborRuleNumberKeys] as const;
type LaborRulePatch = Partial<Record<(typeof laborRuleKeys)[number], unknown>> & { autoBreakSuggestion?: unknown };
type GroupSettingsPatch = LaborRulePatch & { memoEnabled?: unknown; knowledgeEnabled?: unknown };

function normalizeLaborRulePatch(body: LaborRulePatch) {
  const patch: Record<string, boolean | number> = {};
  for (const key of laborRuleBooleanKeys) {
    if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
  }
  for (const key of laborRuleNumberKeys) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value)) throw new Error(`${key}は数値で指定してください`);
    patch[key] = Math.max(0, Math.round(value));
  }
  return patch;
}

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
  const duties = await db.select().from(groupDuties).where(eq(groupDuties.groupId, id));
  const dutyRows = await db.select({ userEmail: memberDuties.userEmail, dutyId: memberDuties.dutyId }).from(memberDuties).where(eq(memberDuties.groupId, id));
  const [assistant] = await db.select().from(groupAssistants).where(eq(groupAssistants.groupId, id)).limit(1);
  const requests = membership.role === "owner" ? await db.select().from(groupJoinRequests).where(eq(groupJoinRequests.groupId, id)) : [];
  const isAdmin = canViewAdminNote(membership.role);
  const invitations = isAdmin ? await db.select().from(groupInvitations).where(eq(groupInvitations.groupId, id)) : [];
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
    dutyIds: (isAdmin || member.userEmail === user.email)
      ? dutyRows.filter((row) => row.userEmail === member.userEmail).map((row) => row.dutyId)
      : [],
  }));
  return Response.json({ currentEmail: user.email, group: { ...group, memoEnabled: group.memoEnabled !== false, knowledgeEnabled: group.knowledgeEnabled !== false, autoBreakSuggestion: group.autoBreakSuggestion !== false }, membership: toPublicMember(membership, isAdmin), members: safeMembers, duties, requests, invitations, assistant: assistant ?? null });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  if (membership.role !== "owner" && membership.role !== "editor") return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as GroupSettingsPatch;
  let laborPatch: Record<string, boolean | number>;
  try {
    laborPatch = normalizeLaborRulePatch(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ルールの値が不正です" }, { status: 400 });
  }
  if (typeof body.autoBreakSuggestion === "boolean") laborPatch.autoBreakSuggestion = body.autoBreakSuggestion;
  if (typeof body.memoEnabled === "boolean") laborPatch.memoEnabled = body.memoEnabled;
  if (typeof body.knowledgeEnabled === "boolean") laborPatch.knowledgeEnabled = body.knowledgeEnabled;
  if (!Object.keys(laborPatch).length) return Response.json({ error: "変更するルールを指定してください" }, { status: 400 });
  const db = getDb();
  await db.update(groups).set(laborPatch).where(eq(groups.id, id));
  const featureSettingsChanged = "memoEnabled" in laborPatch || "knowledgeEnabled" in laborPatch;
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.settings", entityType: "group", entityId: id, summary: featureSettingsChanged ? "グループ機能設定を更新しました" : "シフト・勤怠ルールを更新しました", details: laborPatch });
  const [updated] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return Response.json({ ok: true, group: updated, ...laborPatch });
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
    db.delete(groupInvitations).where(eq(groupInvitations.groupId, id)),
    db.delete(assistantAnnouncementDrafts).where(eq(assistantAnnouncementDrafts.groupId, id)),
    db.delete(shiftSwapCandidates).where(eq(shiftSwapCandidates.groupId, id)),
    db.delete(shiftSwapRequests).where(eq(shiftSwapRequests.groupId, id)),
    db.delete(assistantMessageExecutions).where(eq(assistantMessageExecutions.groupId, id)),
    db.delete(assistantMessages).where(eq(assistantMessages.groupId, id)),
    db.delete(apiTokens).where(eq(apiTokens.groupId, id)),
    db.delete(groupAssistants).where(eq(groupAssistants.groupId, id)),
    db.delete(memberDuties).where(eq(memberDuties.groupId, id)),
    db.delete(groupDuties).where(eq(groupDuties.groupId, id)),
    db.delete(memos).where(eq(memos.groupId, id)),
    db.delete(memoFolders).where(eq(memoFolders.groupId, id)),
    db.delete(knowledgePages).where(eq(knowledgePages.groupId, id)),
    db.delete(knowledgeAssets).where(eq(knowledgeAssets.groupId, id)),
    db.delete(knowledgeFolders).where(eq(knowledgeFolders.groupId, id)),
    db.delete(groupMembers).where(eq(groupMembers.groupId, id)),
    db.delete(groups).where(eq(groups.id, id)),
  ]);
  return Response.json({ ok: true });
}
