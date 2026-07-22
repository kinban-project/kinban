import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync("app/shift-builder.tsx", "utf8");
const createApi = fs.readFileSync("app/api/shifts/route.ts", "utf8");
const updateApi = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");

test("new shift plans start with an empty name and next-month dates", () => {
  assert.match(builder, /function nextMonthRange\(base: Date\)/);
  assert.match(builder, /name: ""/);
  assert.match(builder, /startDate: ""/);
  assert.match(builder, /endDate: ""/);
  assert.match(builder, /current\.startDate \? current : \{ \.\.\.current, \.\.\.range \}/);
  assert.match(builder, /if \(!form\.name\.trim\(\)\)/);
  assert.match(createApi, /if \(!name \|\| !startDate \|\| !endDate \|\| startDate > endDate\)/);
});

test("shift adjustment can rename a plan and rejects blank names", () => {
  assert.match(builder, /name: detail\.plan\.name\.trim\(\)/);
  assert.match(builder, /value=\{detail\.plan\.name\}/);
  assert.match(updateApi, /name\?: string/);
  assert.match(updateApi, /if \(body\.name !== undefined && !nextName\)/);
  assert.match(updateApi, /nextName !== undefined \? \{ name: nextName \} : \{\}/);
});
