import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8");

test("MCP exposes assistant message retrieval", () => {
  assert.match(source, /name: "list_assistant_messages"/);
  assert.match(source, /eq\(assistantMessages\.groupId, groupId\)/);
  assert.match(source, /manager \? requestedMember : identity\.email/);
});

test("MCP assistant replies require manager permission and confirmation", () => {
  assert.match(source, /name: "reply_assistant_message"/);
  assert.match(source, /args\.confirm !== true/);
  assert.match(source, /Editor membership required/);
  assert.match(source, /senderType: "assistant"/);
  assert.match(source, /status: "processed"/);
});
