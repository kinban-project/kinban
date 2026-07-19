import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { groupMembers } from "../../../../../../db/schema";
import { issueAssistantContext } from "../../../../../assistant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "ChatGPT sign-in is required." }, { status: 401 });
  const { id: groupId } = await context.params;
  const [membership] = await getDb().select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userEmail, user.email))).limit(1);
  if (!membership || membership.status !== "active" || !["owner", "editor"].includes(membership.role)) return Response.json({ error: "Editor permission required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { expiresInSeconds?: number };
  const issued = await issueAssistantContext(getDb(), { groupId, mode: "operations", issuedBy: user.email, expiresInSeconds: payload.expiresInSeconds });
  return Response.json({ contextToken: issued.token, mode: "operations", expiresAt: issued.expiresAt }, { status: 201 });
}
