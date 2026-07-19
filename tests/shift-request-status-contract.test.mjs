import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const statuses = fs.readFileSync("app/preference-status.ts", "utf8");
const api = fs.readFileSync("app/api/shift-requests/route.ts", "utf8");
const preferencesApi = fs.readFileSync("app/api/groups/[id]/preferences/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");

test("preference statuses are shared across browser APIs and MCP", () => {
  for (const status of ["want", "possible", "off", "unavailable"]) assert.match(statuses, new RegExp(`\\"${status}\\"`));
  assert.match(api, /preference-status/);
  assert.match(preferencesApi, /preference-status/);
  assert.match(mcp, /preference-status/);
});

test("invalid base availability and shift requests are rejected instead of silently dropped", () => {
  assert.match(api, /invalidIndex/);
  assert.match(preferencesApi, /invalidIndex/);
  assert.match(mcp, /invalidIndex/);
  assert.match(mcp, /enum: \["want", "possible", "off", "unavailable"\]/);
  assert.match(mcp, /normalizedCount/);
});
