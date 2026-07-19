import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/shift-adjustment.tsx", "utf8");

test("shift assignment modes render one mutually exclusive view", () => {
  assert.equal(source.includes("legacy-preview"), false);
  assert.match(source, /viewMode === "preview" && \(/);
  assert.match(source, /viewMode === "list" \? \(/);
  assert.match(source, /viewMode === "calendar" \? \(/);
  assert.match(source, /\) : null\}/);
});
