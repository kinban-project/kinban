import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { apiTokens, groupMembers } from "../../../db/schema";
import { hashApiToken, personalApiScopes } from "../api-auth";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
}

async function hasActiveMembership(groupId: string, email: string) {
  if (!groupId) return false;
  const [member] = await getDb()
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userEmail, email),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(member);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const groupId = new URL(request.url).searchParams.get("groupId") ?? "";
  if (!(await hasActiveMembership(groupId, user.email)))
    return Response.json({ error: "Active group membership required." }, { status: 403 });
  const rows = await getDb()
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenType: apiTokens.tokenType,
      groupId: apiTokens.groupId,
      tokenPrefix: apiTokens.tokenPrefix,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.ownerEmail, user.email),
        eq(apiTokens.tokenType, "personal"),
        eq(apiTokens.groupId, groupId),
      ),
    );
  return Response.json({ keys: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = (await request.json().catch(() => ({}))) as {
    name?: string;
    groupId?: string;
  };
  const groupId = payload.groupId?.trim() ?? "";
  if (!(await hasActiveMembership(groupId, user.email)))
    return Response.json({ error: "Active group membership required." }, { status: 403 });
  const raw = `md_${crypto.randomUUID().replaceAll("-", "")}${crypto
    .randomUUID()
    .replaceAll("-", "")}`;
  const token = {
    id: crypto.randomUUID(),
    ownerEmail: user.email,
    name: payload.name?.trim() || "KINBAN個人用AIキー",
    tokenType: "personal" as const,
    groupId,
    scopes: JSON.stringify(personalApiScopes),
    tokenHash: await hashApiToken(raw),
    tokenPrefix: raw.slice(0, 11),
  };
  await getDb().insert(apiTokens).values(token);
  return Response.json(
    { key: raw, id: token.id, name: token.name, tokenPrefix: token.tokenPrefix },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const payload = (await request.json()) as { id?: string; groupId?: string };
  if (!payload.id) return Response.json({ error: "id is required" }, { status: 400 });
  const groupId = payload.groupId?.trim() ?? "";
  if (!(await hasActiveMembership(groupId, user.email)))
    return Response.json({ error: "Active group membership required." }, { status: 403 });
  await getDb()
    .delete(apiTokens)
    .where(
      and(
        eq(apiTokens.id, payload.id),
        eq(apiTokens.ownerEmail, user.email),
        eq(apiTokens.tokenType, "personal"),
        eq(apiTokens.groupId, groupId),
      ),
    );
  return Response.json({ ok: true });
}
