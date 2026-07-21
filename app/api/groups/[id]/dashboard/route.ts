import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import {
  announcementReads,
  groupAnnouncements,
  groupMembers,
  groups,
  monthlyWorkClaims,
  shiftAssignments,
  shiftPlans,
  shiftRequestPeriods,
  shiftRequestSubmissions,
  shiftSlots,
  workBreaks,
  workRecords,
} from "../../../../../db/schema";
import { getMembership } from "../../group-access";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const managerRoles = new Set(["owner", "editor"]);
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function previousMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export async function GET(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id: groupId } = await context.params;
  const membership = await getMembership(groupId, user.email);
  if (!membership || !managerRoles.has(membership.role))
    return Response.json({ error: "管理者権限が必要です" }, { status: 403 });

  const db = getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });

  const today = todayJst();
  const currentMonth = monthKey(today);
  const previousMonthKey = previousMonth(currentMonth);
  const [members, plans, periods, announcements, reads] = await Promise.all([
    db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active"))),
    db.select().from(shiftPlans).where(eq(shiftPlans.groupId, groupId)),
    db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.groupId, groupId)),
    db.select().from(groupAnnouncements).where(eq(groupAnnouncements.groupId, groupId)),
    db.select().from(announcementReads).where(eq(announcementReads.userEmail, user.email)),
  ]);
  const publishedPlans = plans.filter((plan) => plan.status === "published");
  const planIds = publishedPlans.map((plan) => plan.id);
  const slots = planIds.length
    ? await db.select().from(shiftSlots).where(inArray(shiftSlots.planId, planIds))
    : [];
  const slotIds = slots.map((slot) => slot.id);
  const assignments = slotIds.length
    ? (
        await Promise.all(
          chunk(slotIds, 50).map((ids) =>
            db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, ids)),
          ),
        )
      ).flat()
    : [];
  const records = await db.select().from(workRecords).where(eq(workRecords.groupId, groupId));
  const recordIds = records.map((record) => record.id);
  const breaks = recordIds.length
    ? (
        await Promise.all(
          chunk(recordIds, 50).map((ids) =>
            db.select().from(workBreaks).where(inArray(workBreaks.workRecordId, ids)),
          ),
        )
      ).flat()
    : [];
  const breaksByRecord = new Map(breaks.map((item) => [item.workRecordId, item]));
  const membersByEmail = new Map(members.map((member) => [member.userEmail, member]));
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const assignmentsBySlot = new Map<string, string[]>();
  for (const assignment of assignments) {
    const current = assignmentsBySlot.get(assignment.slotId) ?? [];
    current.push(assignment.userEmail);
    assignmentsBySlot.set(assignment.slotId, current);
  }
  const recordsBySlotMember = new Map(records.map((record) => [`${record.slotId ?? ""}|${record.userEmail}`, record]));
  const todayRows = assignments
    .map((assignment) => {
      const slot = slotsById.get(assignment.slotId);
      const plan = slot ? plansById.get(slot.planId) : undefined;
      if (!slot || !plan || slot.date !== today) return null;
      const record = recordsBySlotMember.get(`${slot.id}|${assignment.userEmail}`) ?? null;
      const breakRow = record ? breaksByRecord.get(record.id) : undefined;
      const status = !record?.startedAt
        ? "未打刻"
        : breakRow?.startedAt && !breakRow.endedAt
          ? "休憩中"
          : record.endedAt
            ? "勤務終了"
            : "勤務中";
      return {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        role: slot.role,
        planName: plan.name,
        userEmail: assignment.userEmail,
        displayName: membersByEmail.get(assignment.userEmail)?.displayName ?? assignment.userEmail.split("@")[0],
        status,
        startedAt: record?.startedAt ?? null,
        endedAt: record?.endedAt ?? null,
      };
    })
    .filter(Boolean);

  const requestByPlan = new Map(periods.map((period) => [period.planId, period]));
  const submissions = periods.length
    ? (
        await Promise.all(
          chunk(periods.map((period) => period.id), 50).map((ids) =>
            db.select().from(shiftRequestSubmissions).where(inArray(shiftRequestSubmissions.periodId, ids)),
          ),
        )
      ).flat()
    : [];
  const requestActionItems = periods
    .filter((period) => period.status === "open")
    .map((period) => ({
      planId: period.planId,
      planName: plansById.get(period.planId)?.name ?? period.name,
      closesOn: period.closesOn,
      savedCount: new Set(submissions.filter((submission) => submission.periodId === period.id).map((submission) => submission.userEmail)).size,
      memberCount: members.length,
      daysUntilClose: Math.ceil((new Date(`${period.closesOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000),
    }));

  const coverage = publishedPlans.map((plan) => {
    const planSlots = slots.filter((slot) => slot.planId === plan.id);
    let shortageSlotCount = 0;
    let shortageMemberCount = 0;
    for (const slot of planSlots) {
      const assigned = new Set(assignmentsBySlot.get(slot.id) ?? []);
      const shortage = Math.max(0, slot.requiredCount - assigned.size);
      if (shortage) {
        shortageSlotCount += 1;
        shortageMemberCount += shortage;
      }
    }
    return { planId: plan.id, planName: plan.name, startDate: plan.startDate, endDate: plan.endDate, shortageSlotCount, shortageMemberCount };
  });
  const closedBeforePublish = plans
    .filter((plan) => plan.status === "draft" && requestByPlan.get(plan.id)?.status === "closed")
    .map((plan) => ({ planId: plan.id, planName: plan.name, startDate: plan.startDate, endDate: plan.endDate }));

  const scheduledPast = assignments
    .map((assignment) => {
      const slot = slotsById.get(assignment.slotId);
      return slot && slot.date < today ? { slot, userEmail: assignment.userEmail } : null;
    })
    .filter(Boolean) as Array<{ slot: typeof slots[number]; userEmail: string }>;
  const dailyPending = scheduledPast.filter(({ slot, userEmail }) => {
    const record = recordsBySlotMember.get(`${slot.id}|${userEmail}`);
    return !record || record.status !== "approved";
  }).length;
  const plannedPreviousMembers = new Set(scheduledPast.filter(({ slot }) => monthKey(slot.date) === previousMonthKey).map(({ userEmail }) => userEmail));
  const previousClaims = await db.select().from(monthlyWorkClaims).where(and(eq(monthlyWorkClaims.groupId, groupId), eq(monthlyWorkClaims.monthKey, previousMonthKey)));
  const monthlyPending = [...plannedPreviousMembers].filter((email) => previousClaims.find((claim) => claim.userEmail === email)?.status !== "approved").length;
  const unreadAnnouncementCount = announcements.filter((announcement) => !reads.some((read) => read.announcementId === announcement.id)).length;

  return Response.json({
    today,
    currentMonth,
    previousMonth: previousMonthKey,
    members: members.length,
    todaySchedule: todayRows,
    requestActionItems,
    closedBeforePublish,
    coverage,
    approvals: { dailyPending, previousMonthPending: monthlyPending },
    announcements: { total: announcements.length, unread: unreadAnnouncementCount },
    totals: { publishedPlans: publishedPlans.length, requestOpen: requestActionItems.length, shortagePlans: coverage.filter((item) => item.shortageSlotCount > 0).length },
  });
}
