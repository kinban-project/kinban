import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const browserApi = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");

test("published plans cannot be reverted to draft by the browser API", () => {
  assert.match(browserApi, /plan\.status === "published" && body\.status === "draft"/);
  assert.match(browserApi, /公開済みのシフトを下書きへ戻すことはできません/);
});

test("MCP preserves published status and requires publish permission for published-plan edits", () => {
  assert.match(mcp, /targetPlan\?\.status === "published"/);
  assert.match(mcp, /args\.status === "draft"/);
  assert.match(mcp, /\(args as \{ status\?: string \}\)\.status = "published"/);
  assert.match(mcp, /plan\.status === "published" \|\| args\.status === "published"/);
});
