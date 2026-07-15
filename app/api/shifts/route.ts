import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { shiftPlans, shiftSlots } from "../../../db/schema";
import { getMembership } from "../groups/group-access";

export const dynamic = "force-dynamic";

function minutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function time(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function dateKeys(start: string, end: string) { const result: string[] = []; const cursor = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`); while (cursor <= last) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return result; }

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const groupId = new URL(request.url).searchParams.get("groupId");
  if (!groupId) return Response.json({ error: "groupIdが必要です" }, { status: 400 });
  if (!await getMembership(groupId, user.email)) return Response.json({ error: "グループのメンバーではありません" }, { status: 403 });
  const plans = await getDb().select().from(shiftPlans).where(eq(shiftPlans.groupId, groupId)).orderBy(desc(shiftPlans.startDate));
  return Response.json({ plans });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const body = await request.json() as { groupId?: string; name?: string; startDate?: string; endDate?: string; openingTime?: string; closingTime?: string; slotMinutes?: number; requiredCount?: number; role?: string };
  const groupId = body.groupId ?? "";
  const membership = await getMembership(groupId, user.email);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "シフト作成にはグループの編集権限が必要です" }, { status: 403 });
  const name = body.name?.trim() ?? "";
  const startDate = body.startDate ?? "";
  const endDate = body.endDate ?? "";
  const openingTime = body.openingTime ?? "09:00";
  const closingTime = body.closingTime ?? "18:00";
  const slotMinutes = body.slotMinutes ?? 60;
  const requiredCount = Math.max(1, body.requiredCount ?? 1);
  if (!name || !startDate || !endDate || startDate > endDate) return Response.json({ error: "名前と正しい期間を入力してください" }, { status: 400 });
  if (![15, 30, 60, 120].includes(slotMinutes) || minutes(closingTime) <= minutes(openingTime)) return Response.json({ error: "営業時間または区切り時間が不正です" }, { status: 400 });
  const id = crypto.randomUUID();
  const slots = dateKeys(startDate, endDate).flatMap((date) => { const rows = []; for (let current = minutes(openingTime); current + slotMinutes <= minutes(closingTime); current += slotMinutes) rows.push({ id: crypto.randomUUID(), planId: id, date, startTime: time(current), endTime: time(current + slotMinutes), requiredCount, role: body.role?.trim() ?? "" }); return rows; });
  const db = getDb();
  const slotStatements = [];
  for (let index = 0; index < slots.length; index += 8) slotStatements.push(db.insert(shiftSlots).values(slots.slice(index, index + 8)));
  await db.batch([db.insert(shiftPlans).values({ id, groupId, name, startDate, endDate, openingTime, closingTime, slotMinutes, defaultRequiredCount: requiredCount, status: "draft", createdBy: user.email }), ...slotStatements]);
  return Response.json({ plan: { id, groupId, name, startDate, endDate, openingTime, closingTime, slotMinutes, defaultRequiredCount: requiredCount, status: "draft" }, slotCount: slots.length }, { status: 201 });
}
