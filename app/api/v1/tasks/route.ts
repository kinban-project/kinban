import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { events } from "../../../../db/schema";
import { requireApiIdentity } from "../../api-auth";

export const dynamic = "force-dynamic";
const CATEGORIES = ["仕事", "生活", "予定"] as const;

export async function GET(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const db = getDb();
  const rows = await db.select().from(events).where(eq(events.ownerEmail, identity.email)).orderBy(desc(events.date), desc(events.startTime));
  const filtered = rows.filter((event) => (!from || event.date >= from) && (!to || event.date <= to));
  const page = filtered.slice(offset, offset + limit);
  return Response.json({ data: page, pagination: { limit, offset, total: filtered.length, hasMore: offset + page.length < filtered.length } });
}

export async function POST(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const payload = await request.json() as Partial<typeof events.$inferInsert>;
  const title = payload.title?.trim() ?? "";
  const date = payload.date?.trim() ?? "";
  if (!title || !date) return Response.json({ error: "title and date are required" }, { status: 400 });
  if (payload.category && !CATEGORIES.includes(payload.category as typeof CATEGORIES[number])) return Response.json({ error: "category must be one of: 仕事, 生活, 予定" }, { status: 400 });
  const event = { id: crypto.randomUUID(), ownerEmail: identity.email, title, date, endDate: payload.endDate ?? date, startTime: payload.startTime ?? "", endTime: payload.endTime ?? "", category: payload.category ?? "仕事", notes: payload.notes ?? "", completed: Boolean(payload.completed) };
  await getDb().insert(events).values(event);
  return Response.json({ data: event }, { status: 201 });
}
