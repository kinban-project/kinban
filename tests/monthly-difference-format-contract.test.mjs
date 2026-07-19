import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/monthly-work-panel.tsx", "utf8");

test("monthly difference formatting applies one sign to the absolute duration", () => {
  assert.match(source, /const sign = value < 0 \? "-" : ""/);
  assert.match(source, /const absolute = Math\.abs\(value\)/);
  assert.match(source, /Math\.floor\(absolute \/ 60\)/);
  assert.match(source, /absolute % 60/);
});
