import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const browserApi = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");

test("MCP publication synchronizes shift assignments, plan status, and calendar events", () => {
  assert.match(mcp, /db\.update\(shiftPlans\)\.set\(\{ status \}/);
  assert.match(mcp, /db\.delete\(events\)\.where\(eq\(events\.shiftPlanId/);
  assert.match(mcp, /db\.insert\(events\)/);
  assert.match(mcp, /shiftDateTime/);
  assert.match(mcp, /calendarEvents/);
  assert.match(browserApi, /db\.delete\(events\)\.where\(eq\(events\.shiftPlanId/);
});
