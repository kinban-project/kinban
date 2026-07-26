import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  groupMembers,
  monthlyWorkClaims,
  shiftAssignments,
  shiftPlans,
  shiftSlots,
  workBreaks,
  workRecords,
} from "../../../../../db/schema";
import { getMembership } from "../../group-access";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { toPublicMember } from "../../member-dto";
import { shiftTimeToMinutes } from "../../../../shift-time";
import { sendBusinessPush } from "../../../../notification-events";
import { getDemoNow, jstDate } from "../../../../demo-clock";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, value] = month.split("-").map(Number);
  if (value < 1 || value > 12) return null;
  const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
    days: Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  };
}

function minutesBetween(start: string, end: string) {
  const from = shiftTimeToMinutes(start);
  const to = shiftTimeToMinutes(end);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from : 0;
}

function workedMinutes(record: typeof workRecords.$inferSelect) {
  const start = record.claimedStartAt ?? record.startedAt;
  const end = record.claimedEndAt ?? record.endedAt;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) - (record.claimedBreakMinutes ?? 0));
}

function chunk<T>(values: T[], size = 50) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function identity() {
  const user = await getChatGPTUser();
  return user?.email ?? null;
}

export async function GET(request: Request, context: Context) {
  const userEmail = await identity();
  if (!userEmail) return jsonError("ログインが必要です", 401);
  const { id: groupId } = await context.params;
  const membership = await getMembership(groupId, userEmail);
  if (!membership) return jsonError("グループのメンバーではありません", 403);
  const manager = membership.role === "owner" || membership.role === "editor";
  const requestedEmail = manager ? new URL(request.url).searchParams.get("userEmail") ?? userEmail : userEmail;
  const demoNow = await getDemoNow(groupId);
  const month = new URL(request.url).searchParams.get("month") ?? jstDate(demoNow).slice(0, 7);
  const bounds = monthBounds(month);
  if (!bounds) return jsonError("monthはYYYY-MM形式で指定してください", 400);
  const db = getDb();
  const members = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  const visibleMembers = manager ? members : members.filter((member) => member.userEmail === userEmail);
  const plans = await db.select().from(shiftPlans).where(and(eq(shiftPlans.groupId, groupId), lte(shiftPlans.startDate, bounds.end), gte(shiftPlans.endDate, bounds.start)));
  const planIds = plans.map((plan) => plan.id);
  const slots = planIds.length ? await db.select().from(shiftSlots).where(inArray(shiftSlots.planId, planIds)) : [];
  const slotIds = slots.map((slot) => slot.id);
  const assignments = (await Promise.all(chunk(slotIds).map((ids) => db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, ids))))).flat();
  const records = await db.select().from(workRecords).where(and(eq(workRecords.groupId, groupId), gte(workRecords.scheduledDate, bounds.start), lte(workRecords.scheduledDate, bounds.end), ...(manager ? [] : [eq(workRecords.userEmail, userEmail)])));
  const recordIds = records.map((record) => record.id);
  const breaks = (await Promise.all(chunk(recordIds).map((ids) => db.select().from(workBreaks).where(inArray(workBreaks.workRecordId, ids))))).flat();
  const claims = await db.select().from(monthlyWorkClaims).where(and(eq(monthlyWorkClaims.groupId, groupId), eq(monthlyWorkClaims.monthKey, month)));
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const planMap = new Map(plans.map((plan) => [plan.id, plan]));
  const memberMap = new Map(visibleMembers.map((member) => [member.userEmail, member]));
  const assignmentByUser = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!memberMap.has(assignment.userEmail)) continue;
    assignmentByUser.set(assignment.userEmail, [...(assignmentByUser.get(assignment.userEmail) ?? []), assignment]);
  }
  const recordsByUser = new Map<string, typeof records>();
  for (const record of records) recordsByUser.set(record.userEmail, [...(recordsByUser.get(record.userEmail) ?? []), record]);
  const breakMinutesByRecord = new Map<string, number>();
  for (const item of breaks) if (item.endedAt) breakMinutesByRecord.set(item.workRecordId, (breakMinutesByRecord.get(item.workRecordId) ?? 0) + Math.max(0, Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)));
  const summaries = visibleMembers.map((member) => {
    const userAssignments = assignmentByUser.get(member.userEmail) ?? [];
    const userRecords = recordsByUser.get(member.userEmail) ?? [];
    const plannedMinutes = userAssignments.reduce((total, item) => { const slot = slotMap.get(item.slotId); return total + (slot ? minutesBetween(slot.startTime, slot.endTime) : 0); }, 0);
    const declaredMinutes = userRecords.reduce((total, record) => total + workedMinutes(record), 0);
    const missingCount = userRecords.filter((record) => !record.claimedStartAt || !record.claimedEndAt).length;
    const unresolvedCount = userRecords.filter((record) => ["unsubmitted", "working", "rejected"].includes(record.status)).length;
    const offScheduleCount = userRecords.filter((record) => !record.slotId).length;
    return { userEmail: member.userEmail, displayName: member.displayName ?? member.userEmail.split("@")[0], plannedMinutes, declaredMinutes, missingCount, unresolvedCount, offScheduleCount, status: claims.find((claim) => claim.userEmail === member.userEmail)?.status ?? "unsubmitted" };
  });
  const days = bounds.days.map((date) => ({
    date,
    planned: assignments.filter((assignment) => { const slot = slotMap.get(assignment.slotId); return slot?.date === date && assignment.userEmail === requestedEmail; }).map((assignment) => { const slot = slotMap.get(assignment.slotId)!; return { startTime: slot.startTime, endTime: slot.endTime, role: slot.role, planName: planMap.get(slot.planId)?.name ?? "" }; }),
    records: records.filter((record) => record.userEmail === requestedEmail && record.scheduledDate === date).map((record) => ({ ...record, workedMinutes: workedMinutes(record), breakMinutes: record.claimedBreakMinutes ?? breakMinutesByRecord.get(record.id) ?? 0 })),
  }));
  return Response.json({ month, demoTime: { currentAt: demoNow.toISOString(), today: jstDate(demoNow), timezone: "Asia/Tokyo" }, members: visibleMembers.map((member) => toPublicMember(member, manager)), claims, summaries, days, viewedUserEmail: requestedEmail, canManage: manager, currentUserEmail: userEmail });
}

