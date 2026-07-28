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
