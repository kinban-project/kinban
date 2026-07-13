import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { apiTokens } from "../../db/schema";

export type ApiIdentity = { email: string; tokenId: string };

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
  return { email: token.ownerEmail, tokenId: token.id };
}
