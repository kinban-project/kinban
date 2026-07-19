import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const migration = fs.readFileSync(
  "drizzle/0028_add_assistant_execution_locks.sql",
  "utf8",
);
const retryMigration = fs.readFileSync(
  "drizzle/0032_make_assistant_execution_retriable.sql",
  "utf8",
);
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
  assert.match(mcp, /messageId,\s+operation: name,\s+target/);
  assert.match(
    schema,
    /status: text\("status", \{ enum: \["processing", "succeeded", "failed"\] \}\)/,
  );
  assert.match(schema, /attemptCount: integer\("attempt_count"\)/);
  assert.match(
    retryMigration,
    /ADD COLUMN status text NOT NULL DEFAULT 'processing'/,
  );
  assert.match(
    mcp,
    /This manager instruction is already being processed\. Retry after it completes\./,
  );
  assert.match(mcp, /eq\(assistantMessageExecutions\.status, "failed"\)/);
});

test("message state operations require the current claim rather than a stale message id", () => {
  assert.match(
    mcp,
    /A current claimId is required for this message operation\./,
  );
  assert.match(mcp, /"create_shift_swap_announcement_draft"/);
  assert.match(mcp, /eq\(assistantMessages\.status, "processing"\)/);
  assert.match(mcp, /eq\(assistantMessages\.claimId, text\(args\.claimId\)\)/);
  assert.match(mcp, /The message claim is no longer current\./);
});
