import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { events } from "../../../../db/schema";
import { getMembership } from "../../groups/group-access";

export const dynamic = "force-dynamic";

async function findEvent(id: string, email: string) {
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return { event: null, allowed: false };
  if (!event.groupId) return { event, allowed: event.ownerEmail === email };
  const membership = await getMembership(event.groupId, email);
  return { event, allowed: membership?.role === "owner" || membership?.role === "editor" };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const found = await findEvent(id, user.email);
  if (!found.event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (!found.allowed) return Response.json({ error: "この予定を編集する権限がありません" }, { status: 403 });
  const payload = await request.json() as { completed?: boolean; title?: string; date?: string; endDate?: string; startTime?: string; endTime?: string; category?: string; notes?: string };
  const [event] = await getDb().update(events).set(payload).where(eq(events.id, id)).returning();
  return Response.json({ event });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const found = await findEvent(id, user.email);
  if (!found.event) return Response.json({ error: "Event not found" }, { status: 404 });
  if (!found.allowed) return Response.json({ error: "この予定を削除する権限がありません" }, { status: 403 });
  const db = getDb();
  await db.delete(events).where(eq(events.id, id));
  return Response.json({ ok: true });
}
