import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const helper = fs.readFileSync("app/api/groups/member-dto.ts", "utf8");
const routeSources = [
  "app/api/groups/[id]/route.ts",
  "app/api/shifts/[id]/route.ts",
  "app/api/calendar/route.ts",
  "app/mcp/route.ts",
].map((path) => [path, fs.readFileSync(path, "utf8")]);

test("shared member DTO strips adminNote for non-admin responses", () => {
  assert.match(helper, /function canViewAdminNote/);
  assert.match(helper, /function toPublicMember/);
  assert.match(helper, /const \{ adminNote, \.\.\.publicMember \}/);
  assert.match(helper, /includeAdminNote \? \{ \.\.\.publicMember, adminNote/);
});

test("member, shift, calendar, and MCP surfaces use the shared DTO", () => {
  for (const [path, source] of routeSources) assert.match(source, /toPublicMember/, `${path} must sanitize member records`);
});
