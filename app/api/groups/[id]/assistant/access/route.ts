import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { apiTokens, groupAssistants, groupMembers, groups } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../audit-log";
import { hashApiToken } from "../../../../api-auth";
import { buildZip } from "../../../../../zip";

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

function newToken() {
  return `mcp_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
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
  const payload = await request.json().catch(() => ({})) as { name?: string; action?: string };
  const raw = newToken();
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
  const db = getDb();
  await db.insert(apiTokens).values(row);
  if (payload.action === "downloadPack") {
    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);
    const [assistant] = await db
      .select({
        canCreateShifts: groupAssistants.canCreateShifts,
        canPublishShifts: groupAssistants.canPublishShifts,
        canReviewDailyWork: groupAssistants.canReviewDailyWork,
        canReviewMonthlyWork: groupAssistants.canReviewMonthlyWork,
        canCreateAnnouncements: groupAssistants.canCreateAnnouncements,
      })
      .from(groupAssistants)
      .where(eq(groupAssistants.groupId, groupId))
      .limit(1);
    const mcpUrl = new URL("/api/mcp", request.url).toString();
    const operations = [
      ["シフト作成（割当下書きを含む）", assistant?.canCreateShifts ?? true],
      ["シフト公開", assistant?.canPublishShifts ?? true],
      ["勤怠承認／差戻し（日次）", assistant?.canReviewDailyWork ?? true],
      ["勤怠承認／差戻し（月次）", assistant?.canReviewMonthlyWork ?? false],
      ["お知らせ配信", assistant?.canCreateAnnouncements ?? true],
    ] as const;
    const permissions = [
      "## MCP key scopes",
      ...assistantScopes,
      "",
      "## Group operation permissions",
      ...operations.map(([label, enabled]) => `${label}: ${enabled ? "有効" : "無効"}`),
    ].join("\n");
    const files = {
      "README.md": `# KINBAN Operations Assistant Connection Pack\n\nThis pack is for group ${groupId} (${group?.name ?? groupId}). It contains a group-bound MCP key.\n\nMCP URL: ${mcpUrl}\nGroup ID: ${groupId}\nAPI key: see connection.env\n\nSetup:\n1. Register the values in connection.env in your MCP client.\n2. Load skills/operations/SKILL.md into the operations agent.\n3. Verify tools/list and list_groups before any write operation.\n4. Confirm the target, scope, and result before changing saved data.\n\nTreat connection.env as a secret. Do not commit or share it publicly. Revoke this key from KINBAN when it is no longer needed. Revocation also disables this downloaded pack.\n`,
      "connection.env": `KINBAN_MCP_URL=${mcpUrl}\nKINBAN_GROUP_ID=${groupId}\nKINBAN_API_KEY=${raw}\n`,
      "permissions.txt": `${permissions}\n`,
      "skills/operations/SKILL.md": `# KINBAN Operations Assistant\n\n## Rules\n- Use group ${groupId} only. Never switch to another group ID.\n- Read the current state before writing.\n- Confirm target, dates, members, and changes before writing.\n- Report warnings and the result after shift or attendance operations.\n- Send all text as UTF-8.\n\n## Granted scopes\n${permissions}\n`,
    };
    const archive = buildZip(files);
    await recordAudit({ groupId, userEmail: user.email, action: "assistant.connection_pack.download", entityType: "apiToken", entityId: row.id, summary: "運営支援AI接続パックをダウンロードしました", details: { tokenPrefix: row.tokenPrefix, fileCount: Object.keys(files).length } });
    return new Response(archive, { status: 201, headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="kinban-operations-assistant.zip"', "Cache-Control": "no-store" } });
  }
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
