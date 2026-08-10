import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { apiTokens, groupMembers, groups } from "../../../db/schema";
import { hashApiToken, personalApiScopes } from "../api-auth";
import { recordAudit } from "../../audit-log";
import { buildZip } from "../../zip";

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
    action?: string;
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
    name: payload.name?.trim() || "KINBAN個人用APIキー",
    tokenType: "personal" as const,
    groupId,
    scopes: JSON.stringify(personalApiScopes),
    tokenHash: await hashApiToken(raw),
    tokenPrefix: raw.slice(0, 11),
  };
  await getDb().insert(apiTokens).values(token);
  if (payload.action === "downloadPack") {
    const [group] = await getDb()
      .select({ name: groups.name })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    const mcpUrl = new URL("/api/mcp", request.url).toString();
    const permissions = personalApiScopes.join("\n");
    const files = {
      "README.md": `# KINBAN Personal Assistant Connection Pack\n\nThis pack is for your personal member assistant in group ${groupId} (${group?.name ?? groupId}).\n\nMCP URL: ${mcpUrl}\nGroup ID: ${groupId}\nAPI key: see connection.env\n\nUse this key only for your own profile, preferences, published shifts, shift request periods and requests, work declarations, announcements, and messages in this group. It cannot perform manager operations.\n\nFor shift requests, call list_my_shift_request_periods first. It lists the request windows available to you, including periods that are open before the related shift is published. Pass the returned periodId to get_shift_requests or save_shift_requests. Do not assume the first period returned by the database is current.\n\nBefore interpreting today, tomorrow, deadlines, or month-end, call get_demo_time and use its returned date context.\n\nTreat connection.env as a secret. Revoke the key from the group settings when it is no longer needed.\n`,
      "connection.env": `KINBAN_MCP_URL=${mcpUrl}\nKINBAN_GROUP_ID=${groupId}\nKINBAN_API_KEY=${raw}\n`,
      "permissions.txt": `${permissions}\n`,
      "skills/personal/SKILL.md": `# KINBAN Personal Assistant\n\n- Use only group ${groupId}.\n- Call get_demo_time before interpreting relative dates.\n- The key is limited to the authenticated member's own data.\n- You can read your own assistant conversation, tasks, and work memos.\n- Group invitations and join requests are handled from the KINBAN screen because this key is fixed to one existing group.\n- To submit shift requests, call list_my_shift_request_periods first and choose a period whose isAcceptingNow is true. Pass its periodId explicitly to get_shift_requests and save_shift_requests. This is required when multiple request periods exist or the related shift plan is still a draft.\n- If get_shift_requests is called without periodId and there is not exactly one accepting period, use the returned candidate periods and retry with the intended periodId. Never select an arbitrary old or closed period.\n- You can create or update your own work declaration, but must use confirm:true for saved changes.\n- Never attempt manager operations such as shift assignment, publishing, or attendance approval.\n- For a submitted or approved daily declaration, call reopen_work_record, then save_work_record, then submit_my_work_record with confirm:true.\n- Use submit_my_work_record for the final member submission. It has no status field: it always submits the authenticated member's own record. Never use it for approval or rejection.\n- Confirm before changing saved preferences, shift requests, declarations, tasks, memos, or messages.\n- Send all text as UTF-8.\n\n## Shift request periods\n\n\`list_my_shift_request_periods\` returns only periods for groups where you are an active member. Each period includes its periodId, request window, demo-time availability, your saved submission state, and minimum slot information needed to submit requests. It does not return assignments or other members' requests.\n\n## Granted scopes\n${permissions}\n`,
    };
    const archive = buildZip(files);
    await recordAudit({ groupId, userEmail: user.email, action: "personal_ai.connection_pack.download", entityType: "apiToken", entityId: token.id, summary: "個人用AI接続パックをダウンロードしました", details: { tokenPrefix: token.tokenPrefix, fileCount: Object.keys(files).length } });
    return new Response(archive, { status: 201, headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="kinban-personal-assistant.zip"', "Cache-Control": "no-store" } });
  }
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
