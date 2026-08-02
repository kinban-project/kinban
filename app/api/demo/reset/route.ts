import { env } from "cloudflare:workers";
import seedSql from "../../../../scripts/seed-local.sql?raw";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { isDemoModeServer } from "../../../demo-mode";
import { recordAudit } from "../../../audit-log";
import { requireSiteAdmin } from "../../../site-access";

export const dynamic = "force-dynamic";

const RESET_CONFIRMATION = "デモデータを初期化";

/**
 * D1's exec implementation is not consistent across local and hosted
 * runtimes when a raw file contains leading comments or many statements.
 * Split the seed file without treating semicolons inside string literals as
 * statement boundaries.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (current === quote) {
        if (next === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (current === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "'" || current === '"') {
      quote = current;
      continue;
    }
    if (current === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  const finalStatement = sql.slice(start).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

export async function POST(request: Request) {
  if (!isDemoModeServer()) return Response.json({ error: "デモ環境でのみ利用できます" }, { status: 404 });
  const user = await getChatGPTUser();
  if (!user || !(await requireSiteAdmin(user.email))) return Response.json({ error: "サイト管理者のみ利用できます" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { confirmation?: string };
  if (body.confirmation !== RESET_CONFIRMATION) return Response.json({ error: `確認欄には「${RESET_CONFIRMATION}」と入力してください` }, { status: 400 });
  const database = (env as { DB?: D1Database }).DB;
  if (!database) return Response.json({ error: "デモ用データベースに接続できません" }, { status: 503 });
  try {
    const statements = splitSqlStatements(seedSql);
    for (const statement of statements) {
      await database.prepare(statement).run();
    }
    await recordAudit({ userEmail: user.email, action: "site.demo.reset", entityType: "demoDatabase", entityId: "public-demo", summary: "公開デモデータを初期シードへ戻しました", details: { confirmationRequired: true } });
    return Response.json({ ok: true, resetAt: new Date().toISOString(), statements: statements.length });
  } catch (error) {
    return Response.json({ error: "デモデータの初期化に失敗しました", detail: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
