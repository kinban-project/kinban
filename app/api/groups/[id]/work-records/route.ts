import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import {
  groupMembers,
  groups,
  shiftAssignments,
  shiftPlans,
  shiftSlots,
  workBreaks,
  workRecords,
} from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { attendanceExpired } from "../../../../attendance-expired";
import { shiftDateTime } from "../../../../shift-time";
import { sendBusinessPush } from "../../../../notification-events";
import { getDemoNow, jstDate } from "../../../../demo-clock";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const managerRoles = new Set(["owner", "editor"]);
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

function localRangeMinutes(
  date: string,
  startTime?: string | null,
  endTime?: string | null,
) {
  if (!startTime || !endTime) return null;
  const start = shiftDateTime(date, startTime);
  const end = shiftDateTime(date, endTime);
  const startAt = new Date(`${start.date}T${start.time}:00+09:00`).getTime();
  const endAt = new Date(`${end.date}T${end.time}:00+09:00`).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt)
    return null;
  return Math.round((endAt - startAt) / 60000);
}

function recordHasDifference(
  record: {
    scheduledDate: string;
    scheduledStartTime?: string | null;
    scheduledEndTime?: string | null;
    claimedStartAt?: string | null;
    claimedEndAt?: string | null;
    claimedBreakMinutes?: number | null;
  },
  breaks: Array<{ startedAt: string; endedAt?: string | null }>,
) {
  const planned = localRangeMinutes(
    record.scheduledDate,
    record.scheduledStartTime,
    record.scheduledEndTime,
  );
  if (!record.claimedStartAt || !record.claimedEndAt || planned === null)
    return true;
  const start = new Date(record.claimedStartAt).getTime();
  const end = new Date(record.claimedEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return true;
  const breakMinutesFromPunches = breaks.reduce(
    (total, item) =>
      item.endedAt
        ? total +
          Math.max(
            0,
            Math.round(
              (new Date(item.endedAt).getTime() -
                new Date(item.startedAt).getTime()) /
                60000,
            ),
          )
        : total,
    0,
  );
  const claimed = Math.max(
    0,
    Math.round((end - start) / 60000) -
      (record.claimedBreakMinutes ?? breakMinutesFromPunches),
  );
  return Math.abs(claimed - planned) >= 15;
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function jstIso(date: string, time: string) {
  const value = shiftDateTime(date, time);
  return new Date(`${value.date}T${value.time}:00+09:00`).toISOString();
}

function inputToIso(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function contextData(groupId: string, email: string) {
  const db = getDb();
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) return { error: error("Group not found.", 404) } as const;
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email)),
    )
    .limit(1);
  if (!membership || membership.status !== "active")
    return {
      error: error("Active group membership is required.", 403),
    } as const;
  return { db, group, membership } as const;
}

function clockMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 30 && minute >= 0 && minute < 60
    ? hour * 60 + minute
    : null;
}

function suggestedBreakMinutes(slots: Array<{ startTime: string; endTime: string }>) {
  const ordered = [...slots].sort((left, right) =>
    (clockMinutes(left.startTime) ?? Number.MAX_SAFE_INTEGER) -
      (clockMinutes(right.startTime) ?? Number.MAX_SAFE_INTEGER),
  );
  const blocks: Array<{ start: number; end: number }> = [];
  for (const slot of ordered) {
    const start = clockMinutes(slot.startTime);
    const end = clockMinutes(slot.endTime);
    if (start === null || end === null || end <= start) continue;
    const current = blocks[blocks.length - 1];
    if (current && start <= current.end) current.end = Math.max(current.end, end);
    else blocks.push({ start, end });
  }
  return blocks.reduce((total, block) => {
    const span = block.end - block.start;
    return total + (span > 480 ? 60 : span > 360 ? 45 : 0);
  }, 0);
}

