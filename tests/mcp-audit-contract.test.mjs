import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");

test("MCP shift mutations and audit search are wired to the audit log", () => {
  assert.match(route, /action: "shift\.create"/);
  assert.match(route, /action: status === "published" \? "shift\.publish" : "shift\.assign"/);
  assert.match(route, /name === "get_audit_logs"/);
  assert.match(route, /auditLogs\.groupId/);
  assert.match(route, /details: \{ source: "mcp"/);
});
