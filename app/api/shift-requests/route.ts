import { and, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { groupMembers, groupPreferences, groups, shiftAvailability, shiftPlans, shiftRequestPeriods, shiftRequests, shiftSlots } from "../../../db/schema";
import { getMembership } from "../groups/group-access";

export const dynamic = "force-dynamic";
const editable = (role: string) => role === "owner" || role === "editor";
const preferences = new Set(["want", "possible", "off", "unavailable"]);

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const groupId = query.get("groupId") ?? "";
  if (!groupId) return Response.json({ error: "groupIdが必要です" }, { status: 400 });
  const membership = await getMembership(groupId, user.email);
  if (!membership) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const db = getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const allPeriods = await db.select().from(shiftRequestPeriods).where(eq(shiftRequestPeriods.groupId, groupId));
  const periods = editable(membership.role) ? allPeriods : allPeriods.filter((item) => item.status === "open");
  const plans = await db.select().from(shiftPlans).where(eq(shiftPlans.groupId, groupId));
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  const availability = await db.select().from(shiftAvailability).where(and(eq(shiftAvailability.groupId, groupId), editable(membership.role) ? undefined : eq(shiftAvailability.userEmail, user.email)));
  const [preferences] = await db.select().from(groupPreferences).where(and(eq(groupPreferences.groupId, groupId), eq(groupPreferences.userEmail, user.email))).limit(1);
  const periodId = query.get("periodId") ?? periods[0]?.id;
  const period = periods.find((item) => item.id === periodId) ?? null;
  const plan = period ? plans.find((item) => item.id === period.planId) : null;
  const slots = plan ? await db.select().from(shiftSlots).where(eq(shiftSlots.planId, plan.id)) : [];
  const requests = period ? await db.select().from(shiftRequests).where(and(eq(shiftRequests.periodId, period.id), eq(shiftRequests.userEmail, user.email))) : [];
  return Response.json({ group, membership, periods, plans, members, availability, preferences, period, plan, slots, requests, canManage: editable(membership.role) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await request.json() as { action?: string; groupId?: string; periodId?: string; planId?: string; name?: string; opensOn?: string; closesOn?: string; entries?: Array<{ dayOfWeek: number; status: string; startTime?: string; endTime?: string; note?: string }>; requests?: Array<{ date: string; startTime: string; endTime: string; preference: string; note?: string }> };
  const groupId = body.groupId ?? "";
  const membership = await getMembership(groupId, user.email);
  if (!membership) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const db = getDb();

  if (body.action === "save-base") {
    const entries = (body.entries ?? []).filter((entry) => Number.isInteger(entry.dayOfWeek) && entry.dayOfWeek >= 0 && entry.dayOfWeek <= 6 && ["available", "limited", "unavailable"].includes(entry.status));
    await db.batch([
      db.delete(shiftAvailability).where(and(eq(shiftAvailability.groupId, groupId), eq(shiftAvailability.userEmail, user.email))),
      ...entries.map((entry) => db.insert(shiftAvailability).values({ id: crypto.randomUUID(), groupId, userEmail: user.email, dayOfWeek: entry.dayOfWeek, status: entry.status, startTime: entry.startTime ?? "", endTime: entry.endTime ?? "", note: entry.note?.trim() ?? "" })),
    ]);
    return Response.json({ ok: true });
  }

  if (body.action === "create-period") {
    if (!editable(membership.role)) return Response.json({ error: "受付期間の作成には編集権限が必要です" }, { status: 403 });
    const [plan] = await db.select().from(shiftPlans).where(and(eq(shiftPlans.id, body.planId ?? ""), eq(shiftPlans.groupId, groupId))).limit(1);
    if (!plan) return Response.json({ error: "対象のシフト計画が見つかりません" }, { status: 404 });
    if (!body.name?.trim() || !body.opensOn || !body.closesOn) return Response.json({ error: "受付名、開始日、締切日が必要です" }, { status: 400 });
    const id = crypto.randomUUID();
    await db.insert(shiftRequestPeriods).values({ id, groupId, planId: plan.id, name: body.name.trim(), opensOn: body.opensOn, closesOn: body.closesOn, status: "open", createdBy: user.email });
    return Response.json({ ok: true, id }, { status: 201 });
  }

  if (body.action === "save-requests") {
    if (!body.periodId) return Response.json({ error: "periodIdが必要です" }, { status: 400 });
    const [period] = await db.select().from(shiftRequestPeriods).where(and(eq(shiftRequestPeriods.id, body.periodId), eq(shiftRequestPeriods.groupId, groupId))).limit(1);
    if (!period) return Response.json({ error: "希望受付が見つかりません" }, { status: 404 });
    if (period.status !== "open") return Response.json({ error: "この受付期間は締め切られています" }, { status: 409 });
    const slots = await db.select().from(shiftSlots).where(eq(shiftSlots.planId, period.planId));
    const valid = new Set(slots.map((slot) => `${slot.date}|${slot.startTime}|${slot.endTime}`));
    const rows = (body.requests ?? []).filter((item) => valid.has(`${item.date}|${item.startTime}|${item.endTime}`) && preferences.has(item.preference)).map((item) => ({ id: crypto.randomUUID(), periodId: period.id, userEmail: user.email, date: item.date, startTime: item.startTime, endTime: item.endTime, preference: item.preference, note: item.note?.trim() ?? "" }));
    await db.batch([db.delete(shiftRequests).where(and(eq(shiftRequests.periodId, period.id), eq(shiftRequests.userEmail, user.email))), ...rows.map((row) => db.insert(shiftRequests).values(row))]);
    return Response.json({ ok: true, count: rows.length });
  }
  return Response.json({ error: "不明な操作です" }, { status: 400 });
}
