import { eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { accountProfiles, events, groupMembers, groups, shiftAssignments, shiftPlans, shiftSlots } from "../../../../db/schema";
import { getMembership } from "../../groups/group-access";

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
  if (!await getMembership(plan.groupId, user.email)) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  const assignmentChunks = await Promise.all(chunk(slots.map((slot) => slot.id), 50).map((slotIds) => db.select().from(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds))));
  const assignments = assignmentChunks.flat();
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, plan.groupId));
  const activeDates = new Set(slots.map((slot) => slot.date));
  const closedDates = dateKeys(plan.startDate, plan.endDate).filter((date) => !activeDates.has(date));
  return Response.json({ currentEmail: user.email, plan, slots, assignments, members, closedDates });
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
  const statements = chunk(slots.map((slot) => slot.id), 50).flatMap((slotIds) => [
    db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)),
    db.delete(shiftSlots).where(inArray(shiftSlots.id, slotIds)),
  ]);
  statements.push(db.delete(events).where(eq(events.shiftPlanId, id)));
  statements.push(db.delete(shiftPlans).where(eq(shiftPlans.id, id)));
  await db.batch(statements);
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
  const body = await request.json() as { layout?: { notes?: string; slots?: Array<{ id?: string; date: string; startTime: string; endTime: string; requiredCount: number; role?: string }>; closedDates?: string[] }; assignments?: Record<string, string[]>; status?: "draft" | "published" };
  const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, id));
  if (body.layout) {
    const closedDates = new Set(body.layout.closedDates ?? []);
    const nextSlots = (body.layout.slots ?? []).filter((slot) => !closedDates.has(slot.date) && slot.date >= plan.startDate && slot.date <= plan.endDate && slot.startTime < slot.endTime).map((slot) => ({ id: slot.id ?? crypto.randomUUID(), planId: id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, requiredCount: Math.max(1, Math.min(50, Number(slot.requiredCount) || 1)), role: slot.role?.trim() ?? "" }));
    const statements = [db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slots.map((slot) => slot.id))), db.delete(shiftSlots).where(eq(shiftSlots.planId, id)), ...chunk(nextSlots, 8).map((rows) => db.insert(shiftSlots).values(rows)), db.update(shiftPlans).set({ notes: body.layout.notes?.trim().slice(0, 2000) ?? plan.notes }).where(eq(shiftPlans.id, id))];
    await db.batch(statements);
    return Response.json({ ok: true, slotCount: nextSlots.length });
  }
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, plan.groupId));
  const validUsers = new Set(members.map((member) => member.userEmail));
  const requested = body.assignments ?? {};
  const allRows = slots.flatMap((slot) => [...new Set((requested[slot.id] ?? []).filter((email) => validUsers.has(email)))].map((userEmail) => ({ id: crypto.randomUUID(), slotId: slot.id, userEmail })));
  const warnings = slots.flatMap((slot) => { const count = requested[slot.id]?.length ?? 0; return count < slot.requiredCount ? [`${slot.date} ${slot.startTime}：必要人数${slot.requiredCount}人に対して${count}人です`] : count > slot.requiredCount ? [`${slot.date} ${slot.startTime}：必要人数を${count - slot.requiredCount}人超えています`] : []; });
  const status = body.status ?? plan.status;
  const statements = chunk(slots.map((slot) => slot.id), 50).map((slotIds) => db.delete(shiftAssignments).where(inArray(shiftAssignments.slotId, slotIds)));
  for (const rows of chunk(allRows, 8)) statements.push(db.insert(shiftAssignments).values(rows));
  statements.push(db.update(shiftPlans).set({ status }).where(eq(shiftPlans.id, id)));
  if (status === "published") {
    statements.push(db.delete(events).where(eq(events.shiftPlanId, id)));
    const profiles = members.length ? await db.select().from(accountProfiles).where(inArray(accountProfiles.userEmail, members.map((member) => member.userEmail))) : [];
    const memberNames = new Map(members.map((member) => [member.userEmail, member.displayName?.trim() || profiles.find((profile) => profile.userEmail === member.userEmail)?.nickname?.trim() || member.userEmail.split("@")[0]]));
    const [group] = await db.select().from(groups).where(eq(groups.id, plan.groupId)).limit(1);
    const publishedEvents = slots.map((slot) => ({ slot, assigned: allRows.filter((row) => row.slotId === slot.id).map((row) => memberNames.get(row.userEmail) ?? row.userEmail) })).filter((item) => item.assigned.length > 0).map((item) => ({ id: crypto.randomUUID(), ownerEmail: plan.createdBy, groupId: plan.groupId, shiftPlanId: id, title: item.slot.role?.trim() || group?.name || "予定", date: item.slot.date, startTime: item.slot.startTime, endTime: item.slot.endTime, category: "仕事", notes: `担当：${item.assigned.join("、")}`, completed: false }));
    for (const rows of chunk(publishedEvents, 8)) statements.push(db.insert(events).values(rows));
  }
  await db.batch(statements);
  return Response.json({ ok: true, status, warnings });
}
