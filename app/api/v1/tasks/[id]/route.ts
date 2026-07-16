import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { attachments, events } from "../../../../../db/schema";
import { requireApiIdentity } from "../../../api-auth";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const CATEGORIES = ["仕事", "生活", "予定"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const { id } = await context.params;
  const [event] = await getDb().select().from(events).where(and(eq(events.id, id), eq(events.ownerEmail, identity.email))).limit(1);
  if (!event) return Response.json({ error: "Task not found" }, { status: 404 });
  const files = await getDb().select().from(attachments).where(and(eq(attachments.eventId, id), eq(attachments.ownerEmail, identity.email)));
  return Response.json({ data: { ...event, attachments: files } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const { id } = await context.params;
  const payload = await request.json() as { completed?: boolean; title?: string; date?: string; endDate?: string; startTime?: string; endTime?: string; category?: string; notes?: string };
  if (payload.category && !CATEGORIES.includes(payload.category as typeof CATEGORIES[number])) return Response.json({ error: "category must be one of: 仕事, 生活, 予定" }, { status: 400 });
  const update = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const [event] = await getDb().update(events).set(update).where(and(eq(events.id, id), eq(events.ownerEmail, identity.email))).returning();
  if (!event) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ data: event });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await requireApiIdentity(request);
  if (identity instanceof Response) return identity;
  const { id } = await context.params;
  const db = getDb();
  const files = await db.select().from(attachments).where(and(eq(attachments.eventId, id), eq(attachments.ownerEmail, identity.email)));
  if (env.FILES) await Promise.all(files.map((file) => env.FILES.delete(file.objectKey)));
  await db.delete(attachments).where(and(eq(attachments.eventId, id), eq(attachments.ownerEmail, identity.email)));
  await db.delete(events).where(and(eq(events.id, id), eq(events.ownerEmail, identity.email)));
  return Response.json({ ok: true });
}
