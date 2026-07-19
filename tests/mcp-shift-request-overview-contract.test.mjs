import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");

test("assistant shift request overview is operation-context-only and returns member comments", () => {
  assert.match(route, /name: "get_shift_request_overview"/);
  assert.match(route, /assistantTools = new Set\([^\n]*"get_shift_request_overview"/);
  assert.match(route, /assistantContextTools = new Set\([^\n]*"get_shift_request_overview"/);
  assert.match(route, /identity\.tokenType !== "assistant"/);
  assert.match(route, /assistantContext\.mode !== "operations"/);
  assert.match(route, /Active editor membership required/);
  assert.match(route, /from\(shiftRequestSubmissions\)\.where\(eq\(shiftRequestSubmissions\.periodId, period\.id\)\)/);
  assert.match(route, /from\(groupPreferences\)/);
  assert.match(route, /from\(shiftAvailability\)/);
  assert.match(route, /submission: submissions\.find/);
  assert.match(route, /requests: requests\.filter/);
});
