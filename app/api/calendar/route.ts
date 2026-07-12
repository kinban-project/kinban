import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { attachments, events } from "../../../db/schema";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const db = getDb();
  const rows = await db.select().from(events).where(eq(events.ownerEmail, user.email)).orderBy(desc(events.date), desc(events.startTime));
  const files = await db.select().from(attachments).where(eq(attachments.ownerEmail, user.email));
  const fileMap = new Map<string, typeof files>();
  for (const file of files) fileMap.set(file.eventId, [...(fileMap.get(file.eventId) ?? []), file]);
  return Response.json({ email: user.email, events: rows.map((event) => ({ ...event, attachments: fileMap.get(event.id) ?? [] })) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = await request.json() as Partial<typeof events.$inferInsert>;
  const title = payload.title?.trim() ?? "";
  const date = payload.date?.trim() ?? "";
  if (!title || !date) return Response.json({ error: "title and date are required" }, { status: 400 });

  const event = {
    id: crypto.randomUUID(),
    ownerEmail: user.email,
    title,
    date,
    startTime: payload.startTime ?? "",
    endTime: payload.endTime ?? "",
    category: payload.category ?? "仕事",
    notes: payload.notes ?? "",
    completed: false,
  };
  const db = getDb();
  await db.insert(events).values(event);
  return Response.json({ event: { ...event, attachments: [] } }, { status: 201 });
}
