import { eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { attachments, events, groupJoinRequests, groupMembers, groups } from "../../../../db/schema";
import { env } from "cloudflare:workers";
import { getGroup, getMembership } from "../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  const db = getDb();
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  const requests = membership.role === "owner" ? await db.select().from(groupJoinRequests).where(eq(groupJoinRequests.groupId, id)) : [];
  const safeMembers = membership.role === "owner" || membership.role === "editor" ? members : members.map(({ adminNote: _adminNote, ...member }) => member);
  return Response.json({ currentEmail: user.email, group, membership, members: safeMembers, requests });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  if (group.ownerEmail !== user.email) return Response.json({ error: "グループ削除はownerだけが実行できます" }, { status: 403 });
  const db = getDb();
  const groupEvents = await db.select().from(events).where(eq(events.groupId, id));
  const groupFiles = groupEvents.length ? await db.select().from(attachments).where(eq(attachments.ownerEmail, group.ownerEmail)) : [];
  if (env.FILES) await Promise.all(groupFiles.filter((file) => groupEvents.some((event) => event.id === file.eventId)).map((file) => env.FILES.delete(file.objectKey)));
  await db.batch([
    ...(groupEvents.length ? [db.delete(attachments).where(inArray(attachments.eventId, groupEvents.map((event) => event.id)))] : []),
    db.delete(events).where(eq(events.groupId, id)),
    db.delete(groupJoinRequests).where(eq(groupJoinRequests.groupId, id)),
    db.delete(groupMembers).where(eq(groupMembers.groupId, id)),
    db.delete(groups).where(eq(groups.id, id)),
  ]);
  return Response.json({ ok: true });
}
