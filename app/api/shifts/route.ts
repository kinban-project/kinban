import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  groupDuties,
  groupMembers,
  shiftAssignments,
  shiftPlans,
  shiftRequestPeriods,
  shiftRequestSubmissions,
  shiftSlots,
} from "../../../db/schema";
import { getMembership } from "../groups/group-access";
import { isValidShiftTime, minutesToShiftTime, shiftTimeToMinutes } from "../../shift-time";
import { recordAudit } from "../../audit-log";
import { getDemoNow, jstDate } from "../../demo-clock";

export const dynamic = "force-dynamic";

function minutes(value: string) { return shiftTimeToMinutes(value); }
function time(value: number) {
  return minutesToShiftTime(value);
}
function dateKeys(start: string, end: string) {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
function dateMinusDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function defaultRequestCloseDate(startDate: string, minimumDate: string) {
  return dateMinusDays(startDate, 15) > minimumDate
    ? dateMinusDays(startDate, 15)
    : minimumDate;
}
type CustomSlot = {
  date: string;
  startTime: string;
  endTime: string;
  requiredCount: number;
  role: string;
  dutyId: string | null;
  dutyNameSnapshot: string | null;
  coverageDutyIds: string | null;
};
function parseCustomSlots(
  input: unknown,
  planId: string,
  startDate: string,
  endDate: string,
): CustomSlot[] & Array<{ id: string; planId: string }> {
  const parsed =
    typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { slots?: unknown }).slots)
      ? (parsed as { slots: unknown[] }).slots
      : null;
  if (!rows?.length)
    throw new Error("slots配列に1件以上の枠を指定してください");
  const used = new Set<string>();
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== "object")
      throw new Error(`${index + 1}件目の枠が不正です`);
    const item = raw as Record<string, unknown>;
    const date = String(item.date ?? "");
    const startTime = String(item.startTime ?? "");
    const endTime = String(item.endTime ?? "");
    const role = String(item.role ?? "")
      .trim()
      .slice(0, 100);
    const dutyId = typeof item.dutyId === "string" && item.dutyId.trim() ? item.dutyId.trim() : null;
    const coverageDutyIds = Array.isArray(item.coverageDutyIds)
      ? JSON.stringify(item.coverageDutyIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
      : null;
    const requiredCount = Number(item.requiredCount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < startDate || date > endDate)
      throw new Error(`${index + 1}件目の日付が勤務枠の期間外です`);
    if (
      !isValidShiftTime(startTime) ||
      !isValidShiftTime(endTime) ||
      minutes(startTime) >= minutes(endTime)
    )
      throw new Error(
        `${index + 1}件目の時刻は30分単位で、開始より終了を後にしてください（終了は30:00まで）`,
      );
    if (
      !Number.isInteger(requiredCount) ||
      requiredCount < 1 ||
      requiredCount > 50
    )
      throw new Error(
        `${index + 1}件目の必要人数は1〜50の整数で指定してください`,
      );
    const key = `${date}|${startTime}|${endTime}|${role}|${dutyId ?? ""}`;
    if (used.has(key)) throw new Error(`${index + 1}件目の枠が重複しています`);
    used.add(key);
    return {
      id: crypto.randomUUID(),
      planId,
      date,
      startTime: minutesToShiftTime(minutes(startTime)),
      endTime: minutesToShiftTime(minutes(endTime)),
      requiredCount,
      role,
      dutyId,
      dutyNameSnapshot: null,
      coverageDutyIds,
    };
  }) as CustomSlot[] & Array<{ id: string; planId: string }>;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const groupId = new URL(request.url).searchParams.get("groupId");
  if (!groupId)
    return Response.json({ error: "groupIdが必要です" }, { status: 400 });
  if (!(await getMembership(groupId, user.email)))
    return Response.json(
      { error: "グループのメンバーではありません" },
      { status: 403 },
    );
  const db = getDb();
  const plans = await db
    .select()
    .from(shiftPlans)
    .where(eq(shiftPlans.groupId, groupId))
    .orderBy(desc(shiftPlans.startDate));
  const periods = await db
    .select()
    .from(shiftRequestPeriods)
    .where(eq(shiftRequestPeriods.groupId, groupId));
  const members = await db
    .select({ userEmail: groupMembers.userEmail })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  const assignmentRows = await db
    .select({
      planId: shiftPlans.id,
      slotId: shiftSlots.id,
      requiredCount: shiftSlots.requiredCount,
      userEmail: shiftAssignments.userEmail,
    })
    .from(shiftSlots)
    .innerJoin(shiftPlans, eq(shiftSlots.planId, shiftPlans.id))
    .leftJoin(shiftAssignments, eq(shiftAssignments.slotId, shiftSlots.id))
    .where(eq(shiftPlans.groupId, groupId));
  const assignmentStats = new Map<string, { shortageSlotCount: number; shortageMemberCount: number; assignedSlotCount: number }>();
  const slotAssignments = new Map<string, { planId: string; requiredCount: number; users: Set<string> }>();
  for (const row of assignmentRows) {
    const slot = slotAssignments.get(row.slotId) ?? { planId: row.planId, requiredCount: row.requiredCount, users: new Set<string>() };
    if (row.userEmail) slot.users.add(row.userEmail);
    slotAssignments.set(row.slotId, slot);
  }
  for (const slot of slotAssignments.values()) {
    const stats = assignmentStats.get(slot.planId) ?? { shortageSlotCount: 0, shortageMemberCount: 0, assignedSlotCount: 0 };
    const shortage = Math.max(0, slot.requiredCount - slot.users.size);
    if (shortage > 0) {
      stats.shortageSlotCount += 1;
      stats.shortageMemberCount += shortage;
    } else {
      stats.assignedSlotCount += 1;
    }
    assignmentStats.set(slot.planId, stats);
  }
  const submissions = await db
    .select({
      periodId: shiftRequestSubmissions.periodId,
      userEmail: shiftRequestSubmissions.userEmail,
    })
    .from(shiftRequestSubmissions)
    .innerJoin(
      shiftRequestPeriods,
      eq(shiftRequestSubmissions.periodId, shiftRequestPeriods.id),
    )
    .where(eq(shiftRequestPeriods.groupId, groupId));
  const requestStatusByPlan = new Map(
    periods.map((period) => [period.planId, period.status]),
  );
  const periodByPlan = new Map(
    periods.map((period) => [period.planId, period]),
  );
  return Response.json({
    plans: plans.map((plan) => {
      const period = periodByPlan.get(plan.id);
      const savedUsers = new Set(
        submissions
          .filter((submission) => submission.periodId === period?.id)
          .map((submission) => submission.userEmail),
      );
      return {
        ...plan,
        requestStatus: requestStatusByPlan.get(plan.id) ?? null,
        requestSavedCount: savedUsers.size,
        requestMemberCount: members.length,
        ...(assignmentStats.get(plan.id) ?? { shortageSlotCount: 0, shortageMemberCount: 0, assignedSlotCount: 0 }),
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const body = (await request.json()) as {
    groupId?: string;
    name?: string;
    notes?: string;
    startDate?: string;
    endDate?: string;
    requestCloseDate?: string;
    openingTime?: string;
    closingTime?: string;
    slotMinutes?: number;
    requiredCount?: number;
    role?: string;
    slotRules?: Array<{ role?: string; requiredCount?: number; dutyId?: string | null; coverageDutyIds?: string[] }>;
    customSlots?: unknown;
  };
  const groupId = body.groupId ?? "";
  const membership = await getMembership(groupId, user.email);
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "editor")
  )
    return Response.json(
      { error: "シフト作成にはグループの編集権限が必要です" },
      { status: 403 },
    );
  const name = body.name?.trim() ?? "";
  const startDate = body.startDate ?? "";
  const endDate = body.endDate ?? "";
  const demoNow = await getDemoNow(groupId);
  const requestCloseDate =
    body.requestCloseDate ??
    (startDate ? defaultRequestCloseDate(startDate, jstDate(new Date(demoNow.getTime() + 2 * 86400000))) : "");
  const openingTime = body.openingTime ?? "09:00";
  const closingTime = body.closingTime ?? "18:00";
  const slotMinutes = body.slotMinutes ?? 60;
  const rules = (
    body.slotRules?.length
      ? body.slotRules
      : [{ role: body.role, requiredCount: body.requiredCount }]
  )
    .map((rule) => ({
      role: rule.role?.trim() ?? "",
      requiredCount: Math.max(1, Number(rule.requiredCount ?? 1)),
      dutyId: rule.dutyId ?? null,
      coverageDutyIds: Array.isArray(rule.coverageDutyIds) ? JSON.stringify(rule.coverageDutyIds.filter((id) => typeof id === "string" && id.trim())) : null,
    }))
    .filter((rule) => rule.requiredCount > 0);
  if (!name || !startDate || !endDate || startDate > endDate)
    return Response.json(
      { error: "名前と正しい期間を入力してください" },
      { status: 400 },
    );
  if (
    body.customSlots === undefined &&
    (![30, 60, 120].includes(slotMinutes) ||
      !isValidShiftTime(openingTime) ||
      !isValidShiftTime(closingTime) ||
      minutes(closingTime) <= minutes(openingTime))
  )
    return Response.json(
      { error: "営業時間または区切り時間が不正です" },
      { status: 400 },
    );
  const id = crypto.randomUUID();
  let slots: Array<{
    id: string;
    planId: string;
    date: string;
    startTime: string;
    endTime: string;
    requiredCount: number;
    role: string;
    dutyId: string | null;
    dutyNameSnapshot: string | null;
    coverageDutyIds: string | null;
  }>;
  let effectiveOpeningTime = openingTime;
  let effectiveClosingTime = closingTime;
  const db = getDb();
  const duties = await db.select().from(groupDuties).where(eq(groupDuties.groupId, groupId));
  const dutyById = new Map(duties.map((duty) => [duty.id, duty]));
  for (const rule of rules) {
    if (rule.coverageDutyIds) {
      const coverageIds = JSON.parse(rule.coverageDutyIds) as unknown;
      if (!Array.isArray(coverageIds) || coverageIds.some((dutyId) => typeof dutyId !== "string" || dutyById.get(dutyId)?.status !== "active")) {
        return Response.json({ error: "coverageDutyIds must contain active duty IDs" }, { status: 400 });
      }
    }
    if (rule.dutyId && (!dutyById.get(rule.dutyId) || dutyById.get(rule.dutyId)?.status !== "active")) return Response.json({ error: "有効な担当を指定してください" }, { status: 400 });
  }
  if (body.customSlots !== undefined) {
    try {
      slots = parseCustomSlots(body.customSlots, id, startDate, endDate);
      for (const slot of slots) {
        if (slot.dutyId && (!dutyById.get(slot.dutyId) || dutyById.get(slot.dutyId)?.status !== "active")) throw new Error("有効な担当を指定してください");
        const coverageIds = slot.coverageDutyIds ? JSON.parse(slot.coverageDutyIds) as unknown : [];
        if (!Array.isArray(coverageIds) || coverageIds.some((dutyId) => typeof dutyId !== "string" || dutyById.get(dutyId)?.status !== "active")) {
          throw new Error("coverageDutyIds must contain active duty IDs");
        }
        slot.dutyNameSnapshot = slot.dutyId ? dutyById.get(slot.dutyId)?.name ?? null : null;
      }
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "カスタム入力を確認してください",
        },
        { status: 400 },
      );
    }
    effectiveOpeningTime = slots.reduce(
      (min, slot) => (slot.startTime < min ? slot.startTime : min),
      slots[0].startTime,
    );
    effectiveClosingTime = slots.reduce(
      (max, slot) => (slot.endTime > max ? slot.endTime : max),
      slots[0].endTime,
    );
  } else {
    if (rules.length === 0)
      return Response.json(
        { error: "担当・ポジションと必要人数を1つ以上設定してください" },
        { status: 400 },
      );
    slots = dateKeys(startDate, endDate).flatMap((date) => {
      const rows: Array<{
        id: string;
        planId: string;
        date: string;
        startTime: string;
        endTime: string;
        requiredCount: number;
        role: string;
        dutyId: string | null;
        dutyNameSnapshot: string | null;
      }> = [];
      for (
        let current = minutes(openingTime);
        current + slotMinutes <= minutes(closingTime);
        current += slotMinutes
      )
        for (const rule of rules)
          rows.push({
            id: crypto.randomUUID(),
            planId: id,
            date,
            startTime: time(current),
            endTime: time(current + slotMinutes),
            requiredCount: rule.requiredCount,
            role: rule.role,
            dutyId: rule.dutyId,
            dutyNameSnapshot: rule.dutyId ? dutyById.get(rule.dutyId)?.name ?? null : null,
            coverageDutyIds: rule.coverageDutyIds,
          });
      return rows;
    });
  }
  const slotStatements = [];
  for (let index = 0; index < slots.length; index += 8)
    slotStatements.push(
      db.insert(shiftSlots).values(slots.slice(index, index + 8)),
    );
  const notes = body.notes?.trim().slice(0, 2000) ?? "";
  const periodId = crypto.randomUUID();
  const defaultRequiredCount =
    rules[0]?.requiredCount ?? slots[0]?.requiredCount ?? 1;
  await db.batch([
    db
      .insert(shiftPlans)
      .values({
        id,
        groupId,
        name,
        notes,
        startDate,
        endDate,
        openingTime: effectiveOpeningTime,
        closingTime: effectiveClosingTime,
        slotMinutes: body.customSlots === undefined ? slotMinutes : 30,
        defaultRequiredCount,
        status: "draft",
        createdBy: user.email,
      }),
    ...slotStatements,
    db
      .insert(shiftRequestPeriods)
      .values({
        id: periodId,
        groupId,
        planId: id,
        name: `${name}の勤務希望`,
        opensOn: "",
        closesOn: requestCloseDate,
        status: "pending",
        createdBy: user.email,
      }),
  ]);
  await recordAudit({ groupId, userEmail: user.email, action: "shift.create", entityType: "shiftPlan", entityId: id, summary: `シフトを作成: ${name}`, details: { startDate, endDate, slotCount: slots.length } });
  return Response.json(
    {
      demoTime: { currentAt: demoNow.toISOString(), today: jstDate(demoNow), timezone: "Asia/Tokyo" },
      plan: {
        id,
        groupId,
        name,
        notes,
        startDate,
        endDate,
        requestCloseDate,
        openingTime: effectiveOpeningTime,
        closingTime: effectiveClosingTime,
        slotMinutes: body.customSlots === undefined ? slotMinutes : 30,
        defaultRequiredCount,
        status: "draft",
      },
      requestPeriod: {
        id: periodId,
        groupId,
        planId: id,
        name: `${name}の勤務希望`,
        opensOn: "",
        closesOn: requestCloseDate,
        status: "pending",
        createdBy: user.email,
      },
      slotCount: slots.length,
    },
    { status: 201 },
  );
}
