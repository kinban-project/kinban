import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { accountProfiles, events, groupMembers, groupPreferences, groups, shiftAssignments, shiftAvailability, shiftPlans, shiftRequests, shiftRequestPeriods, shiftRequestSubmissions, shiftSlots } from "../../../../db/schema";
import { getMembership } from "../../groups/group-access";
import { isValidShiftTime, shiftDateTime, shiftTimeToMinutes } from "../../../shift-time";
import { recordAudit } from "../../../audit-log";
import { canViewAdminNote, toPublicMember } from "../../groups/member-dto";
import { createSystemMessagesAndPush } from "../../../notification-events";
import { getDemoNow, jstDate } from "../../../demo-clock";
import { buildLaborWarnings } from "../../../shift-labor-warnings";

export const dynamic = "force-dynamic";

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};
function dateKeys(start: string, end: string) { const result: string[] = []; const cursor = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`); while (cursor <= last) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return result; }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, id)).limit(1);
  if (!plan) return Response.json({ error: "シフト計画が見つかりません" }, { status: 404 });
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const [group] = await db
    .select({ autoBreakSuggestion: groups.autoBreakSuggestion, laborPlannedBreakWarning: groups.laborPlannedBreakWarning, laborDailyHoursWarning: groups.laborDailyHoursWarning, laborWeeklyHoursWarning: groups.laborWeeklyHoursWarning, laborRestIntervalWarning: groups.laborRestIntervalWarning, laborConsecutiveDaysWarning: groups.laborConsecutiveDaysWarning, laborWeeklyRestWarning: groups.laborWeeklyRestWarning, laborDailyHoursLimitMinutes: groups.laborDailyHoursLimitMinutes, laborWeeklyHoursLimitMinutes: groups.laborWeeklyHoursLimitMinutes, laborRestIntervalMinutes: groups.laborRestIntervalMinutes, laborConsecutiveDaysLimit: groups.laborConsecutiveDaysLimit, laborWeeklyRestDaysRequired: groups.laborWeeklyRestDaysRequired, laborFourWeekRestDaysRequired: groups.laborFourWeekRestDaysRequired })
    .from(groups)
    .where(eq(groups.id, plan.groupId))
    .limit(1);
  const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  const [requestPeriod] = await db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.planId, id)).limit(1);
  const assignmentChunks = await Promise.all(chunk(slots.map((slot) => slot.id), 50).map((slotIds) => db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds))));
  const assignments = assignmentChunks.flat();
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, plan.groupId), eq(groupMembers.status, "active")));
  const activeDates = new Set(slots.map((slot) => slot.date));
  const closedDates = dateKeys(plan.startDate, plan.endDate).filter((date) => !activeDates.has(date));
  const canManage = membership.role === "owner" || membership.role === "editor";
  const memberPreferences = canManage ? await db.select().from(groupPreferences).where(eq(groupPreferences.groupId, plan.groupId)) : [];
  const memberAvailability = canManage ? await db.select().from(shiftAvailability).where(eq(shiftAvailability.groupId, plan.groupId)) : [];
  const requests = canManage && requestPeriod ? await db.select().from(shiftRequests).where(eq(shiftRequests.periodId, requestPeriod.id)) : [];
  const requestSubmissions = canManage && requestPeriod ? await db.select().from(shiftRequestSubmissions).where(eq(shiftRequestSubmissions.periodId, requestPeriod.id)) : [];
  return Response.json({ currentEmail: user.email, plan, slots, assignments, members: members.map((member) => toPublicMember(member, canViewAdminNote(membership.role))), closedDates, requestPeriod: requestPeriod ?? null, memberPreferences, memberAvailability, requests, requestSubmissions, autoBreakSuggestion: group?.autoBreakSuggestion !== false, laborRules: group ? { plannedBreakWarning: group.laborPlannedBreakWarning, dailyHoursWarning: group.laborDailyHoursWarning, weeklyHoursWarning: group.laborWeeklyHoursWarning, restIntervalWarning: group.laborRestIntervalWarning, consecutiveDaysWarning: group.laborConsecutiveDaysWarning, weeklyRestWarning: group.laborWeeklyRestWarning, dailyHoursLimitMinutes: group.laborDailyHoursLimitMinutes, weeklyHoursLimitMinutes: group.laborWeeklyHoursLimitMinutes, restIntervalMinutes: group.laborRestIntervalMinutes, consecutiveDaysLimit: group.laborConsecutiveDaysLimit, weeklyRestDaysRequired: group.laborWeeklyRestDaysRequired, fourWeekRestDaysRequired: group.laborFourWeekRestDaysRequired } : undefined });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, id)).limit(1);
  if (!plan) return Response.json({ error: "シフト計画が見つかりません" }, { status: 404 });
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "シフト計画の削除にはグループの編集権限が必要です" }, { status: 403 });
  if (plan.status !== "draft") return Response.json({ error: "公開済みのシフトは削除できません。先に公開を取り消してください" }, { status: 409 });
  const slots = await db.select({ id: shiftSlots.id }).from(shiftSlots).where(eq(shiftSlots.planId, id));
  const [requestPeriod] = await db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.planId, id)).limit(1);
  const statements = chunk(slots.map((slot) => slot.id), 50).flatMap((slotIds) => [
    db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)),
    db.delete(shiftSlots).where(inArray(shiftSlots.id, slotIds)),
  ]);
  statements.push(db.delete(events).where(eq(events.shiftPlanId, id)));
  if (requestPeriod) statements.push(db.delete(shiftRequestSubmissions).where(eq(shiftRequestSubmissions.periodId, requestPeriod.id)));
  statements.push(db.delete(shiftRequestPeriods).where(eq(shiftRequestPeriods.planId, id)));
  statements.push(db.delete(shiftPlans).where(eq(shiftPlans.id, id)));
  await db.batch(statements);
  await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: "shift.delete", entityType: "shiftPlan", entityId: id, summary: `下書きシフトを削除: ${plan.name}` });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const db = getDb();
  const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, id)).limit(1);
  if (!plan) return Response.json({ error: "シフト計画が見つかりません" }, { status: 404 });
  const membership = await getMembership(plan.groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "シフト編集にはグループの編集権限が必要です" }, { status: 403 });
  let body: { action?: "start-requests"; name?: string; requestCloseDate?: string; reason?: string; expectedVersion?: number; layout?: { notes?: string; slots?: Array<{ id?: string; date: string; startTime: string; endTime: string; requiredCount: number; role?: string }>; closedDates?: string[] }; assignments?: Record<string, string[]>; status?: "draft" | "published" };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト本文のJSONを解析できませんでした" }, { status: 400 });
  }
  const nextName = body.name?.trim();
  if (body.name !== undefined && !nextName)
    return Response.json({ error: "シフト名を入力してください" }, { status: 400 });
  if (plan.status === "published" && body.status === "draft")
    return Response.json({ error: "公開済みのシフトを下書きへ戻すことはできません" }, { status: 409 });
  if (body.expectedVersion !== undefined && body.expectedVersion !== plan.version)
    return Response.json({ error: "このシフトは別の管理者によって更新されています。最新状態を読み直してから再度保存してください。", conflict: true, latestVersion: plan.version, latestPlan: plan }, { status: 409 });
  const expectedVersion = body.expectedVersion;
  let nextVersion = plan.version + 1;
  if (expectedVersion !== undefined) {
    const [locked] = await db.update(shiftPlans)
      .set({ version: expectedVersion + 1 })
      .where(and(eq(shiftPlans.id, id), eq(shiftPlans.version, expectedVersion)))
      .returning({ version: shiftPlans.version });
    if (!locked) {
      const [latestPlan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, id)).limit(1);
      return Response.json({ error: "このシフトは別の管理者によって更新されています。最新状態を読み直してから再度保存してください。", conflict: true, latestVersion: latestPlan?.version ?? plan.version, latestPlan: latestPlan ?? plan }, { status: 409 });
    }
    nextVersion = locked.version;
  }
  const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  let currentSlots = slots;
  const beforeAssignmentChunks = await Promise.all(chunk(slots.map((slot) => slot.id), 50).map((slotIds) => slotIds.length ? db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)) : Promise.resolve([])));
  const beforeAssignments = beforeAssignmentChunks.flat();
  const [requestPeriod] = await db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.planId, id)).limit(1);
  if (body.layout) {
    const closedDates = new Set(body.layout.closedDates ?? []);
    const nextSlots = (body.layout.slots ?? []).filter((slot) => !closedDates.has(slot.date) && slot.date >= plan.startDate && slot.date <= plan.endDate && isValidShiftTime(slot.startTime) && isValidShiftTime(slot.endTime) && shiftTimeToMinutes(slot.startTime) < shiftTimeToMinutes(slot.endTime)).map((slot) => ({ id: slot.id ?? crypto.randomUUID(), planId: id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, requiredCount: Math.max(1, Math.min(50, Number(slot.requiredCount) || 1)), role: slot.role?.trim() ?? "" }));
     const beforeLayout = new Map(slots.map((slot) => [slot.id, `${slot.date}|${slot.startTime}|${slot.endTime}|${slot.role}|${slot.requiredCount}`]));
     const layoutChanges = nextSlots.flatMap((slot) => beforeLayout.get(slot.id) === `${slot.date}|${slot.startTime}|${slot.endTime}|${slot.role}|${slot.requiredCount}` ? [] : [{ id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, role: slot.role, requiredCount: slot.requiredCount }]);
    const statements = [
      ...chunk(slots.map((slot) => slot.id), 50).map((slotIds) => db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds))),
      db.delete(shiftSlots).where(eq(shiftSlots.planId, id)),
      ...chunk(nextSlots, 8).map((rows) => db.insert(shiftSlots).values(rows)),
      db.update(shiftPlans).set({ ...(nextName !== undefined ? { name: nextName } : {}), notes: body.layout.notes?.trim().slice(0, 2000) ?? plan.notes, ...(expectedVersion === undefined ? { version: nextVersion } : {}) }).where(eq(shiftPlans.id, id)),
    ];
    if (body.requestCloseDate && requestPeriod?.status === "pending") statements.push(db.update(shiftRequestPeriods).set({ closesOn: body.requestCloseDate }).where(eq(shiftRequestPeriods.id, requestPeriod.id)));
    await db.batch(statements);
    await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: "shift.update", entityType: "shiftPlan", entityId: id, summary: `シフト枠を保存: ${plan.name}`, details: { slotCount: nextSlots.length, closedDates: body.layout.closedDates ?? [] } });
    if (plan.status === "published") await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: "shift.update", entityType: "shiftPlan", entityId: id, summary: `公開済みシフトの枠を更新: ${plan.name}`, details: { changeType: "layout", reason: body.reason?.trim().slice(0, 300) ?? "", changedSlotCount: layoutChanges.length, changedSlots: layoutChanges.slice(0, 40), closedDates: body.layout.closedDates ?? [] } });
    currentSlots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
    if (body.action !== "start-requests" && body.assignments === undefined) return Response.json({ ok: true, slotCount: nextSlots.length });
  }
  if (body.action === "start-requests") {
    if (!requestPeriod || requestPeriod.status !== "pending") return Response.json({ error: "この勤務枠はすでに受付開始済みです" }, { status: 409 });
    const closesOn = body.requestCloseDate ?? requestPeriod.closesOn;
    if (!closesOn) return Response.json({ error: "シフト希望受付期限を設定してください" }, { status: 400 });
    const demoNow = await getDemoNow(plan.groupId);
    const opensOn = jstDate(demoNow);
    await db.batch([
      db.update(shiftRequestPeriods).set({ opensOn, closesOn, status: "open" }).where(eq(shiftRequestPeriods.id, requestPeriod.id)),
      ...(expectedVersion === undefined ? [db.update(shiftPlans).set({ version: nextVersion }).where(eq(shiftPlans.id, id))] : []),
    ]);
    await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: "shift.request.open", entityType: "shiftRequestPeriod", entityId: requestPeriod.id, summary: `勤務希望受付を開始: ${plan.name}`, details: { closesOn } });
    return Response.json({ ok: true, status: "open", opensOn, closesOn, demoTime: { currentAt: demoNow.toISOString(), today: opensOn, timezone: "Asia/Tokyo" } });
  }
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, plan.groupId), eq(groupMembers.status, "active")));
  const validUsers = new Set(members.map((member) => member.userEmail));
  const requested = body.assignments ?? {};
  const allRows = currentSlots.flatMap((slot) => [...new Set((requested[slot.id] ?? []).filter((email) => validUsers.has(email)))].map((userEmail) => ({ id: crypto.randomUUID(), slotId: slot.id, userEmail })));
  const [groupRules] = await db.select({ autoBreakSuggestion: groups.autoBreakSuggestion, laborPlannedBreakWarning: groups.laborPlannedBreakWarning, laborDailyHoursWarning: groups.laborDailyHoursWarning, laborWeeklyHoursWarning: groups.laborWeeklyHoursWarning, laborRestIntervalWarning: groups.laborRestIntervalWarning, laborConsecutiveDaysWarning: groups.laborConsecutiveDaysWarning, laborWeeklyRestWarning: groups.laborWeeklyRestWarning, laborDailyHoursLimitMinutes: groups.laborDailyHoursLimitMinutes, laborWeeklyHoursLimitMinutes: groups.laborWeeklyHoursLimitMinutes, laborRestIntervalMinutes: groups.laborRestIntervalMinutes, laborConsecutiveDaysLimit: groups.laborConsecutiveDaysLimit, laborWeeklyRestDaysRequired: groups.laborWeeklyRestDaysRequired, laborFourWeekRestDaysRequired: groups.laborFourWeekRestDaysRequired }).from(groups).where(eq(groups.id, plan.groupId)).limit(1);
  const laborWarnings = buildLaborWarnings({
    slots: currentSlots,
    assignments: allRows,
    members,
    autoBreakSuggestion: groupRules?.autoBreakSuggestion !== false,
    rules: groupRules ? { plannedBreakWarning: groupRules.laborPlannedBreakWarning, dailyHoursWarning: groupRules.laborDailyHoursWarning, weeklyHoursWarning: groupRules.laborWeeklyHoursWarning, restIntervalWarning: groupRules.laborRestIntervalWarning, consecutiveDaysWarning: groupRules.laborConsecutiveDaysWarning, weeklyRestWarning: groupRules.laborWeeklyRestWarning, dailyHoursLimitMinutes: groupRules.laborDailyHoursLimitMinutes, weeklyHoursLimitMinutes: groupRules.laborWeeklyHoursLimitMinutes, restIntervalMinutes: groupRules.laborRestIntervalMinutes, consecutiveDaysLimit: groupRules.laborConsecutiveDaysLimit, weeklyRestDaysRequired: groupRules.laborWeeklyRestDaysRequired, fourWeekRestDaysRequired: groupRules.laborFourWeekRestDaysRequired } : undefined,
    planStartDate: plan.startDate,
    planEndDate: plan.endDate,
  });
  const warnings: string[] = [
    ...currentSlots.flatMap((slot) => {
      const count = new Set(requested[slot.id] ?? []).size;
      return count < slot.requiredCount ? [`${slot.date} ${slot.startTime}：必要人数${slot.requiredCount}人に対して${count}人です`] : count > slot.requiredCount ? [`${slot.date} ${slot.startTime}：必要人数を${count - slot.requiredCount}人超えています`] : [];
    }),
    ...laborWarnings.map((warning) => warning.message),
  ];
  const beforeBySlot = new Map<string, Set<string>>();
  for (const row of beforeAssignments) {
    const users = beforeBySlot.get(row.slotId) ?? new Set<string>();
    users.add(row.userEmail);
    beforeBySlot.set(row.slotId, users);
  }
  const afterBySlot = new Map<string, Set<string>>();
  for (const row of allRows) {
    const users = afterBySlot.get(row.slotId) ?? new Set<string>();
    users.add(row.userEmail);
    afterBySlot.set(row.slotId, users);
  }
  const assignmentChanges = currentSlots.flatMap((slot) => {
    const before = beforeBySlot.get(slot.id) ?? new Set<string>();
    const after = afterBySlot.get(slot.id) ?? new Set<string>();
    const added = [...after].filter((email) => !before.has(email));
    const removed = [...before].filter((email) => !after.has(email));
    return added.length || removed.length ? [{ date: slot.date, startTime: slot.startTime, endTime: slot.endTime, role: slot.role, added, removed }] : [];
  });
  const assignedSlots = currentSlots.flatMap((slot) => [...new Set(requested[slot.id] ?? [])].map((userEmail) => ({ slot, userEmail })));
  for (let index = 0; index < assignedSlots.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < assignedSlots.length; nextIndex += 1) {
      const left = assignedSlots[index];
      const right = assignedSlots[nextIndex];
      if (left.userEmail === right.userEmail && left.slot.date === right.slot.date && shiftTimeToMinutes(left.slot.startTime) < shiftTimeToMinutes(right.slot.endTime) && shiftTimeToMinutes(right.slot.startTime) < shiftTimeToMinutes(left.slot.endTime)) warnings.push(`${left.slot.date} ${left.userEmail}：${left.slot.role || "共通"}と${right.slot.role || "共通"}の時間帯が重複しています`);
    }
  }
  const status = body.status ?? plan.status;
  const statements = chunk(currentSlots.map((slot) => slot.id), 50).map((slotIds) => db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)));
  for (const rows of chunk(allRows, 8)) statements.push(db.insert(shiftAssignments).values(rows));
  statements.push(db.update(shiftPlans).set({ ...(nextName !== undefined ? { name: nextName } : {}), status, ...(expectedVersion === undefined ? { version: nextVersion } : {}) }).where(eq(shiftPlans.id, id)));
  if (status === "published") {
    statements.push(db.delete(events).where(eq(events.shiftPlanId, id)));
    const profiles = members.length ? await db.select().from(accountProfiles).where(inArray(accountProfiles.userEmail, members.map((member) => member.userEmail))) : [];
    const memberNames = new Map(members.map((member) => [member.userEmail, member.displayName?.trim() || profiles.find((profile) => profile.userEmail === member.userEmail)?.nickname?.trim() || member.userEmail.split("@")[0]]));
    const [group] = await db.select().from(groups).where(eq(groups.id, plan.groupId)).limit(1);
    const publishedEvents = currentSlots.map((slot) => ({ slot, assigned: allRows.filter((row) => row.slotId === slot.id).map((row) => memberNames.get(row.userEmail) ?? row.userEmail) })).filter((item) => item.assigned.length > 0).map((item) => { const start = shiftDateTime(item.slot.date, item.slot.startTime); const end = shiftDateTime(item.slot.date, item.slot.endTime); return { id: crypto.randomUUID(), ownerEmail: plan.createdBy, groupId: plan.groupId, shiftPlanId: id, title: item.slot.role?.trim() || group?.name || "予定", date: start.date, endDate: end.date, startTime: start.time, endTime: end.time, category: "仕事", notes: `担当：${item.assigned.join("、")}`, completed: false }; });
    for (const rows of chunk(publishedEvents, 8)) statements.push(db.insert(events).values(rows));
  }
  await db.batch(statements);
  await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: status === "published" ? "shift.publish" : "shift.assign", entityType: "shiftPlan", entityId: id, summary: status === "published" ? `シフトを公開: ${plan.name}` : `担当割り当てを保存: ${plan.name}`, details: { assignedCount: allRows.length, warnings: warnings.length } });
  if (plan.status === "published") {
    await recordAudit({ groupId: plan.groupId, userEmail: user.email, action: "shift.update", entityType: "shiftPlan", entityId: id, summary: `公開済みシフトを更新: ${plan.name}`, details: { changeType: "assignments", reason: body.reason?.trim().slice(0, 300) ?? "", assignmentChangeCount: assignmentChanges.length, assignmentChanges: assignmentChanges.slice(0, 40), assignedCount: allRows.length, warnings: warnings.length } });
    const recipients = [...new Set(assignmentChanges.flatMap((change) => [...change.added, ...change.removed]))];
    await createSystemMessagesAndPush(db, { groupId: plan.groupId, recipients, eventId: `shift-change:${id}:${nextVersion}`, eventType: "published_shift_changed", body: "公開済みシフトが更新されました。シフト一覧を確認してください。", pushTitle: "KINBAN", pushBody: "公開済みシフトが更新されました", url: `/?group=${encodeURIComponent(plan.groupId)}&view=roster` });
  }
  return Response.json({ ok: true, status, warnings, laborWarnings });
}
