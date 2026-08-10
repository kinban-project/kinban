import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { apiTokens, assistantContexts, groupAssistants, groupMembers } from "../../db/schema";

export type ApiTokenType = "personal" | "assistant";
export const personalApiScopes = [
  "member:profile:read",
  "member:profile:write",
  "member:group:read",
  "member:preferences:read",
  "member:preferences:write",
  "member:shift:read",
  "member:shift:write",
  "member:work:read",
  "member:work:write",
  "member:announcement:read",
  "member:announcement:write",
  "member:message:write",
  "member:assistant:read",
  "member:task:read",
  "member:task:write",
  "member:memo:read",
  "member:memo:write",
] as const;
export type ApiIdentity = {
  email: string;
  tokenId: string;
  tokenType: ApiTokenType;
  groupId: string | null;
  scopes: string[];
  delegated?: boolean;
  audience?: string;
  contextId?: string;
};

export async function hashApiToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireApiIdentity(request: Request): Promise<ApiIdentity | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return Response.json({ error: "Bearer API token is required." }, { status: 401 });
  const tokenHash = await hashApiToken(match[1].trim());
  const db = getDb();
  const [token] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);
  if (!token) {
    const [context] = await db.select().from(assistantContexts).where(and(
      eq(assistantContexts.tokenHash, tokenHash),
      gt(assistantContexts.expiresAt, new Date().toISOString()),
      isNull(assistantContexts.revokedAt),
    )).limit(1);
    if (!context) return Response.json({ error: "Invalid or expired API token." }, { status: 401 });
    if (request.headers.get("x-kinban-audience") !== context.audience)
      return Response.json({ error: "This short-lived token is restricted to its configured audience." }, { status: 401 });
    const subjectEmail = context.memberEmail ?? context.issuedBy;
    const [membership] = await db.select({ status: groupMembers.status, role: groupMembers.role }).from(groupMembers).where(and(
      eq(groupMembers.groupId, context.groupId), eq(groupMembers.userEmail, subjectEmail),
    )).limit(1);
    if (!membership || membership.status !== "active")
      return Response.json({ error: "The short-lived token subject is no longer an active group member." }, { status: 403 });
    if (context.mode === "operations" && !["owner", "editor"].includes(membership.role))
      return Response.json({ error: "The short-lived operations token subject is no longer a manager." }, { status: 403 });
    const [assistant] = await db.select({ status: groupAssistants.status }).from(groupAssistants).where(eq(groupAssistants.groupId, context.groupId)).limit(1);
    if (assistant?.status !== "active")
      return Response.json({ error: "KINBAN assistant is inactive." }, { status: 403 });
    let delegatedScopes: string[] = [];
    try {
      const parsed = JSON.parse(context.scopes || "[]");
      if (Array.isArray(parsed)) delegatedScopes = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      delegatedScopes = [];
    }
    return {
      email: subjectEmail,
      tokenId: context.id,
      tokenType: context.mode === "member" ? "personal" : "assistant",
      groupId: context.groupId,
      scopes: delegatedScopes,
      delegated: true,
      audience: context.audience,
      contextId: context.id,
    };
  }
  await db.update(apiTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiTokens.id, token.id));
  let scopes: string[] = [];
  try {
    const parsed = JSON.parse(token.scopes || "[]");
    if (Array.isArray(parsed)) scopes = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    scopes = [];
  }
  // Personal keys issued before scopes were persisted remain member-only.
  // Never interpret an empty personal scope list as unrestricted access.
  if (token.tokenType === "personal" && scopes.length === 0)
    scopes = [...personalApiScopes];
  return {
    email: token.ownerEmail,
    tokenId: token.id,
    tokenType: token.tokenType,
    groupId: token.groupId ?? null,
    scopes,
  };
}
