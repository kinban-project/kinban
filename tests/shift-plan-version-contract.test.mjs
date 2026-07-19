import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const api = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const builder = fs.readFileSync("app/shift-builder.tsx", "utf8");
const adjustment = fs.readFileSync("app/shift-adjustment.tsx", "utf8");
const migration = fs.readFileSync("drizzle/0021_add_shift_plan_version.sql", "utf8");

test("shift plans expose a persistent optimistic-lock version", () => {
  assert.match(schema, /version: integer\("version"\)\.notNull\(\)\.default\(1\)/);
  assert.match(migration, /ALTER TABLE `shift_plans` ADD `version` integer DEFAULT 1 NOT NULL/);
});

test("browser and MCP writes carry and validate the expected version", () => {
  assert.match(api, /expectedVersion/);
  assert.match(api, /conflict: true/);
  assert.match(api, /returning\(\{ version: shiftPlans\.version \}\)/);
  assert.match(builder, /expectedVersion: detail\.plan\.version/);
  assert.match(adjustment, /expectedVersion: detail\.plan\.version/);
  assert.match(mcp, /expectedVersion/);
  assert.match(mcp, /version conflict/);
  assert.match(mcp, /returning\(\{ version: shiftPlans\.version \}\)/);
});
