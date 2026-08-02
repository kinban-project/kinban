import { env } from "cloudflare:workers";
import seedSql from "../../../../scripts/seed-local.sql?raw";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { isDemoModeServer } from "../../../demo-mode";
import { recordAudit } from "../../../audit-log";
import { requireSiteAdmin } from "../../../site-access";

export const dynamic = "force-dynamic";

const RESET_CONFIRMATION = "デモデータを初期化";

export async function POST(request: Request) {
  if (!isDemoModeServer()) return Response.json({ error: "デモ環境でのみ利用できます" }, { status: 404 });
  const user = await getChatGPTUser();
  if (!user || !(await requireSiteAdmin(user.email))) return Response.json({ error: "サイト管理者のみ利用できます" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { confirmation?: string };
  if (body.confirmation !== RESET_CONFIRMATION) return Response.json({ error: `確認欄には「${RESET_CONFIRMATION}」と入力してください` }, { status: 400 });
  const database = (env as { DB?: D1Database }).DB;
  if (!database) return Response.json({ error: "デモ用データベースに接続できません" }, { status: 503 });
  try {
    await database.exec(seedSql);
    await recordAudit({ userEmail: user.email, action: "site.demo.reset", entityType: "demoDatabase", entityId: "public-demo", summary: "公開デモデータを初期シードへ戻しました", details: { confirmationRequired: true } });
    return Response.json({ ok: true, resetAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: "デモデータの初期化に失敗しました", detail: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