export async function POST(request: Request, context: Context) {
  const userEmail = await identity();
  if (!userEmail) return jsonError("ログインが必要です", 401);
  const { id: groupId } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: string; month?: string; userEmail?: string; managerNote?: string };
  const month = body.month ?? "";
  if (!monthBounds(month)) return jsonError("monthはYYYY-MM形式で指定してください", 400);
  const membership = await getMembership(groupId, userEmail);
  if (!membership) return jsonError("グループのメンバーではありません", 403);
  const manager = membership.role === "owner" || membership.role === "editor";
  const targetEmail = manager && body.userEmail ? body.userEmail : userEmail;
  const now = (await getDemoNow(groupId)).toISOString();
  const db = getDb();
  const [existing] = await db.select().from(monthlyWorkClaims).where(and(eq(monthlyWorkClaims.groupId, groupId), eq(monthlyWorkClaims.userEmail, targetEmail), eq(monthlyWorkClaims.monthKey, month))).limit(1);
  if (body.action === "submit") {
    if (targetEmail !== userEmail) return jsonError("本人の月次申告のみ実行できます", 403);
    if (existing?.status === "approved") return jsonError("月次承認済みのため変更できません", 409);
    if (existing) await db.update(monthlyWorkClaims).set({ status: "submitted", submittedAt: now, approvedAt: null, approvedBy: null, updatedAt: now }).where(eq(monthlyWorkClaims.id, existing.id));
    else await db.insert(monthlyWorkClaims).values({ id: crypto.randomUUID(), groupId, userEmail: targetEmail, monthKey: month, status: "submitted", submittedAt: now, managerNote: "" });
    return Response.json({ ok: true, status: "submitted" });
  }
  if (!manager) return jsonError("管理者権限が必要です", 403);
  if (!existing) return jsonError("月次申告がありません", 404);
  if (body.action === "approve" || body.action === "reject" || body.action === "reopen") {
    if (body.action === "approve" && existing.status !== "submitted") return jsonError("月次申告済みのメンバーのみ承認できます", 400);
    if (body.action === "reopen" && existing.status !== "approved") return jsonError("月次承認済みの申告のみ解除できます", 400);
    const nextStatus = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "submitted";
    await db.update(monthlyWorkClaims).set({ status: nextStatus, approvedAt: body.action === "approve" ? now : null, approvedBy: body.action === "approve" ? userEmail : null, managerNote: body.managerNote?.trim().slice(0, 500) ?? existing.managerNote, updatedAt: now }).where(eq(monthlyWorkClaims.id, existing.id));
    const bounds = monthBounds(month)!;
    await db.update(workRecords).set(
      body.action === "approve"
        ? { monthlyClosedAt: now, monthlyClosedBy: userEmail, updatedAt: now }
        : { monthlyClosedAt: null, monthlyClosedBy: null, updatedAt: now },
    ).where(and(
      eq(workRecords.groupId, groupId),
      eq(workRecords.userEmail, targetEmail),
      gte(workRecords.scheduledDate, bounds.start),
      lte(workRecords.scheduledDate, bounds.end),
    ));
    if (body.action === "reject") await sendBusinessPush(db, { recipients: [targetEmail], eventId: `monthly-work-rejected:${existing.id}:${now}`, title: "KINBAN", body: "勤怠の確認・修正が必要です", url: `/?group=${encodeURIComponent(groupId)}&view=monthly-work`, urgency: "high" });
    return Response.json({ ok: true, status: nextStatus });
  }
  return jsonError("不明な操作です", 400);
}
