import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/shift-adjustment.tsx", "utf8");

test("shift assignment candidate filters default to preferred and possible", () => {
  assert.match(source, /want:\s*true/);
  assert.match(source, /possible:\s*true/);
  assert.match(source, /off:\s*false/);
  assert.match(source, /unavailable:\s*false/);
  assert.match(source, /duty:\s*false/);
});

test("assigned candidates remain visible and duty mismatches are separately filtered", () => {
  assert.match(source, /if \(assigned\) return true/);
  assert.match(source, /return preferenceVisible \|\| \(isDutyMismatch && candidateFilters\.duty\)/);
});
