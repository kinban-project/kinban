import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { assistantContexts, groupAssistants, groupMembers } from "../../../../../../db/schema";
import { hashApiToken } from "../../../../../api/api-auth";

export const dynamic = "force-dynamic";

const managerScopes = [
  "assistant:read", "assistant:reply", "shift:read", "work:read",
  "announcement:read", "agent:usage:write",
];
const memberScopes = [
  "member:profile:read", "member:profile:write", "member:preferences:read",
  "member:preferences:write", "member:shift:read", "member:shift:write",
  "member:work:read", "member:work:write", "member:announcement:read",
  "member:message:write", "member:assistant:read", "member:memo:read",
  "member:memo:write",
];

function newToken() {
  return `mcp_context_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

async function activeMember(groupId: string, email: string) {
  const [row] = await getDb().select().from(groupMembers).where(and(
    eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email),
  )).limit(1);
  return row?.status === "active" ? row : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id: groupId } = await context.params;
  const member = await activeMember(groupId, user.email);
  if (!member) return Response.json({ error: "Active group membership is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { mode?: "member" | "operations"; expiresInSeconds?: number };
  const mode = body.mode ?? "operations";
  if (mode === "operations" && !["owner", "editor"].includes(member.role))
    return Response.json({ error: "Manager membership is required for operations tokens." }, { status: 403 });
  const [assistant] = await getDb().select({ status: groupAssistants.status }).from(groupAssistants).where(eq(groupAssistants.groupId, groupId)).limit(1);
  if (assistant?.status !== "active") return Response.json({ error: "KINBAN assistant is inactive." }, { status: 403 });
  const expiresInSeconds = Math.min(Math.max(Number(body.expiresInSeconds) || 600, 300), 900);
  const token = newToken();
  const contextId = crypto.randomUUID();
  const scopes = mode === "operations" ? managerScopes : memberScopes;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await getDb().insert(assistantContexts).values({
    id: contextId, tokenHash: await hashApiToken(token), groupId, mode,
    memberEmail: user.email, issuedBy: user.email, audience: "agent-runtime",
    scopes: JSON.stringify(scopes), expiresAt,
  });
  return Response.json({ token, tokenType: "short-lived", contextId, groupId, mode, audience: "agent-runtime", expiresAt, expiresInSeconds, scopes }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id: groupId } = await context.params;
  const member = await activeMember(groupId, user.email);
  if (!member || !["owner", "editor"].includes(member.role))
    return Response.json({ error: "Manager membership is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { contextId?: string };
  if (!body.contextId) return Response.json({ error: "contextId is required." }, { status: 400 });
  await getDb().update(assistantContexts).set({ revokedAt: new Date().toISOString() }).where(and(
    eq(assistantContexts.id, body.contextId), eq(assistantContexts.groupId, groupId),
  ));
  return Response.json({ ok: true });
}
