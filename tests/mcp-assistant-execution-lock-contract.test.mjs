import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const migration = fs.readFileSync("drizzle/0028_add_assistant_execution_locks.sql", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");

test("assistant claims use a lease identifier and current lease checks", () => {
  assert.match(schema, /claimId: text\("claim_id"\)/);
  assert.match(mcp, /const claimId = crypto\.randomUUID\(\)/);
  assert.match(mcp, /eq\(assistantMessages\.claimId, activeClaimId\)/);
  assert.match(mcp, /gt\(assistantMessages\.claimExpiresAt, now\)/);
});

test("manager operations reserve one execution per message, operation, and target", () => {
  assert.match(schema, /assistantMessageExecutions/);
  assert.match(migration, /assistant_message_execution_unique_idx/);
  assert.match(mcp, /assistantExecutionTarget/);
  assert.match(mcp, /onConflictDoNothing\(\)/);
  assert.match(mcp, /sourceMessageId: messageId, operation: name, target/);
});

test("message state operations require the current claim rather than a stale message id", () => {
  assert.match(mcp, /A current claimId is required for this message operation\./);
  assert.match(mcp, /\["reply_assistant_message", "release_assistant_message", "defer_assistant_message", "complete_assistant_message"\]/);
});