async function resolveAssignedSlots(
  db: ReturnType<typeof getDb>,
  groupId: string,
  userEmail: string,
  expectedDate: string,
  requestedSlotIds?: string[],
) {
  const requestedIds = requestedSlotIds
    ? [...new Set(requestedSlotIds.filter(Boolean))]
    : null;
  if (requestedIds && (!requestedIds.length || requestedIds.length !== requestedSlotIds.length))
    return { error: "At least one unique shift slot is required." } as const;
  const publishedPlans = await db
    .select()
    .from(shiftPlans)
    .where(
      and(
        eq(shiftPlans.groupId, groupId),
        eq(shiftPlans.status, "published"),
      ),
    );
  const publishedPlanIds = publishedPlans.map((plan) => plan.id);
  const dateSlots = publishedPlanIds.length
    ? await db
        .select()
        .from(shiftSlots)
        .where(
          and(
            inArray(shiftSlots.planId, publishedPlanIds),
            eq(shiftSlots.date, expectedDate),
          ),
        )
    : [];
  const dateSlotIds = dateSlots.map((slot) => slot.id);
  const assignments = dateSlotIds.length
    ? await db
        .select()
        .from(shiftAssignments)
        .where(
          and(
            inArray(shiftAssignments.slotId, dateSlotIds),
            eq(shiftAssignments.userEmail, userEmail),
          ),
        )
    : [];
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.slotId));
  const assignedSlots = dateSlots.filter((slot) => assignedSlotIds.has(slot.id));
  if (!assignedSlots.length)
    return { error: "No published shift slots are assigned to the current member for this date." } as const;
  if (requestedIds) {
    const requestedSet = new Set(requestedIds);
    const assignedSet = new Set(assignedSlots.map((slot) => slot.id));
    if (
      requestedSet.size !== assignedSet.size ||
      [...assignedSet].some((slotId) => !requestedSet.has(slotId))
    )
      return { error: "The selected shift slots must include every assigned slot for this date." } as const;
  }
  const ordered = [...assignedSlots].sort((left, right) => {
    const leftMinutes = clockMinutes(left.startTime) ?? Number.MAX_SAFE_INTEGER;
    const rightMinutes = clockMinutes(right.startTime) ?? Number.MAX_SAFE_INTEGER;
    return leftMinutes - rightMinutes || left.endTime.localeCompare(right.endTime);
  });
  const [group] = await db
    .select({ autoBreakSuggestion: groups.autoBreakSuggestion })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  const startTime = ordered[0].startTime;
  const endTime = ordered.reduce((latest, slot) =>
    (clockMinutes(slot.endTime) ?? -1) > (clockMinutes(latest) ?? -1)
      ? slot.endTime
      : latest,
  ordered[0].endTime);
  const plannedMinutes = assignedSlots.reduce(
    (total, slot) => total + (localRangeMinutes(slot.date, slot.startTime, slot.endTime) ?? 0),
    0,
  );
  const startMinutes = clockMinutes(startTime);
  const endMinutes = clockMinutes(endTime);
  const spanMinutes =
    startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
      ? endMinutes - startMinutes
      : plannedMinutes;
  return {
    slots: ordered,
    planId: ordered[0].planId,
    slotId: ordered[0].id,
    date: ordered[0].date,
    startTime,
    endTime,
    breakMinutes: Math.max(0, spanMinutes - plannedMinutes),
    plannedBreakMinutes: group?.autoBreakSuggestion === false
      ? 0
      : suggestedBreakMinutes(ordered),
  } as const;
}

