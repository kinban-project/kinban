import { and, desc, eq, gte, lte, like } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { auditLogs, groupMembers } from "../../../../../db/schema";
import { requireGroupMembership } from "../../group-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await requireGroupMembership(id, user.email);
  if (membership.role !== "owner" && membership.role !== "editor") {
    return Response.json({ error: "操作ログを確認する権限がありません" }, { status: 403 });
  }
  const query = new URL(request.url).searchParams;
  const conditions = [eq(auditLogs.groupId, id)];
  const action = query.get("action")?.trim();
  const userEmail = query.get("userEmail")?.trim();
  const search = query.get("search")?.trim();
  const from = query.get("from")?.trim();
  const to = query.get("to")?.trim();
  if (action) conditions.push(eq(auditLogs.action, action));
  if (userEmail) conditions.push(eq(auditLogs.userEmail, userEmail));
  if (search) conditions.push(like(auditLogs.summary, `%${search}%`));
  if (from) conditions.push(gte(auditLogs.createdAt, `${from}T00:00:00`));
  if (to) conditions.push(lte(auditLogs.createdAt, `${to}T23:59:59`));
  const db = getDb();
  const [logs, members] = await Promise.all([
    db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(300),
    db.select({ userEmail: groupMembers.userEmail, displayName: groupMembers.displayName }).from(groupMembers).where(eq(groupMembers.groupId, id)),
  ]);
  return Response.json({ logs, members });
}
