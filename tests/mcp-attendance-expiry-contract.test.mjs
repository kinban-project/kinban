import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools = fs.readFileSync("app/mcp/work-tools.ts", "utf8");
const shared = fs.readFileSync("app/attendance-expired.ts", "utf8");
const api = fs.readFileSync("app/api/groups/[id]/work-records/route.ts", "utf8");

test("MCP and Browser API share the 06:00 JST attendance expiry rule", () => {
  assert.match(tools, /from "\.\.\/attendance-expired"/);
  assert.match(tools, /attendanceExpired\(record\.startedAt\)/);
  assert.match(tools, /set\(\{ activeKey: null, updatedAt: now \}\)/);
  assert.match(tools, /includes\("unique"\)/);
  assert.match(shared, /T06:00:00\+09:00/);
  assert.match(api, /from "\.\.\/\.\.\/\.\.\/\.\.\/attendance-expired"/);
});
