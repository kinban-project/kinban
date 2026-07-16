import { auditLogs } from "../db/schema";
import { getDb } from "../db";

type AuditInput = {
  groupId?: string | null;
  userEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: unknown;
};

export async function recordAudit(input: AuditInput) {
  try {
    await getDb().insert(auditLogs).values({
      id: crypto.randomUUID(),
      groupId: input.groupId ?? null,
      userEmail: input.userEmail,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? "",
      summary: input.summary.slice(0, 200),
      details: input.details === undefined ? "" : JSON.stringify(input.details).slice(0, 2000),
    });
  } catch {
    // 操作本体を失敗させないよう、監査ログの書き込み失敗は握りつぶす。
  }
}
