import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const migration = fs.readFileSync("drizzle/0037_add_shift_swap_requests.sql", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const assistantRoute = fs.readFileSync("app/api/groups/[id]/assistant/route.ts", "utf8");

test("shift replacement keeps a request and candidate history", () => {
  assert.match(schema, /shiftSwapRequests/);
  assert.match(schema, /shiftSwapCandidates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `shift_swap_requests`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `shift_swap_candidates`/);
  assert.match(schema, /swapRequestId: text\("swap_request_id"\)/);
});

test("shift replacement is manager-confirmed and version guarded", () => {
  assert.match(mcp, /name: "list_shift_swap_requests"/);
  assert.match(mcp, /name: "respond_shift_swap_candidate"/);
  assert.match(mcp, /name: "confirm_shift_swap"/);
  assert.match(mcp, /Shift plan version conflict/);
  assert.match(mcp, /Replacement member already has an overlapping assignment/);
  assert.match(mcp, /has an unavailable preference for this slot/);
  assert.match(
    mcp,
    /chunk\(allSlots\.map\(\(item\) => item\.id\), 50\)/,
  );
  assert.match(mcp, /shift_swap_confirmed/);
  assert.match(assistantRoute, /status: "open"/);
});
