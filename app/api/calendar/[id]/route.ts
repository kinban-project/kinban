import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { attachments, events } from "../../../../db/schema";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id } = await context.params;
  const payload = await request.json() as { completed?: boolean; title?: string; date?: string; startTime?: string; endTime?: string; category?: string; notes?: string };
  const db = getDb();
  const [event] = await db.update(events).set(payload).where(and(eq(events.id, id), eq(events.ownerEmail, user.email))).returning();
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json({ event });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id } = await context.params;
  const db = getDb();
  const files = await db.select().from(attachments).where(and(eq(attachments.eventId, id), eq(attachments.ownerEmail, user.email)));
  if (env.FILES) await Promise.all(files.map((file) => env.FILES.delete(file.objectKey)));
  await db.delete(attachments).where(and(eq(attachments.eventId, id), eq(attachments.ownerEmail, user.email)));
  await db.delete(events).where(and(eq(events.id, id), eq(events.ownerEmail, user.email)));
  return Response.json({ ok: true });
}
