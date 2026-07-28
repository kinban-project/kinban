import { env } from "cloudflare:workers";
import seedSql from "../../../../scripts/seed-local.sql?raw";

export const dynamic = "force-dynamic";

function configured(name: string) {
  return process.env[name] ?? (env as Record<string, string | undefined>)[name];
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let start = 0;
  let quoted = false;
  const source = sql.replace(/^\s*--.*(?:\r?\n|$)/gm, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'") {
      if (quoted && source[index + 1] === "'") index += 1;
      else quoted = !quoted;
    } else if (character === ";" && !quoted) {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  const last = source.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}

export async function POST() {
  if (configured("DEMO_MODE") !== "true") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  try {
    for (const table of [
      "work_breaks", "push_deliveries", "push_subscriptions", "monthly_work_claims",
      "work_records", "mcp_confirmations", "assistant_contexts", "assistant_message_executions",
      "shift_swap_candidates", "shift_swap_requests", "assistant_announcement_drafts",
      "assistant_messages", "assistant_read_states", "group_assistants", "audit_logs",
      "announcement_replies", "announcement_reads", "group_announcements", "shift_requests",
      "shift_request_submissions", "shift_request_periods", "shift_availability", "group_preferences",
      "shift_assignments", "shift_slots", "shift_plans", "events", "group_join_requests",
      "group_members", "groups", "account_profiles", "knowledge_assets", "knowledge_pages",
      "knowledge_folders", "memos", "memo_folders",
    ]) {
      await env.DB.prepare(`DELETE FROM ${table}`).run();
    }
    const statements = splitSqlStatements(seedSql);
    for (const [index, statement] of statements.entries()) {
      try {
        await env.DB.prepare(statement).run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed statement ${index + 1}/${statements.length}: ${message}`);
      }
    }
    return Response.json({ ok: true, seeded: true, statements: statements.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
