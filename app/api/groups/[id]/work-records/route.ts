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

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const managerRoles = new Set(["owner", "editor"]);
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function todayJst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
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

export async function GET(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return error("ChatGPT sign-in is required.", 401);
  const { id: groupId } = await context.params;
  const current = await contextData(groupId, user.email);
  if ("error" in current) return current.error;
  const { db, group, membership } = current;
  const manager = managerRoles.has(membership.role);
  const query = new URL(request.url).searchParams;
  const requestedUser = query.get("userEmail")?.trim() ?? "";
  const from = query.get("from")?.trim() ?? "";
  const to = query.get("to")?.trim() ?? "";
  const status = query.get("status")?.trim() ?? "";
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
  const pagedRecords = await db
    .select()
    .from(workRecords)
    .where(and(...recordFilters))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  const hasNext = pagedRecords.length > pageSize;
  const records = pagedRecords.slice(0, pageSize);
  const recordsWithState = records.map((record) => ({
    ...record,
    attendanceExpired:
      record.status === "working" &&
      !record.endedAt &&
      attendanceExpired(record.startedAt),
  }));
  const recordIds = records.map((record) => record.id);
  const breaks = recordIds.length
    ? (
        await Promise.all(
          chunk(recordIds, 50).map((ids) =>
            db
              .select()
              .from(workBreaks)
              .where(inArray(workBreaks.workRecordId, ids)),
          ),
        )
      ).flat()
    : [];
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
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    recordId?: string;
    slotId?: string;
    scheduledDate?: string;
    note?: string;
    claimedStartAt?: string;
    claimedEndAt?: string;
  };

  if (body.action === "create-claim") {
    if (!body.slotId || !body.claimedStartAt || !body.claimedEndAt)
      return error("slotId and claim times are required.", 400);
    const [slot] = await db
      .select()
      .from(shiftSlots)
      .where(eq(shiftSlots.id, body.slotId))
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
    // 勤務枠の26:00〜30:00は翌日の時刻なので、入力値ではなく枠から正規化して作成する。
    const claimedStartAt = jstIso(slot.date, slot.startTime);
    const claimedEndAt = jstIso(slot.date, slot.endTime);
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
          eq(workRecords.slotId, slot.id),
          eq(workRecords.userEmail, user.email),
        ),
      )
      .limit(1);
    if (existing[0] && existing[0].status !== "rejected")
      return Response.json({ ok: true, record: existing[0] });
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      groupId,
      planId: plan.id,
      slotId: slot.id,
      userEmail: user.email,
      scheduledDate: slot.date,
      scheduledStartTime: slot.startTime,
      scheduledEndTime: slot.endTime,
      claimedStartAt,
      claimedEndAt,
      status: "unsubmitted",
      employeeNote: "",
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
    if (!body.scheduledDate || !body.claimedStartAt || !body.claimedEndAt)
      return error("scheduledDate and claim times are required.", 400);
    const claimedStartAt = inputToIso(body.claimedStartAt);
    const claimedEndAt = inputToIso(body.claimedEndAt);
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
          eq(workRecords.scheduledDate, body.scheduledDate),
          isNull(workRecords.slotId),
        ),
      )
      .limit(1);
    if (existing[0] && existing[0].status !== "rejected")
      return Response.json({ ok: true, record: existing[0] });
    const now = new Date().toISOString();
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
      employeeNote: "",
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
    const now = new Date().toISOString();
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
      .filter((record) => attendanceExpired(record.startedAt))
      .map((record) => record.id);
    if (expiredIds.length) {
      await db
        .update(workRecords)
        .set({ activeKey: null, updatedAt: now })
        .where(inArray(workRecords.id, expiredIds));
    }
    if (openRecords.some((record) => !attendanceExpired(record.startedAt)))
      return error(
        "勤務中の記録が残っています。先に勤務終了を記録してください。",
        409,
      );
    if (body.slotId)
      return error(
        "通常の勤務開始ではシフトを指定できません。勤務申告のシフト通り操作を利用してください。",
        400,
      );
    const scheduledDate = todayJst();
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
        startedAt: new Date().toISOString(),
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
    const endedAt = new Date().toISOString();
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
    const endedAt = new Date().toISOString();
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
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    recordId?: string;
    status?: string;
    managerNote?: string;
    employeeNote?: string;
    claimedBreakMinutes?: number;
    confirm?: boolean;
    monthKey?: string;
  };
  if (body.action === "save-claim") {
    const claimBody = body as typeof body & {
      claimedStartAt?: string;
      claimedEndAt?: string;
    };
    if (!body.recordId || !claimBody.claimedStartAt)
      return error("recordId and claimedStartAt are required.", 400);
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
    const claimedStartAt = inputToIso(claimBody.claimedStartAt);
    const claimedEndAt = inputToIso(claimBody.claimedEndAt);
    if (!claimedStartAt || (claimBody.claimedEndAt && !claimedEndAt))
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
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workRecords.id, record.id));
    return Response.json({ ok: true, recordId: record.id });
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
    if (!record.scheduledStartTime || !record.scheduledEndTime)
      return error("A scheduled shift is not linked to this record.", 409);
    if (record.monthlyClosedAt)
      return error(
        "This month has been closed and cannot be changed until an administrator reopens it.",
        409,
      );
    const resetDailyApproval =
      record.status === "submitted" ||
      record.status === "approved" ||
      record.status === "rejected";
    const now = new Date().toISOString();
    await current.db
      .update(workRecords)
      .set({
        claimedStartAt: jstIso(record.scheduledDate, record.scheduledStartTime),
        claimedEndAt: jstIso(record.scheduledDate, record.scheduledEndTime),
        status: resetDailyApproval ? "unsubmitted" : record.status,
        approvedBy: resetDailyApproval ? null : record.approvedBy,
        approvedAt: resetDailyApproval ? null : record.approvedAt,
        updatedAt: now,
      })
      .where(eq(workRecords.id, record.id));
    return Response.json({ ok: true, recordId: record.id });
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
    if (!record.claimedStartAt || !record.claimedEndAt)
      return error("申告の開始・終了時刻を入力してください。", 400);
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
    const now = new Date().toISOString();
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
    const now = new Date().toISOString();
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
  const now = new Date().toISOString();
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
  return Response.json({ ok: true, recordId: record.id, status: body.status });
}
