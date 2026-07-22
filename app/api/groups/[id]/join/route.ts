import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { groupJoinRequests, groupMembers } from "../../../../../db/schema";
import { getGroup } from "../../group-access";
import { recordAudit } from "../../../../audit-log";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const group = await getGroup(id);
  if (!group) return Response.json({ error: "グループが見つかりません" }, { status: 404 });
  if (group.participationMode !== "request_to_join") return Response.json({ error: "このグループは非公開・招待制です" }, { status: 403 });
  const db = getDb();
  const [member] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, user.email))).limit(1);
  if (member) return Response.json({ membership: member });
  const [existing] = await db.select().from(groupJoinRequests).where(and(eq(groupJoinRequests.groupId, id), eq(groupJoinRequests.userEmail, user.email), eq(groupJoinRequests.status, "pending"))).limit(1);
  if (existing) return Response.json({ request: existing });
  const requestId = crypto.randomUUID();
  await db.insert(groupJoinRequests).values({ id: requestId, groupId: id, userEmail: user.email, status: "pending" });
  await recordAudit({ groupId: id, userEmail: user.email, action: "group.join", entityType: "joinRequest", entityId: requestId, summary: "グループへの参加を申請しました" });
  return Response.json({ request: { id: requestId, groupId: id, userEmail: user.email, status: "pending" } }, { status: 201 });
}
