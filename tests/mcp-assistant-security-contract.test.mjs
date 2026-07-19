import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const route = await fs.readFile("app/mcp/route.ts", "utf8");
const schema = await fs.readFile("db/schema.ts", "utf8");
const access = await fs.readFile("app/api/groups/[id]/assistant/access/route.ts", "utf8");
const confirmations = await fs.readFile("app/api/groups/[id]/assistant/confirmations/route.ts", "utf8");
const assistantRoute = await fs.readFile("app/api/groups/[id]/assistant/route.ts", "utf8");
const contextRoute = await fs.readFile("app/api/groups/[id]/assistant/contexts/route.ts", "utf8");

test("assistant MCP tokens are group scoped and allowlisted", () => {
  assert.match(schema, /tokenType: text\("token_type"/);
  assert.match(schema, /groupId: text\("group_id"\)/);
  assert.match(schema, /scopes: text\("scopes"\)/);
  assert.match(access, /tokenType: "assistant"/);
  assert.match(access, /assistantScopes/);
  assert.match(route, /assistantTools/);
  assert.match(route, /assistantGroupError/);
  assert.match(route, /assistantActiveError/);
  assert.match(route, /requiredAssistantContext/);
  assert.match(route, /boundMemberEmail/);
  assert.match(schema, /assistantContexts = sqliteTable\("assistant_contexts"/);
  assert.match(contextRoute, /mode: "operations"/);
});

test("assistant polling claims one message and binds its member context", () => {
  assert.match(route, /name: "claim_next_assistant_message"/);
  assert.match(route, /status: "processing"/);
  assert.match(route, /claimExpiresAt/);
  assert.match(route, /issueAssistantContext\(db, \{ groupId, mode: "member"/);
  assert.match(route, /boundMemberEmail && \(target\.memberEmail !== boundMemberEmail/);
  assert.doesNotMatch(assistantRoute, /contextToken: contextToken\.token/);
});

test("assistant shift reads require context and member contexts cannot see drafts or other assignments", () => {
  assert.match(route, /planContext = identity\.tokenType === "assistant" \? await requiredAssistantContext/);
  assert.match(route, /Member contexts can only read published shift plans/);
  assert.match(route, /allAssignments\.filter\(\(assignment\) => assignment\.userEmail === memberContextEmail\)/);
  assert.match(route, /boundMemberEmail \? eq\(shiftPlans\.status, "published"\)/);
});

test("assistant mutations require a one-time human confirmation token", () => {
  assert.match(schema, /mcpConfirmations = sqliteTable\("mcp_confirmations"/);
  assert.match(confirmations, /confirmationToken/);
  assert.match(route, /consumeConfirmation/);
  assert.match(route, /args\.confirmationToken/);
  assert.match(route, /isNull\(mcpConfirmations\.usedAt\)/);
  assert.match(route, /gt\(mcpConfirmations\.expiresAt/);
});
