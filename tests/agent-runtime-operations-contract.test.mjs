import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("agent-runtime/python-backend/main.py", "utf8");
const contextRoute = fs.readFileSync("app/api/groups/[id]/assistant/context/route.ts", "utf8");
const ui = fs.readFileSync("agent-runtime/ui/index.html", "utf8");

test("operations runtime validates handoff and separates manager scope", () => {
  assert.match(runtime, /validate_handoff\(payload\.token, payload\.groupId, payload\.mode\)/);
  assert.match(runtime, /handoff_attempts/);
  assert.match(runtime, /pending_handoffs\[code\] = \(payload, time\.time\(\) \+ 120\)/);
  assert.match(contextRoute, /"shift:write"/);
  assert.match(contextRoute, /"work:write"/);
  assert.match(contextRoute, /"announcement:write"/);
});

test("operations runtime requires a separate confirmation for high-impact tools", () => {
  assert.match(runtime, /HIGH_IMPACT_TOOLS/);
  assert.match(runtime, /"confirmationRequired": True/);
  assert.match(runtime, /arguments\.get\("confirm"\) is not True/);
  assert.match(runtime, /pending\.get\("turn", 0\) >= user_turn/);
  assert.match(runtime, /session\.user_turn \+= 1/);
  assert.match(runtime, /same action.*confirm:true/);
  assert.match(runtime, /"set_shift_assignments"/);
  assert.match(runtime, /"clear_draft_assignments"/);
  assert.match(runtime, /"delete_draft_shift_plan"/);
  assert.match(runtime, /"delete_shift_assignment_scenario"/);
  assert.match(ui, /KINBAN 運営支援AI/);
  assert.match(ui, /管理者向け/);
});
