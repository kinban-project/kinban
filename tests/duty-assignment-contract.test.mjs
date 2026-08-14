import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("duty capability rules are enforced by the server and MCP paths", async () => {
  const validation = await readFile(new URL("../app/duty-validation.ts", import.meta.url), "utf8");
  const shiftsApi = await readFile(new URL("../app/api/shifts/[id]/route.ts", import.meta.url), "utf8");
  const membersApi = await readFile(new URL("../app/api/groups/[id]/members/route.ts", import.meta.url), "utf8");
  const mcp = await readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
  const seed = await readFile(new URL("../scripts/seed-local.sql", import.meta.url), "utf8");
  assert.match(validation, /memberCanTakeDuty/);
  assert.match(validation, /担当可能として登録されていません/);
  assert.match(shiftsApi, /memberCanTakeDuty/);
  assert.match(membersApi, /const memberChanges =/);
  assert.match(membersApi, /Object\.keys\(memberChanges\)\.length > 0/);
  assert.match(membersApi, /if \(body\.dutyIds !== undefined\)/);
  assert.match(mcp, /担当可否に反する割当/);
  assert.match(mcp, /duty_conflict/);
  assert.match(seed, /duty_id = 'duty-yakiniku-hall'/);
  assert.match(seed, /duty_name_snapshot = 'ホール接客'/);
  assert.match(seed, /yakiniku-slot-2026-08-08-lunch-kitchen/);
});
