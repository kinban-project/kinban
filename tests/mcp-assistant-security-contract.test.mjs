import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const route = await fs.readFile("app/mcp/route.ts", "utf8");
const schema = await fs.readFile("db/schema.ts", "utf8");
const assistantRoute = await fs.readFile("app/api/groups/[id]/assistant/route.ts", "utf8");

test("assistant MCP tokens are group scoped and allowlisted", () => {
  assert.match(schema, /tokenType: text\("token_type"/);
  assert.match(schema, /groupId: text\("group_id"\)/);
  assert.match(schema, /scopes: text\("scopes"\)/);
  assert.match(route, /assistantTools/);
  assert.match(route, /assistantGroupError/);
  assert.match(route, /assistantActiveError/);
});

test("assistant processing uses an active claim instead of a short-lived confirmation token", () => {
  assert.match(route, /name: "claim_next_assistant_message"/);
  assert.match(route, /claimId = crypto\.randomUUID\(\)/);
  assert.match(route, /eq\(assistantMessages\.claimId, text\(args\.claimId\)\)/);
  assert.match(route, /sourceMessageId and claimId from the currently claimed manager instruction/);
  assert.doesNotMatch(route, /confirmationToken/);
  assert.doesNotMatch(assistantRoute, /confirmationToken/);
});

test("assistant management operations require a claimed manager message", () => {
  assert.match(route, /sourceMessageId from an active manager is required/);
  assert.match(route, /claimId from the current message claim is required/);
  assert.match(route, /eq\(assistantMessages\.status, "processing"\)/);
  assert.match(route, /gt\(assistantMessages\.claimExpiresAt, now\)/);
  assert.match(route, /assistantMessageExecutions/);
});
