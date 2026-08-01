import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/mcp/route.ts", import.meta.url), "utf8");

test("MCP planning tools expose the unsaved-candidate and scenario workflow", () => {
  for (const name of [
    "get_shift_planning_context",
    "validate_shift_assignment_candidate",
    "list_shift_assignment_scenarios",
    "create_shift_assignment_scenario",
    "update_shift_assignment_scenario",
    "delete_shift_assignment_scenario",
    "compare_shift_assignment_scenario",
    "apply_shift_assignment_scenario",
    "clear_draft_assignments",
  ]) {
    assert.match(source, new RegExp(`name: \\"${name}\\"`), `${name} must be declared as an MCP tool`);
    assert.match(source, new RegExp(`name === \\"${name}\\"|includes\\(name\\)`), `${name} must have a server-side handler`);
  }
});

test("MCP custom slot creation is bounded, chunked, and returns validation errors", () => {
  assert.match(source, /maxItems: 5000/);
  assert.match(source, /rows\.length > 5000/);
  assert.match(source, /parseMcpCustomSlots\(args\.customSlots/);
  assert.match(source, /catch \(error\) \{ return rpcError\(payload\.id/);
  assert.match(source, /chunk\(rows, 8\)/);
  assert.match(source, /chunk\(slotIds, 50\)/);
});

test("assignment scenario application and clearing require draft/version/confirmation guards", () => {
  assert.match(source, /found\.plan\.status !== "draft"/);
  assert.match(source, /expectedVersion !== found\.plan\.version/);
  assert.match(source, /args\.confirm !== true/);
  assert.match(source, /reason is required/);
});
