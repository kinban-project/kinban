import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { groupMembers, mcpConfirmations } from "../../../../../../db/schema";
import { hashApiToken } from "../../../../api-auth";

export const dynamic = "force-dynamic";

const confirmableActions = new Set([
  "assistant.reply",
  "announcement.create",
  "shift.publish",
  "shift.assign",
  "work.approve",
  "work.reject",
  "monthly.approve",
  "monthly.reject",
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id: groupId } = await context.params;
  const [membership] = await getDb().select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, user.email))).limit(1);
  if (!membership || membership.status !== "active" || (membership.role !== "owner" && membership.role !== "editor")) return Response.json({ error: "Editor permission required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { action?: string; entityId?: string; expiresInSeconds?: number };
  const action = payload.action?.trim() ?? "";
  if (!confirmableActions.has(action)) return Response.json({ error: "Unsupported confirmation action." }, { status: 400 });
  const expiresInSeconds = Math.min(Math.max(Number(payload.expiresInSeconds) || 600, 60), 1800);
  const raw = `mcp_confirm_${crypto.randomUUID().replaceAll("-", "")}`;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await getDb().insert(mcpConfirmations).values({ id: crypto.randomUUID(), tokenHash: await hashApiToken(raw), groupId, action, entityId: payload.entityId?.trim() ?? "", issuedBy: user.email, expiresAt });
  return Response.json({ confirmationToken: raw, action, entityId: payload.entityId?.trim() ?? "", expiresAt }, { status: 201 });
}
