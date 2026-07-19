import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/groups/[id]/work-records/route.ts", "utf8");

test("work record list supports bounded filtered pagination", () => {
  assert.match(route, /query\.get\("from"\)/);
  assert.match(route, /query\.get\("to"\)/);
  assert.match(route, /query\.get\("userEmail"\)/);
  assert.match(route, /query\.get\("status"\)/);
  assert.match(route, /pageSize/);
  assert.match(route, /\.limit\(pageSize \+ 1\)/);
  assert.match(route, /nextPage/);
});
