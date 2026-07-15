import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupJoinRequests, groupMembers } from "../../../../../db/schema";
import { getGroup } from "../../group-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group || group.ownerEmail !== user.email) return Response.json({ error: "ownerだけが申請を確認できます" }, { status: 403 });
  const requests = await getDb().select().from(groupJoinRequests).where(eq(groupJoinRequests.groupId, id));
  return Response.json({ requests });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group || group.ownerEmail !== user.email) return Response.json({ error: "ownerだけが申請を処理できます" }, { status: 403 });
  const body = await request.json() as { requestId?: string; action?: "approve" | "reject" };
  if (!body.requestId || !body.action) return Response.json({ error: "requestIdとactionが必要です" }, { status: 400 });
  const db = getDb();
  const [joinRequest] = await db.select().from(groupJoinRequests).where(and(eq(groupJoinRequests.id, body.requestId), eq(groupJoinRequests.groupId, id))).limit(1);
  if (!joinRequest) return Response.json({ error: "参加申請が見つかりません" }, { status: 404 });
  const status = body.action === "approve" ? "approved" : "rejected";
  const statements = [db.update(groupJoinRequests).set({ status }).where(eq(groupJoinRequests.id, body.requestId))];
  if (status === "approved") statements.push(db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: id, userEmail: joinRequest.userEmail, role: "member", showInPersonal: true }));
  await db.batch(statements);
  return Response.json({ ok: true, status });
}
