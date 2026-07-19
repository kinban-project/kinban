import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const route = fs.readFileSync("app/api/groups/[id]/work-records/route.ts", "utf8");
const migration = fs.readFileSync("drizzle/0020_prevent_concurrent_work_starts.sql", "utf8");

test("work records have a group-user active key and a partial unique index", () => {
  assert.match(schema, /activeKey: text\("active_key"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `work_records_active_key_unique`/);
  assert.match(migration, /WHERE `active_key` IS NOT NULL/);
});

test("start clears expired active keys and handles the unique conflict", () => {
  assert.match(route, /activeKey: null/);
  assert.match(route, /activeKey: `\$\{groupId\}:\$\{user\.email\}`/);
  assert.match(route, /already active for this group and user/);
});
