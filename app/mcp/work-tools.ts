import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "../../db";
import { groupMembers, monthlyWorkClaims, shiftAssignments, shiftPlans, shiftSlots, workBreaks, workRecords } from "../../db/schema";
import { attendanceExpired } from "../attendance-expired";
import { recordAudit } from "../audit-log";
import { sendBusinessPush } from "../notification-events";
import { getDemoNow, getDemoTimeContext, jstDate } from "../demo-clock";
import { shiftDateTime } from "../shift-time";

type Db = ReturnType<typeof getDb>;
type Args = Record<string, unknown>;

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, value] = month.split("-").map(Number);
  if (value < 1 || value > 12) return null;
  const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function error(message: string) {
  return { error: message };
}

export async function getMcpWorkRecords(db: Db, groupId: string, email: string, args: Args) {
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email))).limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  const manager = membership.role === "owner" || membership.role === "editor";
  // 管理者が対象者を指定しない場合は、シフト外・手動申告を含めて
  // グループ全体を確認できるようにする。指定時は従来どおり個人に絞る。
  const requestedEmail = manager && typeof args.userEmail === "string" ? args.userEmail : manager ? "" : email;
  const from = typeof args.from === "string" ? args.from : "";
  const to = typeof args.to === "string" ? args.to : "";
  const status = typeof args.status === "string" ? args.status : "";
  const filters = [eq(workRecords.groupId, groupId), requestedEmail ? eq(workRecords.userEmail, requestedEmail) : undefined, from ? gte(workRecords.scheduledDate, from) : undefined, to ? lte(workRecords.scheduledDate, to) : undefined, status ? eq(workRecords.status, status) : undefined];
  const records = await db.select().from(workRecords).where(and(...filters)).limit(200);
  const ids = records.map((record) => record.id);
  // D1/SQLite limits the number of bound variables in one statement. A busy
  // month can contain more records than that limit, so fetch related breaks
  // in bounded batches instead of making one oversized IN (...) query.
  const breaks: typeof workBreaks.$inferSelect[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    const batch = ids.slice(index, index + 80);
    breaks.push(...(await db.select().from(workBreaks).where(inArray(workBreaks.workRecordId, batch))));
  }
  return { ok: true, demoTime: await getDemoTimeContext(groupId), records, breaks, filters: { userEmail: requestedEmail || null, from, to, status } };
}