export async function GET(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return error("ChatGPT sign-in is required.", 401);
  const { id: groupId } = await context.params;
  const current = await contextData(groupId, user.email);
  if ("error" in current) return current.error;
  const { db, group, membership } = current;
  const query = new URL(request.url).searchParams;
  const demoNow = await getDemoNow(groupId);
  // Managers can open 勤務申告 as a regular member.  Keep the authenticated
  // manager role, but switch the read scope to the current user's records so
  // the declaration screen is identical for managers and members.
  const personalView = query.get("view") === "personal";
  const manager = managerRoles.has(membership.role) && !personalView;
  const requestedUser = query.get("userEmail")?.trim() ?? "";
  const from = query.get("from")?.trim() ?? "";
  const to = query.get("to")?.trim() ?? "";
  const status = query.get("status")?.trim() ?? "";
  const month = query.get("month")?.trim() ?? "";
  const day = query.get("day")?.trim() ?? "";
  const difference = query.get("difference")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.get("pageSize") ?? "100", 10) || 100));
  const plans = await db
    .select()
    .from(shiftPlans)
    .where(
      and(eq(shiftPlans.groupId, groupId), eq(shiftPlans.status, "published")),
    );
  const planIds = plans.map((plan) => plan.id);
  const slots = planIds.length
    ? await db
        .select()
        .from(shiftSlots)
        .where(inArray(shiftSlots.planId, planIds))
    : [];
  const slotIds = slots.map((slot) => slot.id);
  const assignments = slotIds.length
    ? (
        await Promise.all(
          chunk(slotIds, 50).map((ids) =>
            db
              .select()
              .from(shiftAssignments)
              .where(inArray(shiftAssignments.slotId, ids)),
          ),
        )
      ).flat()
    : [];
  const recordFilters = [
    eq(workRecords.groupId, groupId),
    manager && requestedUser ? eq(workRecords.userEmail, requestedUser) : undefined,
    manager ? undefined : eq(workRecords.userEmail, user.email),
    from ? gte(workRecords.scheduledDate, from) : undefined,
    to ? lte(workRecords.scheduledDate, to) : undefined,
    status ? eq(workRecords.status, status) : undefined,
  ];
  const recordRows = await db
    .select()
    .from(workRecords)
    .where(and(...recordFilters));
  const allRecordIds = recordRows.map((record) => record.id);
  const allBreaks = allRecordIds.length
    ? (
        await Promise.all(
          chunk(allRecordIds, 50).map((ids) =>
            db
              .select()
              .from(workBreaks)
              .where(inArray(workBreaks.workRecordId, ids)),
          ),
        )
      ).flat()
    : [];
  const breaksByRecord = new Map<string, typeof allBreaks>();
  for (const item of allBreaks) {
    const rows = breaksByRecord.get(item.workRecordId) ?? [];
    rows.push(item);
    breaksByRecord.set(item.workRecordId, rows);
  }
  const filteredRecords = recordRows.filter((record) => {
    if (month && !record.scheduledDate.startsWith(month)) return false;
    if (day && record.scheduledDate !== day) return false;
    if (difference === "issue" && !recordHasDifference(record, breaksByRecord.get(record.id) ?? []))
      return false;
    if (difference === "none" && recordHasDifference(record, breaksByRecord.get(record.id) ?? []))
      return false;
    return true;
  });
  const hasNext = filteredRecords.length > pageSize;
  const records = filteredRecords.slice((page - 1) * pageSize, page * pageSize);
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const plannedSlotsByUserDate = new Map<
    string,
    Array<{
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      role: string;
      planName: string;
    }>
  >();
  for (const assignment of assignments) {
    const slot = slotById.get(assignment.slotId);
    if (!slot) continue;
    const plan = planById.get(slot.planId);
    const key = `${assignment.userEmail}|${slot.date}`;
    const rows = plannedSlotsByUserDate.get(key) ?? [];
    rows.push({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      role: slot.role,
      planName: plan?.name ?? "",
    });
    plannedSlotsByUserDate.set(key, rows);
  }
  for (const rows of plannedSlotsByUserDate.values()) {
    rows.sort((left, right) =>
      `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`),
    );
  }
  const recordsWithState = records.map((record) => ({
    ...record,
    plannedSlots:
      plannedSlotsByUserDate.get(`${record.userEmail}|${record.scheduledDate}`) ?? [],
    attendanceExpired:
      record.status === "working" &&
      !record.endedAt &&
      attendanceExpired(record.startedAt, demoNow),
  }));
  // Managers receive a paged list of every member's records. Keep the
  // current user's active clock record separate so the home controls do not
  // miss it when it falls outside the first page.
  const currentUserActiveRows = await db
    .select()
    .from(workRecords)
    .where(
      and(
        eq(workRecords.groupId, groupId),
        eq(workRecords.userEmail, user.email),
        eq(workRecords.status, "working"),
        isNull(workRecords.endedAt),
      ),
    )
    .limit(10);
  const currentUserActive = currentUserActiveRows.map((record) => ({
    ...record,
    attendanceExpired: attendanceExpired(record.startedAt, demoNow),
  }));
  const recordIds = Array.from(
    new Set([
      ...records.map((record) => record.id),
      ...currentUserActive.map((record) => record.id),
    ]),
  );
  const breaks = allBreaks.filter((item) => recordIds.includes(item.workRecordId));
  const members = manager
    ? await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId))
    : [];
  const visibleAssignments = manager
    ? assignments
    : assignments.filter((row) => row.userEmail === user.email);
  const schedule = visibleAssignments
    .map((assignment) => {
      const slot = slots.find((row) => row.id === assignment.slotId);
      const plan = slot ? plans.find((row) => row.id === slot.planId) : null;
      return slot && plan
        ? {
            ...slot,
            planId: plan.id,
            planName: plan.name,
            userEmail: assignment.userEmail,
            record:
              recordsWithState.find(
                (record) =>
                  record.slotId === slot.id &&
                  record.userEmail === assignment.userEmail,
              ) ?? null,
          }
        : null;
    })
    .filter(Boolean);
  return Response.json(
    {
      group,
      currentUserEmail: user.email,
      records: recordsWithState,
      currentUserActive: currentUserActive.find((record) => !record.attendanceExpired) ?? currentUserActive[0] ?? null,
      breaks,
      schedule,
      members,
      canManage: manager,
      pagination: { page, pageSize, hasNext, nextPage: hasNext ? page + 1 : null },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return error("ChatGPT sign-in is required.", 401);
  const { id: groupId } = await context.params;
  const current = await contextData(groupId, user.email);
  if ("error" in current) return current.error;
  const { db, membership } = current;
  const demoNow = await getDemoNow(groupId);
  const nowIso = demoNow.toISOString();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    recordId?: string;
    slotId?: string;
    slotIds?: string[];
    plannedStartTime?: string;
    plannedEndTime?: string;
    plannedBreakMinutes?: number;
    scheduledDate?: string;
    note?: string;
    employeeNote?: string;
    claimedBreakMinutes?: number;
    claimedStartAt?: string;
    claimedEndAt?: string;
  };

  if (body.action === "create-claim") {
    if (!body.slotId && !body.slotIds?.length)
      return error("slotId is required.", 400);
    const firstSlotId = body.slotIds?.[0] ?? body.slotId!;
    const [slot] = await db
      .select()
      .from(shiftSlots)
      .where(eq(shiftSlots.id, firstSlotId))
      .limit(1);
    if (!slot) return error("Assigned shift slot not found.", 404);
    const [plan] = await db
      .select()
      .from(shiftPlans)
      .where(
        and(
          eq(shiftPlans.id, slot.planId),
          eq(shiftPlans.groupId, groupId),
          eq(shiftPlans.status, "published"),
        ),
      )
      .limit(1);
    const [assignment] = await db
      .select()
      .from(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.slotId, slot.id),
          eq(shiftAssignments.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!plan || !assignment)
      return error("You are not assigned to this shift.", 403);
    const requestedSlotIds = body.slotIds?.length
      ? body.slotIds
      : [slot.id];
    const selectedSlots = await db
      .select()
      .from(shiftSlots)
      .where(inArray(shiftSlots.id, requestedSlotIds));
    const selectedAssignments = await db
      .select()
      .from(shiftAssignments)
      .where(
        and(
          inArray(shiftAssignments.slotId, requestedSlotIds),
          eq(shiftAssignments.userEmail, user.email),
        ),
      );
    if (
      selectedSlots.length !== requestedSlotIds.length ||
      selectedAssignments.length !== requestedSlotIds.length ||
      selectedSlots.some((item) => item.date !== slot.date)
    )
      return error("You are not assigned to every selected shift.", 403);
    const resolved = await resolveAssignedSlots(
      db,
      groupId,
      user.email,
      slot.date,
      requestedSlotIds,
    );
    if ("error" in resolved) return error(resolved.error, 403);
    const plannedStartTime = resolved.startTime;
    const plannedEndTime = resolved.endTime;
    // 勤務枠の26:00〜30:00は翌日の時刻なので、入力値ではなく枠から正規化して作成する。
    const claimedStartAt = jstIso(slot.date, plannedStartTime);
    const claimedEndAt = jstIso(slot.date, plannedEndTime);
    if (
      !claimedStartAt ||
      !claimedEndAt ||
      new Date(claimedEndAt).getTime() <= new Date(claimedStartAt).getTime()
    )
      return error("Invalid claim time.", 400);
    const existing = await db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
          eq(workRecords.scheduledDate, slot.date),
        ),
      )
      .limit(1);
    const now = nowIso;
    const claimedBreakMinutes =
      resolved.breakMinutes > 0
        ? resolved.breakMinutes
        : resolved.plannedBreakMinutes;
    if (existing[0]) {
      if (existing[0].monthlyClosedAt)
        return error("This month has been closed and cannot be changed until an administrator reopens it.", 409);
      await db
        .update(workRecords)
        .set({
          planId: plan.id,
          slotId: slot.id,
          scheduledStartTime: plannedStartTime,
          scheduledEndTime: plannedEndTime,
          plannedBreakMinutes: resolved.plannedBreakMinutes,
          claimedStartAt,
          claimedEndAt,
          claimedBreakMinutes,
          status: "unsubmitted",
          employeeNote: body.employeeNote === undefined
            ? existing[0].employeeNote
            : String(body.employeeNote).trim().slice(0, 500),
          approvedBy: null,
          approvedAt: null,
          updatedAt: now,
        })
        .where(eq(workRecords.id, existing[0].id));
      const [updated] = await db
        .select()
        .from(workRecords)
        .where(eq(workRecords.id, existing[0].id))
        .limit(1);
      return Response.json({ ok: true, record: updated });
    }
    const row = {
      id: crypto.randomUUID(),
      groupId,
      planId: plan.id,
      slotId: slot.id,
      userEmail: user.email,
      scheduledDate: slot.date,
      scheduledStartTime: plannedStartTime,
      scheduledEndTime: plannedEndTime,
      plannedBreakMinutes: resolved.plannedBreakMinutes,
      claimedStartAt,
      claimedEndAt,
      claimedBreakMinutes,
      status: "unsubmitted",
      employeeNote: String(body.employeeNote ?? ""),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(workRecords).values(row);
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.claim.create",
      entityType: "workRecord",
      entityId: row.id,
      summary: `勤務申告を作成: ${slot.date}`,
    });
    return Response.json({ ok: true, record: row }, { status: 201 });
  }

  if (body.action === "create-manual-claim") {
    if (!body.scheduledDate)
      return error("scheduledDate is required.", 400);
    const employeeNote = String(body.employeeNote ?? "").trim().slice(0, 500);
    if (!body.claimedStartAt && !body.claimedEndAt && !employeeNote)
      return error("claim times or employeeNote are required.", 400);
    const claimedStartAt = body.claimedStartAt ? inputToIso(body.claimedStartAt) : null;
    const claimedEndAt = body.claimedEndAt ? inputToIso(body.claimedEndAt) : null;
    if (
      (body.claimedStartAt && !claimedStartAt) ||
      (body.claimedEndAt && !claimedEndAt) ||
      (claimedStartAt && claimedEndAt && new Date(claimedEndAt).getTime() <= new Date(claimedStartAt).getTime())
    )
      return error("Invalid claim time.", 400);
    const existing = await db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
          eq(workRecords.scheduledDate, body.scheduledDate),
          isNull(workRecords.slotId),
        ),
      )
      .limit(1);
    if (existing[0] && existing[0].status !== "rejected")
      return Response.json({ ok: true, record: existing[0] });
    const now = nowIso;
    const row = {
      id: crypto.randomUUID(),
      groupId,
      planId: null,
      slotId: null,
      userEmail: user.email,
      scheduledDate: body.scheduledDate,
      scheduledStartTime: "",
      scheduledEndTime: "",
      claimedStartAt,
      claimedEndAt,
      status: "unsubmitted",
      claimedBreakMinutes: Math.max(0, Math.round(Number(body.claimedBreakMinutes) || 0)),
      employeeNote,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(workRecords).values(row);
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.claim.create-manual",
      entityType: "workRecord",
      entityId: row.id,
      summary: `勤務申告を作成: ${body.scheduledDate}`,
    });
    return Response.json({ ok: true, record: row }, { status: 201 });
  }

  if (body.action === "start") {
    const now = nowIso;
    const openRecords = await db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
          eq(workRecords.status, "working"),
          isNull(workRecords.endedAt),
        ),
      );
    const expiredIds = openRecords
      .filter((record) => attendanceExpired(record.startedAt, demoNow))
      .map((record) => record.id);
    if (expiredIds.length) {
      await db
        .update(workRecords)
        .set({ activeKey: null, updatedAt: now })
        .where(inArray(workRecords.id, expiredIds));
    }
    if (openRecords.some((record) => !attendanceExpired(record.startedAt, demoNow)))
      return error(
        "勤務中の記録が残っています。先に勤務終了を記録してください。",
        409,
      );
    if (body.slotId)
      return error(
        "通常の勤務開始ではシフトを指定できません。勤務申告のシフト通り操作を利用してください。",
        400,
      );
    const scheduledDate = jstDate(demoNow);
    const scheduledStartTime = "";
    const scheduledEndTime = "";
    const planId: string | null = null;
    const slotId: string | null = null;
    const row = {
      id: crypto.randomUUID(),
      groupId,
      planId,
      slotId,
      userEmail: user.email,
      scheduledDate,
      scheduledStartTime,
      scheduledEndTime,
      startedAt: now,
      claimedStartAt: now,
      activeKey: `${groupId}:${user.email}`,
      status: "working",
      employeeNote: String(body.note ?? "")
        .trim()
        .slice(0, 500),
    };
    try {
      await db.insert(workRecords).values(row);
    } catch (caught) {
      // The partial unique index is the final arbiter for concurrent starts.
      if (String(caught).toLowerCase().includes("unique"))
        return error("A work record is already active for this group and user.", 409);
      throw caught;
    }
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.start",
      entityType: "workRecord",
      entityId: row.id,
      summary: `勤務開始: ${scheduledDate} ${scheduledStartTime}`,
      details: { slotId },
    });
    return Response.json({ ok: true, record: row }, { status: 201 });
  }

  if (body.action === "break-start" || body.action === "break-end") {
    if (!body.recordId) return error("recordId is required.", 400);
    const [record] = await db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record || record.endedAt || record.status !== "working")
      return error("An active work record is required.", 409);
    const currentBreaks = await db
      .select()
      .from(workBreaks)
      .where(eq(workBreaks.workRecordId, record.id));
    const openBreak = currentBreaks.find((item) => !item.endedAt);
    if (body.action === "break-start") {
      if (openBreak) return error("A break is already in progress.", 409);
      const row = {
        id: crypto.randomUUID(),
        workRecordId: record.id,
        startedAt: nowIso,
      };
      await db.insert(workBreaks).values(row);
      await recordAudit({
        groupId,
        userEmail: user.email,
        action: "work.break.start",
        entityType: "workBreak",
        entityId: row.id,
        summary: `休憩開始: ${record.scheduledDate}`,
      });
      return Response.json({ ok: true, break: row });
    }
    if (!openBreak) return error("No active break was found.", 409);
    const endedAt = nowIso;
    await db
      .update(workBreaks)
      .set({ endedAt })
      .where(eq(workBreaks.id, openBreak.id));
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.break.end",
      entityType: "workBreak",
      entityId: openBreak.id,
      summary: `休憩終了: ${record.scheduledDate}`,
    });
    return Response.json({ ok: true, breakId: openBreak.id, endedAt });
  }

  if (body.action === "end") {
    if (!body.recordId) return error("recordId is required.", 400);
    const [record] = await db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.endedAt)
      return error("This work record has already ended.", 409);
    const endedAt = nowIso;
    await db
      .update(workRecords)
      .set({
        endedAt,
        claimedEndAt: endedAt,
        activeKey: null,
        status: "working",
        updatedAt: endedAt,
        employeeNote: String(body.note ?? record.employeeNote)
          .trim()
          .slice(0, 500),
      })
      .where(eq(workRecords.id, record.id));
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.end",
      entityType: "workRecord",
      entityId: record.id,
      summary: `勤務終了: ${record.scheduledDate}`,
    });
    return Response.json({
      ok: true,
      recordId: record.id,
      status: "working",
      endedAt,
    });
  }
  return error("action must be start or end.", 400);
}

