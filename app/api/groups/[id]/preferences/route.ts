import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupPreferences, shiftAvailability } from "../../../../../db/schema";
import { getMembership } from "../../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!await getMembership(id, user.email)) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const db = getDb();
  const [preferences] = await db.select().from(groupPreferences).where(and(eq(groupPreferences.groupId, id), eq(groupPreferences.userEmail, user.email))).limit(1);
  const availability = await db.select().from(shiftAvailability).where(and(eq(shiftAvailability.groupId, id), eq(shiftAvailability.userEmail, user.email)));
  return Response.json({ preferences: preferences ?? { groupId: id, userEmail: user.email, minDays: 0, maxDays: 7, minHours: 0, maxHours: 40, weekendPolicy: "any", freeComment: "" }, availability });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!await getMembership(id, user.email)) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const body = await request.json() as { minDays?: number; maxDays?: number; minHours?: number; maxHours?: number; weekendPolicy?: string; freeComment?: string; availability?: Array<{ dayOfWeek: number; status: string; startTime?: string; endTime?: string; note?: string }> };
  const minDays = Math.max(0, Math.min(7, Number(body.minDays ?? 0)));
  const maxDays = Math.max(minDays, Math.min(7, Number(body.maxDays ?? 7)));
  const minHours = Math.max(0, Math.min(168, Number(body.minHours ?? 0)));
  const maxHours = Math.max(minHours, Math.min(168, Number(body.maxHours ?? 40)));
  const weekendPolicy = ["any", "prefer_off", "unavailable"].includes(body.weekendPolicy ?? "") ? body.weekendPolicy! : "any";
  const entries = (body.availability ?? []).filter((entry) => Number.isInteger(entry.dayOfWeek) && entry.dayOfWeek >= 0 && entry.dayOfWeek <= 6 && ["available", "limited", "unavailable"].includes(entry.status));
  const db = getDb();
  const [existing] = await db.select().from(groupPreferences).where(and(eq(groupPreferences.groupId, id), eq(groupPreferences.userEmail, user.email))).limit(1);
  await db.batch([
    existing ? db.update(groupPreferences).set({ minDays, maxDays, minHours, maxHours, weekendPolicy, freeComment: body.freeComment?.trim().slice(0, 500) ?? "" }).where(eq(groupPreferences.id, existing.id)) : db.insert(groupPreferences).values({ id: crypto.randomUUID(), groupId: id, userEmail: user.email, minDays, maxDays, minHours, maxHours, weekendPolicy, freeComment: body.freeComment?.trim().slice(0, 500) ?? "" }),
    db.delete(shiftAvailability).where(and(eq(shiftAvailability.groupId, id), eq(shiftAvailability.userEmail, user.email))),
    ...entries.map((entry) => db.insert(shiftAvailability).values({ id: crypto.randomUUID(), groupId: id, userEmail: user.email, dayOfWeek: entry.dayOfWeek, status: entry.status, startTime: entry.startTime ?? "", endTime: entry.endTime ?? "", note: entry.note?.trim() ?? "" })),
  ]);
  return Response.json({ ok: true });
}
