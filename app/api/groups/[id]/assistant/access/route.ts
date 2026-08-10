import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { apiTokens, groupAssistants, groupMembers, groups } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../audit-log";
import { hashApiToken } from "../../../../api-auth";
import { buildZip } from "../../../../../zip";
import { assistantBusinessSet, buildAssistantBusinessSetFiles } from "../../../../../assistant-business-set";

export const dynamic = "force-dynamic";

const assistantScopes = ["assistant:read", "assistant:reply", "shift:read", "work:read", "announcement:read", "agent:usage:write"];

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
  return Response.json({
    keys: rows,
    scopes: assistantScopes,
    businessSet: { packageVersion: assistantBusinessSet.packageVersion, releasedAt: assistantBusinessSet.releasedAt, summary: assistantBusinessSet.summary },
  });
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
    name: payload.name?.trim() || "KINBAN運営支援APIキー",
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
    const [assistant] = await db.select({
      canCreateShifts: groupAssistants.canCreateShifts,
      canPublishShifts: groupAssistants.canPublishShifts,
      canReviewDailyWork: groupAssistants.canReviewDailyWork,
      canReviewMonthlyWork: groupAssistants.canReviewMonthlyWork,
      canCreateAnnouncements: groupAssistants.canCreateAnnouncements,
    }).from(groupAssistants).where(eq(groupAssistants.groupId, groupId)).limit(1);
    const mcpUrl = new URL("/api/mcp", request.url).toString();
    const operations = [
      ["シフト作成（割当下書きを含む）", assistant?.canCreateShifts ?? true],
      ["シフト公開", assistant?.canPublishShifts ?? true],
      ["勤怠承認・差戻し（日次）", assistant?.canReviewDailyWork ?? true],
      ["勤怠承認・差戻し（月次）", assistant?.canReviewMonthlyWork ?? false],
      ["お知らせ配信", assistant?.canCreateAnnouncements ?? true],
    ] as const;
    const permissions = [
      "## MCP key scopes",
      ...assistantScopes,
      "",
      "## Group operation permissions",
      ...operations.map(([label, enabled]) => `${label}: ${enabled ? "有効" : "無効"}`),
    ].join("\n");
    const files = buildAssistantBusinessSetFiles();
    // 全部入りパックのREADMEは接続パック専用の説明にする。生成元READMEを連結すると、
    // 旧「秘密情報を含まない」説明とconnection.envを含む内容が矛盾するため。
    files["README.md"] = `# KINBAN運営支援AI 接続パック\n\nこのZIPは、${group?.name ?? groupId}（${groupId}）専用の接続情報と業務関連資料をまとめた全部入りパックです。\n\n## 接続情報\n\n- MCP URL: ${mcpUrl}\n- グループID: ${groupId}\n- APIキー: connection.envを参照\n- パッケージ版: ${assistantBusinessSet.packageVersion}\n\n## 初期設定\n\n1. このZIPを1つの作業フォルダへ展開します。\n2. ローカルCodexでは、このフォルダをプロジェクトとして開きます。\n3. CodexのクラウドProjectやChatGPT Workでは、展開済みの内容をProjectへ渡します。\n4. AGENTS.mdを読んでから、tools/listとlist_groupsで対象グループへの接続を確認します。\n5. 変更前に対象、期間、権限、警告を確認します。\n\nこのZIPにはconnection.env、権限一覧、AGENTS.md、Skill、runbook、jobs、安全資料が含まれます。connection.envとAPIキーは秘密情報です。Git、チャット、レポートへ保存・共有しないでください。キーを使わなくなったらグループ管理から無効化してください。\n`;
    files["connection.env"] = `KINBAN_MCP_URL=${mcpUrl}\nKINBAN_GROUP_ID=${groupId}\nKINBAN_API_KEY=${raw}\n`;
    files["permissions.txt"] = `${permissions}\n`;
    files["manifest.json"] = JSON.stringify({
      packageVersion: assistantBusinessSet.packageVersion,
      releasedAt: assistantBusinessSet.releasedAt,
      summary: "KINBAN運営支援AIの接続情報・運用方針・Skill・runbookをまとめた全部入りパックです。",
      minimumKinbanVersion: assistantBusinessSet.minimumKinbanVersion,
      source: assistantBusinessSet.source,
      sourceFingerprint: assistantBusinessSet.sourceFingerprint,
      files: Object.keys(files),
    }, null, 2) + "\n";
    const archive = buildZip(files);
    await recordAudit({ groupId, userEmail: user.email, action: "assistant.connection_pack.download", entityType: "apiToken", entityId: row.id, summary: "運営支援AI全部入り接続パックをダウンロードしました", details: { tokenPrefix: row.tokenPrefix, packageVersion: assistantBusinessSet.packageVersion, fileCount: Object.keys(files).length } });
    return new Response(archive, { status: 201, headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="kinban-operations-assistant-${assistantBusinessSet.packageVersion}.zip"`, "Cache-Control": "no-store" } });
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
