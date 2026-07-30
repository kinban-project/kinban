import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { calendarSubscriptions, groupMembers, groups, shiftAssignments, shiftPlans, shiftSlots } from "../../../../../db/schema";
import { hashApiToken } from "../../../../api/api-auth";
import { getDemoNow, jstDate } from "../../../../demo-clock";
import { shiftTimeToMinutes } from "../../../../shift-time";

export const dynamic = "force-dynamic";

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

function utcDateTime(date: string, time: string) {
  const minutes = shiftTimeToMinutes(time);
  if (!Number.isFinite(minutes)) return null;
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setTime(value.getTime() + minutes * 60_000);
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function foldLine(value: string) {
  const max = 74;
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += max) lines.push(index === 0 ? value.slice(index, index + max) : ` ${value.slice(index, index + max)}`);
  return lines.join("\r\n");
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await context.params).token);
  const tokenHash = await hashApiToken(token);
  const db = getDb();
  const [subscription] = await db.select().from(calendarSubscriptions).where(and(eq(calendarSubscriptions.tokenHash, tokenHash), eq(calendarSubscriptions.status, "active"))).limit(1);
  if (!subscription) return new Response("Not found", { status: 404 });
  const [membership] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, subscription.groupId), eq(groupMembers.userEmail, subscription.userEmail), eq(groupMembers.status, "active"))).limit(1);
  if (!membership) return new Response("Not found", { status: 404 });
  const [group] = await db.select().from(groups).where(eq(groups.id, subscription.groupId)).limit(1);
  if (!group) return new Response("Not found", { status: 404 });

  const now = await getDemoNow(subscription.groupId);
  const today = jstDate(now);
  const from = dateOffset(today, -90);
  const to = dateOffset(today, 90);
  const plans = await db.select().from(shiftPlans).where(and(eq(shiftPlans.groupId, subscription.groupId), eq(shiftPlans.status, "published")));
  const planIds = plans.filter((plan) => plan.endDate >= from && plan.startDate <= to).map((plan) => plan.id);
  const slots = planIds.length ? (await Promise.all(chunks(planIds, 50).map((ids) => db.select().from(shiftSlots).where(inArray(shiftSlots.planId, ids))))).flat() : [];
  const slotIds = slots.map((slot) => slot.id);
  const assignments = slotIds.length ? (await Promise.all(chunks(slotIds, 50).map((ids) => db.select().from(shiftAssignments).where(and(eq(shiftAssignments.userEmail, subscription.userEmail), inArray(shiftAssignments.slotId, ids)))))).flat() : [];
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.slotId));
  const assignmentBySlotId = new Map(assignments.map((assignment) => [assignment.slotId, assignment]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KINBAN//Shift Calendar//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", foldLine(`X-WR-CALNAME:${escapeIcs(group.name)} KINBAN`)];

  for (const slot of slots.filter((item) => assignedSlotIds.has(item.id) && item.date >= from && item.date <= to)) {
    const plan = planById.get(slot.planId);
    const start = utcDateTime(slot.date, slot.startTime);
    const end = utcDateTime(slot.date, slot.endTime);
    if (!plan || !start || !end) continue;
    const assignment = assignmentBySlotId.get(slot.id);
    if (!assignment) continue;
    const role = slot.role.trim() || "担当";
    const summary = `${group.name}｜${role}`;
    const description = [`グループ: ${group.name}`, `担当: ${role}`, `シフト: ${plan.name}`, `期間: ${plan.startDate}〜${plan.endDate}`, `KINBAN: ${new URL(request.url).origin}`].join("\n");
    const uid = `kinban-${slot.id}-${encodeURIComponent(subscription.userEmail)}@kinban.jp`;
    lines.push("BEGIN:VEVENT", foldLine(`UID:${uid}`), foldLine(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`), `DTSTART:${start}`, `DTEND:${end}`, foldLine(`SUMMARY:${escapeIcs(summary)}`), foldLine(`DESCRIPTION:${escapeIcs(description)}`), `SEQUENCE:${plan.version}`, "STATUS:CONFIRMED", "END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  await db.update(calendarSubscriptions).set({ lastUsedAt: new Date().toISOString() }).where(eq(calendarSubscriptions.id, subscription.id));
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="kinban-${subscription.groupId}.ics"`, "Cache-Control": "no-cache, no-store, must-revalidate" } });
}
