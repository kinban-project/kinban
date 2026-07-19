import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");

test("MCP shift plan creation accepts the same slot lengths as the browser", () => {
  assert.match(mcp, /slotMinutes: \{ type: "number", enum: \[30, 60, 120\] \}/);
  assert.match(mcp, /!\[30, 60, 120\]\.includes\(slotMinutes\)/);
  assert.doesNotMatch(mcp, /!\[15, 30, 60, 120\]\.includes\(slotMinutes\)/);
});
