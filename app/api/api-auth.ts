import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { apiTokens } from "../../db/schema";

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
  "member:group:join",
] as const;
export type ApiIdentity = {
  email: string;
  tokenId: string;
  tokenType: ApiTokenType;
  groupId: string | null;
  scopes: string[];
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
  if (!token) return Response.json({ error: "Invalid API token." }, { status: 401 });
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
