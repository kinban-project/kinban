import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { assistantMessages, groupAssistants, groupMembers } from "../../../../../db/schema";
import { recordAudit } from "../../../../audit-log";
import { getMembership } from "../../group-access";
import { issueAssistantContext } from "../../../../assistant-context";

export const dynamic = "force-dynamic";

function isManager(role: string) {
  return role === "owner" || role === "editor";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  const requestedMember = new URL(request.url).searchParams.get("member")?.trim();
  const memberEmail = isManager(membership.role) && requestedMember ? requestedMember : user.email;
  const db = getDb();
  const [target, assistant] = await Promise.all([
    db.select({ userEmail: groupMembers.userEmail }).from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userEmail, memberEmail), eq(groupMembers.status, "active"))).limit(1),
    db.select().from(groupAssistants).where(eq(groupAssistants.groupId, id)).limit(1),
  ]);
  if (!target[0]) return Response.json({ error: "メンバーが見つかりません" }, { status: 404 });
  const messages = await db.select().from(assistantMessages).where(and(eq(assistantMessages.groupId, id), eq(assistantMessages.memberEmail, memberEmail))).orderBy(asc(assistantMessages.createdAt));
  const members = isManager(membership.role)
    ? await db.select({ userEmail: groupMembers.userEmail, displayName: groupMembers.displayName }).from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.status, "active")))
    : [];
  return Response.json({ assistant: assistant[0] ?? null, messages, members, currentEmail: user.email, selectedMember: memberEmail, manager: isManager(membership.role) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  const body = await request.json() as { body?: string };
  const text = body.body?.trim().slice(0, 2000) ?? "";
  if (!text) return Response.json({ error: "メッセージを入力してください" }, { status: 400 });
  const db = getDb();
  const [assistant] = await db.select().from(groupAssistants).where(eq(groupAssistants.groupId, id)).limit(1);
  if (!assistant || assistant.status !== "active") return Response.json({ error: "KINBANアシスタントは現在停止中です" }, { status: 409 });
  const messageId = crypto.randomUUID();
  await db.insert(assistantMessages).values({ id: messageId, groupId: id, memberEmail: user.email, senderType: "member", senderEmail: user.email, body: text, status: "pending" });
  const contextToken = await issueAssistantContext(db, { groupId: id, mode: "member", memberEmail: user.email, messageId, issuedBy: user.email });
  await recordAudit({ groupId: id, userEmail: user.email, action: "assistant.message", entityType: "assistantMessage", entityId: messageId, summary: "KINBANアシスタントへメッセージを送信" });
  return Response.json({ ok: true, messageId, contextToken: contextToken.token, contextExpiresAt: contextToken.expiresAt }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  const membership = await getMembership(id, user.email);
  if (!membership) return Response.json({ error: "このグループのメンバーではありません" }, { status: 403 });
  if (!isManager(membership.role)) return Response.json({ error: "管理者権限が必要です" }, { status: 403 });
  const body = await request.json() as { status?: "active" | "inactive" };
  if (body.status !== "active" && body.status !== "inactive") return Response.json({ error: "statusが不正です" }, { status: 400 });
  const db = getDb();
  await db.update(groupAssistants).set({ status: body.status }).where(eq(groupAssistants.groupId, id));
  await recordAudit({ groupId: id, userEmail: user.email, action: "assistant.status", entityType: "groupAssistant", entityId: id, summary: `KINBANアシスタントを${body.status === "active" ? "再開" : "停止"}しました` });
  return Response.json({ ok: true });
}
