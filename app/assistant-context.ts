import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { assistantContexts } from "../db/schema";
import { hashApiToken } from "./api/api-auth";

type Db = ReturnType<typeof getDb>;

export type AssistantContext = typeof assistantContexts.$inferSelect;

export async function issueAssistantContext(
  db: Db,
  input: {
    groupId: string;
    mode: "member" | "operations";
    memberEmail?: string;
    messageId?: string;
    issuedBy: string;
    audience?: string;
    scopes?: string[];
    expiresInSeconds?: number;
  },
) {
  const raw = `mcp_context_${crypto.randomUUID().replaceAll("-", "")}`;
  const expiresInSeconds = Math.min(Math.max(Number(input.expiresInSeconds) || 60, 60), 1800);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await db.insert(assistantContexts).values({
    id: crypto.randomUUID(),
    tokenHash: await hashApiToken(raw),
    groupId: input.groupId,
    mode: input.mode,
    memberEmail: input.memberEmail ?? null,
    messageId: input.messageId ?? null,
    issuedBy: input.issuedBy,
    audience: input.audience ?? "agent-runtime",
    scopes: JSON.stringify(input.scopes ?? []),
    expiresAt,
  });
  return { token: raw, expiresAt };
}

export async function resolveAssistantContext(db: Db, groupId: string, rawToken: unknown) {
  if (typeof rawToken !== "string" || !rawToken.trim()) return null;
  const now = new Date().toISOString();
  const [context] = await db.select().from(assistantContexts).where(and(eq(assistantContexts.tokenHash, await hashApiToken(rawToken.trim())), eq(assistantContexts.groupId, groupId), gt(assistantContexts.expiresAt, now))).limit(1);
  return context ?? null;
}

export async function resolveAssistantContextByToken(db: Db, rawToken: unknown) {
  if (typeof rawToken !== "string" || !rawToken.trim()) return null;
  const [context] = await db.select().from(assistantContexts).where(and(
    eq(assistantContexts.tokenHash, await hashApiToken(rawToken.trim())),
    gt(assistantContexts.expiresAt, new Date().toISOString()),
  )).limit(1);
  return context ?? null;
}
