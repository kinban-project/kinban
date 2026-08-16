import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("duty capability rules are enforced by the server and MCP paths", async () => {
  const validation = await readFile(new URL("../app/duty-validation.ts", import.meta.url), "utf8");
  const shiftsApi = await readFile(new URL("../app/api/shifts/[id]/route.ts", import.meta.url), "utf8");
  const membersApi = await readFile(new URL("../app/api/groups/[id]/members/route.ts", import.meta.url), "utf8");
  const mcp = await readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
  const seed = await readFile(new URL("../scripts/seed-local.sql", import.meta.url), "utf8");
  assert.match(validation, /memberCanTakeDuty/);
  assert.match(validation, /担当可能として登録されていません/);
  assert.match(validation, /validateDutyScopeConfiguration/);
  assert.match(shiftsApi, /memberCanTakeDuty/);
  assert.match(shiftsApi, /validateDutyScopeConfiguration/);
  assert.match(membersApi, /const memberChanges =/);
  assert.match(membersApi, /Object\.keys\(memberChanges\)\.length > 0/);
  assert.match(membersApi, /if \(body\.dutyIds !== undefined\)/);
  assert.match(mcp, /担当可否に反する割当/);
  assert.match(mcp, /duty_conflict/);
  assert.match(mcp, /validateDutyScopeConfiguration/);
  assert.match(seed, /duty_scope_ids/);
  assert.match(seed, /yakiniku-assignment-0808-1900-meat-wrong/);

  const runtime = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "-e",
    `import { memberCanTakeDuty, validateDutyAssignments, validateDutyScopeConfiguration } from './app/duty-validation.ts';
const members = new Map([
  ['full', new Set(['hall', 'waiting'])],
  ['partial', new Set(['hall'])],
]);
const slot = { id: 'slot-1', dutyId: 'hall', dutyScopeIds: ['hall', 'waiting'] };
console.log(JSON.stringify({
  full: memberCanTakeDuty(slot, 'full', members),
  partial: memberCanTakeDuty(slot, 'partial', members),
  errors: validateDutyAssignments([slot], [{ slotId: 'slot-1', userEmail: 'partial' }], members).length,
  configError: validateDutyScopeConfiguration('meat', ['salad']),
}));`,
  ], { cwd: process.cwd(), encoding: "utf8" }).trim();
  const runtimeResult = JSON.parse(runtime);
  assert.deepEqual(runtimeResult, {
    full: true,
    partial: false,
    errors: 1,
    configError: "主担当は担当範囲に含めてください",
  });
});
