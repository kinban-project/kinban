import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { apiTokens } from "../../../db/schema";
import { hashApiToken } from "../api-auth";

export const dynamic = "force-dynamic";
function unauthorized() { return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 }); }

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const rows = await getDb().select({ id: apiTokens.id, name: apiTokens.name, tokenPrefix: apiTokens.tokenPrefix, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt }).from(apiTokens).where(eq(apiTokens.ownerEmail, user.email));
  return Response.json({ keys: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = await request.json().catch(() => ({})) as { name?: string };
  const raw = `md_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const token = { id: crypto.randomUUID(), ownerEmail: user.email, name: payload.name?.trim() || "KINBAN API key", tokenHash: await hashApiToken(raw), tokenPrefix: raw.slice(0, 11) };
  await getDb().insert(apiTokens).values(token);
  return Response.json({ key: raw, id: token.id, name: token.name, tokenPrefix: token.tokenPrefix }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = await request.json() as { id?: string };
  if (!payload.id) return Response.json({ error: "id is required" }, { status: 400 });
  await getDb().delete(apiTokens).where(and(eq(apiTokens.id, payload.id), eq(apiTokens.ownerEmail, user.email)));
  return Response.json({ ok: true });
}
