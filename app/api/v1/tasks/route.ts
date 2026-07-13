import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { attachments, events } from "../../../../db/schema";
import { requireApiIdentity } from "../../api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const db = getDb();
  const rows = await db.select().from(events).where(eq(events.ownerEmail, identity.email)).orderBy(desc(events.date), desc(events.startTime));
  const filtered = rows.filter((event) => (!from || event.date >= from) && (!to || event.date <= to));
  const files = await db.select().from(attachments).where(eq(attachments.ownerEmail, identity.email));
  const fileMap = new Map<string, typeof files>();
  for (const file of files) fileMap.set(file.eventId, [...(fileMap.get(file.eventId) ?? []), file]);
  return Response.json({ data: filtered.map((event) => ({ ...event, attachments: fileMap.get(event.id) ?? [] })) });
}

export async function POST(request: Request) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const payload = await request.json() as Partial<typeof events.$inferInsert>;
  const title = payload.title?.trim() ?? "";
  const date = payload.date?.trim() ?? "";
  if (!title || !date) return Response.json({ error: "title and date are required" }, { status: 400 });
  const event = { id: crypto.randomUUID(), ownerEmail: identity.email, title, date, startTime: payload.startTime ?? "", endTime: payload.endTime ?? "", category: payload.category ?? "仕事", notes: payload.notes ?? "", completed: Boolean(payload.completed) };
  await getDb().insert(events).values(event);
  return Response.json({ data: { ...event, attachments: [] } }, { status: 201 });
}
