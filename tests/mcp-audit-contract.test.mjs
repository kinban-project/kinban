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

test("all group-scoped MCP mutations record an audit action", () => {
  for (const action of [
    "account.profile",
    "group.member",
    "group.join_request",
    "group.preferences",
    "shift.create",
    "shift.delete",
    "shift.adjust",
    "shift.request",
    "shift.assign",
    "shift.publish",
    "announcement.create",
    "announcement.reply",
    "announcement.read",
  ]) {
    assert.ok(route.includes(`"${action}"`), action);
  }
});
