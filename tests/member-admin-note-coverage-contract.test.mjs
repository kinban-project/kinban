import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const groups = fs.readFileSync("app/api/groups/route.ts", "utf8");
const announcements = fs.readFileSync("app/api/groups/[id]/announcements/route.ts", "utf8");
const monthly = fs.readFileSync("app/api/groups/[id]/monthly-work/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");

test("all member-facing member DTO responses use the admin-note filtering contract", () => {
  assert.match(groups, /toPublicMember\(membership, false\)/);
  assert.match(announcements, /members\.map\(\(member\) => toPublicMember\(member, canViewAdminNote\(membership\.role\)\)\)/);
  assert.match(monthly, /visibleMembers\.map\(\(member\) => toPublicMember\(member, manager\)\)/);
  assert.match(mcp, /toPublicMember\(m, canViewAdminNote\(self\.role\)\)/);
});
