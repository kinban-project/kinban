import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");

test("assistant queue summary exposes counts only under an operations context", () => {
  assert.match(route, /name: "get_assistant_message_queue_summary"/);
  assert.match(route, /identity\.tokenType !== "assistant"/);
  assert.match(route, /assistantContext\.mode !== "operations"/);
  assert.match(route, /messageBodiesIncluded: false/);
  assert.match(route, /pendingCount:/);
  assert.match(route, /processingCount:/);
  assert.match(route, /reclaimableCount:/);
});