export async function mcpClock(db: Db, groupId: string, email: string, action: string, recordId?: string) {
  const demoNow = await getDemoNow(groupId);
  const now = demoNow.toISOString();
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email))).limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  if (action === "start") {
    const open = await db.select().from(workRecords).where(and(eq(workRecords.groupId, groupId), eq(workRecords.userEmail, email), eq(workRecords.status, "working"), isNull(workRecords.endedAt))).limit(1);
    const nowExpired = open.filter((record) => attendanceExpired(record.startedAt, demoNow)).map((record) => record.id);
    if (nowExpired.length) await db.update(workRecords).set({ activeKey: null, updatedAt: now }).where(inArray(workRecords.id, nowExpired));
    if (open.some((record) => !attendanceExpired(record.startedAt, demoNow))) return error("An active work record already exists.");
    const row = { id: crypto.randomUUID(), groupId, planId: null, slotId: null, userEmail: email, scheduledDate: jstDate(demoNow), scheduledStartTime: "", scheduledEndTime: "", startedAt: now, claimedStartAt: now, activeKey: `${groupId}:${email}`, status: "working", employeeNote: "" };
    try {
      await db.insert(workRecords).values(row);
    } catch (caught) {
      if (String(caught).toLowerCase().includes("unique")) return error("An active work record already exists.");
      throw caught;
    }
    await recordAudit({ groupId, userEmail: email, action: "work.start", entityType: "workRecord", entityId: row.id, summary: "勤務開始を記録しました", details: { source: "mcp" } });
    return { ok: true, record: row };
  }
  if (!recordId) return error("recordId is required.");
  const [record] = await db.select().from(workRecords).where(and(eq(workRecords.id, recordId), eq(workRecords.groupId, groupId), eq(workRecords.userEmail, email))).limit(1);
  if (!record) return error("Work record not found.");
  if (action === "end") {
    if (record.endedAt) return error("This work record has already ended.");
    await db.update(workRecords).set({ endedAt: now, claimedEndAt: now, activeKey: null, updatedAt: now }).where(eq(workRecords.id, record.id));
    await recordAudit({ groupId, userEmail: email, action: "work.end", entityType: "workRecord", entityId: record.id, summary: "勤務終了を記録しました", details: { source: "mcp" } });
    return { ok: true, recordId: record.id, endedAt: now };
  }
  if (action === "break-start" || action === "break-end") {
    if (record.endedAt || record.status !== "working") return error("An active work record is required.");
    const current = await db.select().from(workBreaks).where(eq(workBreaks.workRecordId, record.id));
    const openBreak = current.find((item) => !item.endedAt);
    if (action === "break-start") {
      if (openBreak) return error("A break is already in progress.");
      const row = { id: crypto.randomUUID(), workRecordId: record.id, startedAt: now };
      await db.insert(workBreaks).values(row);
      await recordAudit({ groupId, userEmail: email, action: "work.break.start", entityType: "workBreak", entityId: row.id, summary: "休憩開始を記録しました", details: { source: "mcp" } });
      return { ok: true, break: row };
    }
    if (!openBreak) return error("No active break was found.");
    await db.update(workBreaks).set({ endedAt: now }).where(eq(workBreaks.id, openBreak.id));
    await recordAudit({ groupId, userEmail: email, action: "work.break.end", entityType: "workBreak", entityId: openBreak.id, summary: "休憩終了を記録しました", details: { source: "mcp" } });
    return { ok: true, breakId: openBreak.id, endedAt: now };
  }
  return error("action must be start, end, break-start, or break-end.");
}

export async function mcpDailyReview(db: Db, groupId: string, actorEmail: string, recordId: string, status: string, managerNote = "") {
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, actorEmail))).limit(1);
  const [record] = await db.select().from(workRecords).where(and(eq(workRecords.id, recordId), eq(workRecords.groupId, groupId))).limit(1);
  if (!record) return error("Work record not found.");
  if (status === "submitted") {
    if (!membership || membership.status !== "active" || record.userEmail !== actorEmail) return error("Only the record owner can submit a daily claim.");
    if (!record.claimedStartAt || !record.claimedEndAt) return error("Claimed start and end times are required.");
    if (record.monthlyClosedAt) return error("This month has been closed.");
    const now = (await getDemoNow(groupId)).toISOString();
    await db.update(workRecords).set({ status: "submitted", updatedAt: now }).where(eq(workRecords.id, record.id));
    await recordAudit({ groupId, userEmail: actorEmail, action: "work.submit", entityType: "workRecord", entityId: record.id, summary: "勤務申告を提出しました", details: { source: "mcp" } });
    return { ok: true, recordId, status: "submitted" };
  }
  if (!membership || !["owner", "editor"].includes(membership.role)) return error("Owner or editor permission is required.");
  if (!["approved", "rejected"].includes(status)) return error("status must be submitted, approved, or rejected.");
  if (record.monthlyClosedAt) return error("This month has been closed. Reopen it before changing records.");
  const now = (await getDemoNow(groupId)).toISOString();
  await db.update(workRecords).set({ status, managerNote: managerNote.slice(0, 500), approvedBy: actorEmail, approvedAt: now, updatedAt: now }).where(eq(workRecords.id, record.id));
  await recordAudit({ groupId, userEmail: actorEmail, action: "work.review", entityType: "workRecord", entityId: record.id, summary: `勤務申告を${status === "approved" ? "承認" : "差戻し"}しました`, details: { status, managerNote, source: "mcp" } });
  if (status === "rejected") await sendBusinessPush(db, { recipients: [record.userEmail], eventId: `daily-work-rejected:${record.id}:${now}`, title: "KINBAN", body: "勤怠の確認・修正が必要です", url: `/?group=${encodeURIComponent(groupId)}&view=work-records`, urgency: "high" });
  return { ok: true, recordId, status };
}

