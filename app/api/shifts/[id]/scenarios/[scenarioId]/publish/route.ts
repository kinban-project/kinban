import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../../chatgpt-auth";
import { getDb } from "../../../../../../../db";
import { accountProfiles, events, groupMembers, groups, memberDuties, shiftAssignmentScenarios, shiftAssignments, shiftPlans, shiftSlots } from "../../../../../../../db/schema";
import { getMembership } from "../../../../../groups/group-access";
import { recordAudit } from "../../../../../../audit-log";
import { createSystemMessagesAndPush } from "../../../../../../notification-events";
import { shiftDateTime } from "../../../../../../shift-time";
import { proposalMeta, proposalMatchesSlots, proposalSettings } from "../../../../../../shift-assignment-proposals";
import { buildMemberDutyMap, validateDutyAssignments } from "../../../../../../duty-validation";

export const dynamic = "force-dynamic";

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

async function access(planId: string) {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "ログインが必要です" }, { status: 401 }) } as const;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, planId)).limit(1);
  if (!plan) return { error: Response.json({ error: "シフト計画が見つかりません" }, { status: 404 }) } as const;
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return { error: Response.json({ error: "割当案の管理権限がありません" }, { status: 403 }) } as const;
  return { user, db, plan } as const;
}

export async function POST(request: Request, context: { params: Promise<{ id: string; scenarioId: string }> }) {
  const { id, scenarioId } = await context.params;
  const result = await access(id);
  if ("error" in result) return result.error;
  const body = await request.json().catch(() => ({})) as { confirm?: boolean; expectedVersion?: number; reason?: string };
  if (body.confirm !== true) return Response.json({ error: "公開する場合はconfirm:trueが必要です" }, { status: 400 });
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== result.plan.version)
    return Response.json({ error: "シフト計画の版が古くなっています。再読み込みしてください", conflict: true, latestVersion: result.plan.version }, { status: 409 });
  const [scenario] = await result.db.select().from(shiftAssignmentScenarios).where(and(eq(shiftAssignmentScenarios.id, scenarioId), eq(shiftAssignmentScenarios.planId, id))).limit(1);
  if (!scenario) return Response.json({ error: "割当案が見つかりません" }, { status: 404 });
  let settings: Record<string, unknown>;
  let assignments: Record<string, string[]>;
  try {
    settings = JSON.parse(scenario.settingsJson || "{}");
    assignments = JSON.parse(scenario.assignmentsJson || "{}");
  } catch {
    return Response.json({ error: "割当案の保存データが壊れています" }, { status: 409 });
  }
  if (proposalMeta(settings).proposalStatus === "published") return Response.json({ ok: true, scenarioId, status: "published", alreadyPublished: true });
  const slots = await result.db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  const proposal = proposalMeta(settings);
  if (!proposalMatchesSlots(proposal, slots))
    return Response.json({ error: "勤務枠（時刻・必要人数・担当）が変更された後に作成された割当案です。現在の勤務枠で再作成してください", conflict: true }, { status: 409 });
  const members = await result.db.select().from(groupMembers).where(and(eq(groupMembers.groupId, result.plan.groupId), eq(groupMembers.status, "active")));
  const validMembers = new Set(members.map((member) => member.userEmail));
  const validSlots = new Set(slots.map((slot) => slot.id));
  const dutyRows = await result.db.select({ userEmail: memberDuties.userEmail, dutyId: memberDuties.dutyId }).from(memberDuties).where(eq(memberDuties.groupId, result.plan.groupId));
  const rows = slots.flatMap((slot) => {
    const users = Array.isArray(assignments[slot.id]) ? [...new Set(assignments[slot.id])] : [];
    return users.filter((email) => validMembers.has(email)).map((userEmail) => ({ id: crypto.randomUUID(), slotId: slot.id, userEmail }));
  });
  const unknownSlot = Object.keys(assignments).some((slotId) => !validSlots.has(slotId));
  if (unknownSlot) return Response.json({ error: "割当案に存在しない勤務枠が含まれています。再作成してください" }, { status: 409 });
  const dutyErrors = validateDutyAssignments(slots, rows, buildMemberDutyMap(dutyRows));
  if (dutyErrors.length) return Response.json({ error: "担当可能ではないメンバーが割り当てられています。既存の公開版は変更されていません。", dutyErrors }, { status: 409 });
  const [currentPublished] = (await result.db.select().from(shiftAssignmentScenarios).where(eq(shiftAssignmentScenarios.planId, id))).filter((item) => {
    try { return proposalMeta(JSON.parse(item.settingsJson || "{}")).proposalStatus === "published"; } catch { return false; }
  });
  const now = new Date().toISOString();
  const nextSettings = proposalSettings(settings, { proposalStatus: "published", publishedAt: now, publishedBy: result.user.email });
  const statements = chunk(slots.map((slot) => slot.id), 50).map((slotIds) => result.db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)));
  for (const batch of chunk(rows, 8)) statements.push(result.db.insert(shiftAssignments).values(batch));
  if (currentPublished && currentPublished.id !== scenario.id) {
    let oldSettings: unknown = {};
    try { oldSettings = JSON.parse(currentPublished.settingsJson || "{}"); } catch { /* legacy rows */ }
    statements.push(result.db.update(shiftAssignmentScenarios).set({ settingsJson: JSON.stringify(proposalSettings(oldSettings, { proposalStatus: "superseded" })), updatedAt: now }).where(eq(shiftAssignmentScenarios.id, currentPublished.id)));
  }
  statements.push(result.db.update(shiftAssignmentScenarios).set({ settingsJson: JSON.stringify(nextSettings), updatedAt: now }).where(eq(shiftAssignmentScenarios.id, scenario.id)));
  statements.push(result.db.update(shiftPlans).set({ status: "published", version: result.plan.version + 1 }).where(and(eq(shiftPlans.id, id), eq(shiftPlans.version, result.plan.version))));
  statements.push(result.db.delete(events).where(eq(events.shiftPlanId, id)));
  const profiles = members.length ? await result.db.select().from(accountProfiles).where(inArray(accountProfiles.userEmail, members.map((member) => member.userEmail))) : [];
  const [group] = await result.db.select().from(groups).where(eq(groups.id, result.plan.groupId)).limit(1);
  const memberNames = new Map(members.map((member) => [member.userEmail, member.displayName?.trim() || profiles.find((profile) => profile.userEmail === member.userEmail)?.nickname?.trim() || member.userEmail.split("@")[0]]));
  const publishedEvents = slots.map((slot) => ({ slot, assigned: rows.filter((row) => row.slotId === slot.id).map((row) => memberNames.get(row.userEmail) ?? row.userEmail) })).filter((item) => item.assigned.length > 0).map((item) => { const start = shiftDateTime(item.slot.date, item.slot.startTime); const end = shiftDateTime(item.slot.date, item.slot.endTime); return { id: crypto.randomUUID(), ownerEmail: result.plan.createdBy, groupId: result.plan.groupId, shiftPlanId: id, title: item.slot.role?.trim() || group?.name || "勤務", date: start.date, endDate: end.date, startTime: start.time, endTime: end.time, category: "シフト", notes: `担当: ${item.assigned.join(", ")}`, completed: false }; });
  for (const batch of chunk(publishedEvents, 8)) statements.push(result.db.insert(events).values(batch));
  await result.db.batch(statements);
  await recordAudit({ groupId: result.plan.groupId, userEmail: result.user.email, action: "shift.proposal.publish", entityType: "shiftAssignmentScenario", entityId: scenario.id, summary: `割当案を公開しました: ${scenario.name}`, details: { planId: id, previousPublishedScenarioId: currentPublished?.id ?? null, reason: body.reason?.trim().slice(0, 300) ?? "", assignedCount: rows.length } });
  const recipients = [...new Set(rows.map((row) => row.userEmail))];
  await createSystemMessagesAndPush(result.db, { groupId: result.plan.groupId, recipients, eventId: `shift-proposal-publish:${id}:${result.plan.version + 1}`, eventType: "published_shift_changed", body: "公開シフトが更新されました。シフト一覧を確認してください。", pushTitle: "KINBAN", pushBody: "公開シフトが更新されました", url: `/?group=${encodeURIComponent(result.plan.groupId)}&view=roster` });
  return Response.json({ ok: true, planId: id, scenarioId, status: "published", version: result.plan.version + 1, assignedCount: rows.length });
}
