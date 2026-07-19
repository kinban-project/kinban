import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { apiTokens, groupMembers } from "../../../../../../db/schema";
import { hashApiToken } from "../../../../api-auth";

export const dynamic = "force-dynamic";

const assistantScopes = [
  "assistant:read",
  "assistant:reply",
  "shift:read",
  "work:read",
  "announcement:read",
];

function unauthorized() {
  return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
}

async function manager(groupId: string, email: string) {
  const [membership] = await getDb().select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, email))).limit(1);
  return membership && membership.status === "active" && (membership.role === "owner" || membership.role === "editor") ? membership : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id: groupId } = await context.params;
  if (!await manager(groupId, user.email)) return Response.json({ error: "Editor permission required." }, { status: 403 });
  const rows = await getDb().select({ id: apiTokens.id, name: apiTokens.name, tokenPrefix: apiTokens.tokenPrefix, scopes: apiTokens.scopes, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt }).from(apiTokens).where(and(eq(apiTokens.groupId, groupId), eq(apiTokens.tokenType, "assistant")));
  return Response.json({ keys: rows, scopes: assistantScopes });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id: groupId } = await context.params;
  if (!await manager(groupId, user.email)) return Response.json({ error: "Editor permission required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { name?: string };
  const raw = `mcp_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const row = {
    id: crypto.randomUUID(),
    ownerEmail: user.email,
    name: payload.name?.trim() || "KINBAN運営支援AIキー",
    tokenType: "assistant" as const,
    groupId,
    scopes: JSON.stringify(assistantScopes),
    tokenHash: await hashApiToken(raw),
    tokenPrefix: raw.slice(0, 11),
  };
  await getDb().insert(apiTokens).values(row);
  return Response.json({ key: raw, id: row.id, name: row.name, tokenPrefix: row.tokenPrefix, scopes: assistantScopes }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const { id: groupId } = await context.params;
  if (!await manager(groupId, user.email)) return Response.json({ error: "Editor permission required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { id?: string };
  if (!payload.id) return Response.json({ error: "id is required" }, { status: 400 });
  await getDb().delete(apiTokens).where(and(eq(apiTokens.id, payload.id), eq(apiTokens.groupId, groupId), eq(apiTokens.tokenType, "assistant")));
  return Response.json({ ok: true });
}
