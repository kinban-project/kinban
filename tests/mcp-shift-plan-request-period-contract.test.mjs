import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");

test("create_shift_plan describes and validates the request period fields", () => {
  assert.match(route, /requestPeriod: \{[\s\S]*required: \["opensOn", "closesOn"\]/);
  assert.match(route, /opensOn: \{ type: "string", description: "YYYY-MM-DD" \}/);
  assert.match(route, /closesOn: \{ type: "string", description: "YYYY-MM-DD" \}/);
  assert.match(route, /requestPeriod requires opensOn and closesOn/);
  assert.match(route, /requestPeriodId = period \? crypto\.randomUUID\(\) : null/);
  assert.match(route, /requestPeriod: period[\s\S]*status: "open"/);
});