export async function mcpReopenWorkRecord(db: Db, groupId: string, actorEmail: string, recordId: string) {
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, actorEmail)))
    .limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  const [record] = await db
    .select()
    .from(workRecords)
    .where(and(eq(workRecords.id, recordId), eq(workRecords.groupId, groupId), eq(workRecords.userEmail, actorEmail)))
    .limit(1);
  if (!record) return error("Work record not found.");
  if (record.monthlyClosedAt) return error("This month has been approved. An administrator must reopen it first.");
  if (!["submitted", "approved"].includes(record.status)) return error("This work record is already editable.");
  const now = (await getDemoNow(groupId)).toISOString();
  await db
    .update(workRecords)
    .set({ status: "unsubmitted", approvedBy: null, approvedAt: null, updatedAt: now })
    .where(eq(workRecords.id, record.id));
  await recordAudit({
    groupId,
    userEmail: actorEmail,
    action: "work.claim.edit.start",
    entityType: "workRecord",
    entityId: record.id,
    summary: "勤務申告を修正可能な状態に戻しました",
    details: { previousStatus: record.status, source: "mcp" },
  });
  return { ok: true, recordId, status: "unsubmitted" };
}

function mcpClaimTime(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? new Date(`${text}:00+09:00`)
    : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function scheduledClaimTime(date: string, time: string) {
  if (!time) return null;
  const shifted = shiftDateTime(date, time);
  const parsed = new Date(`${shifted.date}T${shifted.time}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function mcpCreateWorkRecord(db: Db, groupId: string, actorEmail: string, args: Args) {
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, actorEmail))).limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  const slotId = typeof args.slotId === "string" ? args.slotId.trim() : "";
  let planId: string | null = null;
  let scheduledDate = typeof args.scheduledDate === "string" ? args.scheduledDate.trim() : "";
  let scheduledStartTime = "";
  let scheduledEndTime = "";
  if (slotId) {
    const [slot] = await db.select().from(shiftSlots).where(eq(shiftSlots.id, slotId)).limit(1);
    if (!slot) return error("Assigned shift slot not found.");
    const [plan] = await db.select().from(shiftPlans).where(eq(shiftPlans.id, slot.planId)).limit(1);
    const [assignment] = await db.select().from(shiftAssignments).where(and(eq(shiftAssignments.slotId, slot.id), eq(shiftAssignments.userEmail, actorEmail))).limit(1);
    if (!plan || plan.groupId !== groupId || plan.status !== "published" || !assignment) return error("You are not assigned to this published shift in the requested group.");
    planId = plan.id;
    scheduledDate = slot.date;
    scheduledStartTime = slot.startTime;
    scheduledEndTime = slot.endTime;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return error("scheduledDate must be YYYY-MM-DD.");
  const existing = await db.select().from(workRecords).where(and(eq(workRecords.groupId, groupId), eq(workRecords.userEmail, actorEmail), eq(workRecords.scheduledDate, scheduledDate), slotId ? eq(workRecords.slotId, slotId) : isNull(workRecords.slotId))).limit(1);
  if (existing[0] && existing[0].status !== "rejected") return error("A work record already exists for this date or shift.");
  const claimedStartAt = args.claimedStartAt === undefined && scheduledStartTime ? scheduledClaimTime(scheduledDate, scheduledStartTime) : mcpClaimTime(args.claimedStartAt);
  const claimedEndAt = args.claimedEndAt === undefined && scheduledEndTime ? scheduledClaimTime(scheduledDate, scheduledEndTime) : mcpClaimTime(args.claimedEndAt);
  if (!claimedStartAt || !claimedEndAt) return error("Claimed start and end times are required.");
  if (new Date(claimedEndAt).getTime() < new Date(claimedStartAt).getTime()) return error("Claimed end must be after claimed start.");
  const now = (await getDemoNow(groupId)).toISOString();
  const row = {
    id: existing[0]?.id ?? crypto.randomUUID(), groupId, planId, slotId: slotId || null, userEmail: actorEmail,
    scheduledDate, scheduledStartTime, scheduledEndTime, startedAt: null, endedAt: null,
    claimedStartAt, claimedEndAt, claimedBreakMinutes: Math.max(0, Math.min(1440, Math.round(Number(args.claimedBreakMinutes) || 0))),
    activeKey: null, status: "unsubmitted", employeeNote: String(args.employeeNote ?? "").trim().slice(0, 500), managerNote: "", approvedBy: null, approvedAt: null, monthlyClosedAt: null, monthlyClosedBy: null,
    createdAt: existing[0]?.createdAt ?? now, updatedAt: now,
  };
  if (existing[0]) await db.update(workRecords).set(row).where(eq(workRecords.id, existing[0].id));
  else await db.insert(workRecords).values(row);
  await recordAudit({ groupId, userEmail: actorEmail, action: "work.claim.create", entityType: "workRecord", entityId: row.id, summary: "勤務申告を作成しました", details: { source: "mcp", slotId: slotId || null } });
  return { ok: true, record: row };
}

export async function mcpSaveWorkRecord(db: Db, groupId: string, actorEmail: string, recordId: string, args: Args) {
  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, actorEmail)))
    .limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  const [record] = await db
    .select()
    .from(workRecords)
    .where(and(eq(workRecords.id, recordId), eq(workRecords.groupId, groupId), eq(workRecords.userEmail, actorEmail)))
    .limit(1);
  if (!record) return error("Work record not found.");
  if (record.monthlyClosedAt) return error("This month has been approved. An administrator must reopen it first.");
  if (["submitted", "approved"].includes(record.status)) return error("Reopen the work record before editing it.");
  const claimedStartAt = mcpClaimTime(args.claimedStartAt);
  const claimedEndAt = mcpClaimTime(args.claimedEndAt);
  if (args.claimedStartAt !== undefined && claimedStartAt === null && String(args.claimedStartAt).trim() !== "") return error("Invalid claimedStartAt. Use ISO time, for example 2026-07-20T09:40+09:00.");
  if (args.claimedEndAt !== undefined && claimedEndAt === null && String(args.claimedEndAt).trim() !== "") return error("Invalid claimedEndAt. Use ISO time, for example 2026-07-20T17:00+09:00.");
  const nextStart = claimedStartAt === undefined ? record.claimedStartAt : claimedStartAt;
  const nextEnd = claimedEndAt === undefined ? record.claimedEndAt : claimedEndAt;
  if (nextStart && nextEnd && new Date(nextEnd).getTime() < new Date(nextStart).getTime()) return error("Claimed end must be after claimed start.");
  const breakValue = args.claimedBreakMinutes === undefined
    ? record.claimedBreakMinutes
    : Math.max(0, Math.min(1440, Math.round(Number(args.claimedBreakMinutes) || 0)));
  const note = args.employeeNote === undefined ? record.employeeNote : String(args.employeeNote).trim().slice(0, 500);
  const now = (await getDemoNow(groupId)).toISOString();
  await db.update(workRecords).set({ claimedStartAt: nextStart, claimedEndAt: nextEnd, claimedBreakMinutes: breakValue, employeeNote: note, updatedAt: now }).where(eq(workRecords.id, record.id));
  await recordAudit({ groupId, userEmail: actorEmail, action: "work.claim.save", entityType: "workRecord", entityId: record.id, summary: "勤務申告の時刻・休憩・備考を保存しました", details: { source: "mcp" } });
  return { ok: true, recordId, status: record.status, claimedStartAt: nextStart, claimedEndAt: nextEnd, claimedBreakMinutes: breakValue, employeeNote: note };
}

export async function mcpSubmitMonthly(db: Db, groupId: string, email: string, month: string) {
  const bounds = monthBounds(month);
  if (!bounds) return error("month must be YYYY-MM.");
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email))).limit(1);
  if (!membership || membership.status !== "active") return error("Active group membership is required.");
  const rows = await db.select().from(workRecords).where(and(eq(workRecords.groupId, groupId), eq(workRecords.userEmail, email), gte(workRecords.scheduledDate, bounds.start), lte(workRecords.scheduledDate, bounds.end)));
  if (rows.some((row) => !row.claimedStartAt || !row.claimedEndAt || row.status === "working")) return error("All work records must have claimed start and end times before monthly submission.");
  const now = (await getDemoNow(groupId)).toISOString();
  const [existing] = await db.select().from(monthlyWorkClaims).where(and(eq(monthlyWorkClaims.groupId, groupId), eq(monthlyWorkClaims.userEmail, email), eq(monthlyWorkClaims.monthKey, month))).limit(1);
  if (existing?.status === "approved") return error("This month has already been approved.");
  if (existing) await db.update(monthlyWorkClaims).set({ status: "submitted", submittedAt: now, approvedAt: null, approvedBy: null, updatedAt: now }).where(eq(monthlyWorkClaims.id, existing.id));
  else await db.insert(monthlyWorkClaims).values({ id: crypto.randomUUID(), groupId, userEmail: email, monthKey: month, status: "submitted", submittedAt: now });
  await recordAudit({ groupId, userEmail: email, action: "work.month.submit", entityType: "monthlyWorkClaim", entityId: existing?.id ?? month, summary: `${month}の月次申告を提出しました`, details: { source: "mcp" } });
  return { ok: true, month, status: "submitted", submittedAt: now };
}

export async function mcpReviewMonthly(db: Db, groupId: string, actorEmail: string, month: string, targetEmail: string, action: string, managerNote = "") {
  const bounds = monthBounds(month);
  if (!bounds) return error("month must be YYYY-MM.");
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, actorEmail))).limit(1);
  if (!membership || !["owner", "editor"].includes(membership.role)) return error("Owner or editor permission is required.");
  if (!["approve", "reject", "reopen"].includes(action)) return error("action must be approve, reject, or reopen.");
  const [claim] = await db.select().from(monthlyWorkClaims).where(and(eq(monthlyWorkClaims.groupId, groupId), eq(monthlyWorkClaims.userEmail, targetEmail), eq(monthlyWorkClaims.monthKey, month))).limit(1);
  if (!claim) return error("Monthly claim not found.");
  if (action === "approve" && claim.status !== "submitted") return error("Only submitted monthly claims can be approved.");
  if (action === "reopen" && claim.status !== "approved") return error("Only approved monthly claims can be reopened.");
  const now = (await getDemoNow(groupId)).toISOString();
  const nextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "submitted";
  await db.update(monthlyWorkClaims).set({ status: nextStatus, approvedAt: action === "approve" ? now : null, approvedBy: action === "approve" ? actorEmail : null, managerNote: managerNote.slice(0, 500), updatedAt: now }).where(eq(monthlyWorkClaims.id, claim.id));
  await db.update(workRecords).set(action === "approve" ? { monthlyClosedAt: now, monthlyClosedBy: actorEmail, updatedAt: now } : { monthlyClosedAt: null, monthlyClosedBy: null, updatedAt: now }).where(and(eq(workRecords.groupId, groupId), eq(workRecords.userEmail, targetEmail), gte(workRecords.scheduledDate, bounds.start), lte(workRecords.scheduledDate, bounds.end)));
  await recordAudit({ groupId, userEmail: actorEmail, action: `work.month.${action}`, entityType: "monthlyWorkClaim", entityId: claim.id, summary: `${month}の月次申告を${action === "approve" ? "承認" : action === "reject" ? "差戻し" : "再開"}しました`, details: { targetEmail, source: "mcp" } });
  if (action === "reject") await sendBusinessPush(db, { recipients: [targetEmail], eventId: `monthly-work-rejected:${claim.id}:${now}`, title: "KINBAN", body: "勤怠の確認・修正が必要です", url: `/?group=${encodeURIComponent(groupId)}&view=monthly-work`, urgency: "high" });
  return { ok: true, month, userEmail: targetEmail, status: nextStatus };
}