export async function PATCH(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return error("ChatGPT sign-in is required.", 401);
  const { id: groupId } = await context.params;
  const current = await contextData(groupId, user.email);
  if ("error" in current) return current.error;
  const demoNow = await getDemoNow(groupId);
  const nowIso = demoNow.toISOString();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    recordId?: string;
    status?: string;
    managerNote?: string;
    slotId?: string;
    employeeNote?: string;
    claimedBreakMinutes?: number;
    plannedBreakMinutes?: number;
    confirm?: boolean;
    monthKey?: string;
  };
  if (body.action === "start-edit") {
    if (!body.recordId) return error("recordId is required.", 400);
    const [record] = await current.db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.monthlyClosedAt)
      return error(
        "This month has been approved and cannot be changed until an administrator reopens it.",
        409,
      );
    if (!["submitted", "approved"].includes(record.status))
      return error("This work record is already editable.", 400);
    await current.db
      .update(workRecords)
      .set({
        status: "unsubmitted",
        approvedBy: null,
        approvedAt: null,
        updatedAt: nowIso,
      })
      .where(eq(workRecords.id, record.id));
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.claim.edit.start",
      entityType: "workRecord",
      entityId: record.id,
      summary: "承認済みの勤務申告を修正開始しました",
    });
    return Response.json({ ok: true, recordId: record.id, status: "unsubmitted" });
  }
  if (body.action === "save-claim") {
    const claimBody = body as typeof body & {
      claimedStartAt?: string;
      claimedEndAt?: string;
    };
    if (!body.recordId)
      return error("recordId is required.", 400);
    const [record] = await current.db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.monthlyClosedAt)
      return error(
        "This month has been closed and cannot be changed until an administrator reopens it.",
        409,
      );
    if (["submitted", "approved"].includes(record.status))
      return error("申告を修正する場合は、先に「申告を修正」を実行してください。", 409);
    const claimedStartAt =
      claimBody.claimedStartAt === undefined
        ? record.claimedStartAt
        : inputToIso(claimBody.claimedStartAt);
    const claimedEndAt =
      claimBody.claimedEndAt === undefined
        ? record.claimedEndAt
        : inputToIso(claimBody.claimedEndAt);
    if ((claimBody.claimedStartAt && !claimedStartAt) || (claimBody.claimedEndAt && !claimedEndAt))
      return error("Invalid claim time.", 400);
    if (
      claimedEndAt &&
      new Date(claimedEndAt).getTime() < new Date(claimedStartAt).getTime()
    )
      return error("Claim end must be after claim start.", 400);
    const claimedBreakMinutes =
      claimBody.claimedBreakMinutes === undefined
        ? record.claimedBreakMinutes
        : Math.max(
            0,
            Math.min(
              1440,
              Math.round(Number(claimBody.claimedBreakMinutes) || 0),
            ),
          );
    const resetDailyApproval =
      record.status === "submitted" ||
      record.status === "approved" ||
      record.status === "rejected";
    await current.db
      .update(workRecords)
      .set({
        claimedStartAt,
        claimedEndAt,
        claimedBreakMinutes,
        employeeNote: String(
          claimBody.employeeNote ?? record.employeeNote ?? "",
        )
          .trim()
          .slice(0, 500),
        status: resetDailyApproval ? "unsubmitted" : record.status,
        approvedBy: resetDailyApproval ? null : record.approvedBy,
        approvedAt: resetDailyApproval ? null : record.approvedAt,
        updatedAt: nowIso,
      })
      .where(eq(workRecords.id, record.id));
    return Response.json({ ok: true, recordId: record.id });
  }
  if (body.action === "save-planned-break") {
    if (!managerRoles.has(current.membership.role))
      return error("Manager permission is required.", 403);
    if (!body.recordId)
      return error("recordId is required.", 400);
    const plannedBreakMinutes = Math.max(
      0,
      Math.min(1440, Math.round(Number(body.plannedBreakMinutes) || 0)),
    );
    const [record] = await current.db
      .select()
      .from(workRecords)
      .where(
        and(eq(workRecords.id, body.recordId), eq(workRecords.groupId, groupId)),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.monthlyClosedAt)
      return error("This month has been approved and cannot be changed until an administrator reopens it.", 409);
    await current.db
      .update(workRecords)
      .set({ plannedBreakMinutes, updatedAt: nowIso })
      .where(eq(workRecords.id, record.id));
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.planned_break.update",
      entityType: "workRecord",
      entityId: record.id,
      summary: `予定休憩を${plannedBreakMinutes}分に変更しました`,
      details: { plannedBreakMinutes },
    });
    return Response.json({ ok: true, recordId: record.id, plannedBreakMinutes });
  }
  if (body.action === "apply-schedule") {
    if (!body.recordId) return error("recordId is required.", 400);
    const [record] = await current.db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.monthlyClosedAt)
      return error(
        "This month has been closed and cannot be changed until an administrator reopens it.",
        409,
      );
    let scheduledDate = record.scheduledDate;
    let scheduledStartTime = record.scheduledStartTime;
    let scheduledEndTime = record.scheduledEndTime;
    let planId = record.planId;
    let linkedSlotId = record.slotId;
    const requestedSlotIds = body.slotIds?.length
      ? body.slotIds
      : body.slotId
        ? [body.slotId]
        : [];
    if (requestedSlotIds.length) {
      const selectedSlots = await current.db
        .select()
        .from(shiftSlots)
        .where(inArray(shiftSlots.id, requestedSlotIds));
      const selectedPlans = selectedSlots.length
        ? await current.db
            .select()
            .from(shiftPlans)
            .where(
              and(
                inArray(shiftPlans.id, selectedSlots.map((slot) => slot.planId)),
                eq(shiftPlans.groupId, groupId),
                eq(shiftPlans.status, "published"),
              ),
            )
        : [];
      const selectedAssignments = await current.db
            .select()
            .from(shiftAssignments)
            .where(
              and(
                inArray(shiftAssignments.slotId, requestedSlotIds),
                eq(shiftAssignments.userEmail, user.email),
              ),
            );
      const valid =
        selectedSlots.length === requestedSlotIds.length &&
        selectedPlans.length === new Set(selectedSlots.map((slot) => slot.planId)).size &&
        selectedAssignments.length === requestedSlotIds.length &&
        selectedSlots.every((slot) => slot.date === record.scheduledDate);
      if (!valid)
        return error("The selected shift is not assigned to this record.", 409);
      const ordered = [...selectedSlots].sort((left, right) =>
        `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`),
      );
      scheduledDate = ordered[0].date;
      scheduledStartTime = body.plannedStartTime || ordered[0].startTime;
      scheduledEndTime = body.plannedEndTime || ordered[ordered.length - 1].endTime;
      planId = ordered[0].planId;
      // Keep one legacy slot reference while the displayed/validated schedule is date-based.
      linkedSlotId = ordered[0].id;
    }
    const resolved = await resolveAssignedSlots(
      current.db,
      groupId,
      user.email,
      record.scheduledDate,
      requestedSlotIds.length ? requestedSlotIds : undefined,
    );
    if ("error" in resolved) return error(resolved.error, 409);
    scheduledDate = resolved.date;
    scheduledStartTime = resolved.startTime;
    scheduledEndTime = resolved.endTime;
    planId = resolved.planId;
    linkedSlotId = resolved.slotId;
    if (!scheduledStartTime || !scheduledEndTime)
      return error("A scheduled shift is not linked to this record.", 409);
    const resetDailyApproval =
      record.status === "submitted" ||
      record.status === "approved" ||
      record.status === "rejected";
    const now = nowIso;
    const claimedBreakMinutes =
      resolved.breakMinutes > 0
        ? resolved.breakMinutes
        : resolved.plannedBreakMinutes;
    await current.db
      .update(workRecords)
      .set({
        planId,
        slotId: linkedSlotId,
        scheduledDate,
        scheduledStartTime,
        scheduledEndTime,
        plannedBreakMinutes: resolved.plannedBreakMinutes,
        claimedStartAt: jstIso(scheduledDate, scheduledStartTime),
        claimedEndAt: jstIso(scheduledDate, scheduledEndTime),
        claimedBreakMinutes,
        status: resetDailyApproval ? "unsubmitted" : record.status,
        approvedBy: resetDailyApproval ? null : record.approvedBy,
        approvedAt: resetDailyApproval ? null : record.approvedAt,
        updatedAt: now,
      })
      .where(eq(workRecords.id, record.id));
    return Response.json({
      ok: true,
      recordId: record.id,
      plannedBreakMinutes: resolved.plannedBreakMinutes,
      claimedBreakMinutes,
    });
  }
  if (body.action === "submit-claim") {
    if (!body.recordId) return error("recordId is required.", 400);
    const [record] = await current.db
      .select()
      .from(workRecords)
      .where(
        and(
          eq(workRecords.id, body.recordId),
          eq(workRecords.groupId, groupId),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (!record) return error("Work record not found.", 404);
    if (record.monthlyClosedAt)
      return error(
        "This month has been closed and cannot be changed until an administrator reopens it.",
        409,
      );
    if (!record.claimedStartAt || !record.claimedEndAt) {
      if (!record.employeeNote?.trim())
        return error("申告時刻または備考を入力してください。", 400);
      await current.db
        .update(workRecords)
        .set({ status: "submitted", updatedAt: nowIso })
        .where(eq(workRecords.id, record.id));
      return Response.json({ ok: true, warnings: [] });
    }
    const start = new Date(record.claimedStartAt).getTime();
    const end = new Date(record.claimedEndAt).getTime();
    if (!(start < end))
      return error("申告の終了時刻は開始時刻より後にしてください。", 400);
    const warnings: string[] = [];
    if (record.scheduledStartTime && record.scheduledEndTime) {
      const scheduledStart = new Date(
        jstIso(record.scheduledDate, record.scheduledStartTime),
      ).getTime();
      const scheduledEnd = new Date(
        jstIso(record.scheduledDate, record.scheduledEndTime),
      ).getTime();
      if (
        Math.abs(start - scheduledStart) > 120 * 60 * 1000 ||
        Math.abs(end - scheduledEnd) > 120 * 60 * 1000
      )
        warnings.push("シフト予定と申告時間の差が大きくなっています。");
    }
    if (warnings.length && body.confirm !== true)
      return Response.json(
        { error: warnings.join(" "), warning: true },
        { status: 409 },
      );
    const now = nowIso;
    await current.db
      .update(workRecords)
      .set({ status: "submitted", updatedAt: now })
      .where(eq(workRecords.id, record.id));
    await recordAudit({
      groupId,
      userEmail: user.email,
      action: "work.submit",
      entityType: "workRecord",
      entityId: record.id,
      summary: `勤務時間を申請: ${record.scheduledDate}`,
      details: { warnings },
    });
    return Response.json({
      ok: true,
      recordId: record.id,
      status: "submitted",
      warnings,
    });
  }
  if (!managerRoles.has(current.membership.role))
    return error("Owner or editor permission is required.", 403);
  if (body.action === "close-month" || body.action === "reopen-month") {
    if (!body.monthKey || !/^\d{4}-\d{2}$/.test(body.monthKey))
      return error("A valid monthKey is required.", 400);
    const monthRecords = await current.db
      .select()
      .from(workRecords)
      .where(eq(workRecords.groupId, groupId));
    const targets = monthRecords.filter((record) =>
      record.scheduledDate.startsWith(body.monthKey!),
    );
    if (!targets.length)
      return error("No work records exist for this month.", 404);
    if (
      body.action === "close-month" &&
      targets.some((record) => record.status !== "approved")
    )
      return error(
        "All records must be approved before closing the month.",
        409,
      );
    const now = nowIso;
    await current.db
      .update(workRecords)
      .set(
        body.action === "close-month"
          ? {
              monthlyClosedAt: now,
              monthlyClosedBy: user.email,
              updatedAt: now,
            }
          : { monthlyClosedAt: null, monthlyClosedBy: null, updatedAt: now },
      )
      .where(
        inArray(
          workRecords.id,
          targets.map((record) => record.id),
        ),
      );
    await recordAudit({
      groupId,
      userEmail: user.email,
      action:
        body.action === "close-month"
          ? "work.month.close"
          : "work.month.reopen",
      entityType: "workRecord",
      entityId: body.monthKey,
      summary: `${body.monthKey}の勤務申告を${body.action === "close-month" ? "締め" : "再開"}しました`,
    });
    return Response.json({
      ok: true,
      monthKey: body.monthKey,
      closed: body.action === "close-month",
    });
  }
  if (!body.recordId || !["approved", "rejected"].includes(body.status ?? ""))
    return error("recordId and approved or rejected status are required.", 400);
  const [record] = await current.db
    .select()
    .from(workRecords)
    .where(
      and(eq(workRecords.id, body.recordId), eq(workRecords.groupId, groupId)),
    )
    .limit(1);
  if (!record) return error("Work record not found.", 404);
  if (record.monthlyClosedAt)
    return error(
      "This month has been closed. Reopen it before changing records.",
      409,
    );
  const now = nowIso;
  await current.db
    .update(workRecords)
    .set({
      status: body.status,
      managerNote: String(body.managerNote ?? "")
        .trim()
        .slice(0, 500),
      approvedBy: user.email,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(workRecords.id, record.id));
  await recordAudit({
    groupId,
    userEmail: user.email,
    action: "work.review",
    entityType: "workRecord",
    entityId: record.id,
    summary: `勤務記録を${body.status === "approved" ? "承認" : "差戻し"}`,
    details: { status: body.status, managerNote: body.managerNote ?? "" },
  });
  if (body.status === "rejected") await sendBusinessPush(current.db, { recipients: [record.userEmail], eventId: `daily-work-rejected:${record.id}:${now}`, title: "KINBAN", body: "勤怠の確認・修正が必要です", url: `/?group=${encodeURIComponent(groupId)}&view=work-records`, urgency: "high" });
  return Response.json({ ok: true, recordId: record.id, status: body.status });
}
