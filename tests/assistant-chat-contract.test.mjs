import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("new groups receive a dedicated KINBAN assistant", async () => {
  const [schema, groupsRoute, migration] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/groups/route.ts"),
    read("drizzle/0023_add_group_assistant_chat.sql"),
  ]);
  assert.match(schema, /groupAssistants/);
  assert.match(groupsRoute, /insert\(groupAssistants\)/);
  assert.match(migration, /INSERT INTO `group_assistants`/);
});

test("assistant conversations are isolated by group and member", async () => {
  const route = await read("app/api/groups/[id]/assistant/route.ts");
  assert.match(route, /eq\(assistantMessages\.groupId, id\)/);
  assert.match(route, /eq\(assistantMessages\.memberEmail, memberEmail\)/);
  assert.match(route, /requestedMember \? requestedMember : user\.email/);
  assert.match(route, /memberEmail: user\.email/);
});

test("stopping the assistant blocks new messages without deleting history", async () => {
  const route = await read("app/api/groups/[id]/assistant/route.ts");
  assert.match(route, /assistant\.status !== "active"/);
  assert.match(route, /KINBANアシスタントは現在停止中です/);
  assert.doesNotMatch(route, /delete\(assistantMessages\).*PATCH/s);
});
