import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const route = await fs.readFile("app/mcp/route.ts", "utf8");
const schema = await fs.readFile("db/schema.ts", "utf8");
const access = await fs.readFile("app/api/groups/[id]/assistant/access/route.ts", "utf8");
const confirmations = await fs.readFile("app/api/groups/[id]/assistant/confirmations/route.ts", "utf8");

test("assistant MCP tokens are group scoped and allowlisted", () => {
  assert.match(schema, /tokenType: text\("token_type"/);
  assert.match(schema, /groupId: text\("group_id"\)/);
  assert.match(schema, /scopes: text\("scopes"\)/);
  assert.match(access, /tokenType: "assistant"/);
  assert.match(access, /assistantScopes/);
  assert.match(route, /assistantTools/);
  assert.match(route, /assistantGroupError/);
});

test("assistant mutations require a one-time human confirmation token", () => {
  assert.match(schema, /mcpConfirmations = sqliteTable\("mcp_confirmations"/);
  assert.match(confirmations, /confirmationToken/);
  assert.match(route, /consumeConfirmation/);
  assert.match(route, /args\.confirmationToken/);
  assert.match(route, /isNull\(mcpConfirmations\.usedAt\)/);
  assert.match(route, /gt\(mcpConfirmations\.expiresAt/);
});
