import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/mcp/route.ts", "utf8");

test("get_shift_plan chunks assignment lookups to remain below D1 bind limits", () => {
  assert.match(source, /const chunk = <T,>\(items: T\[\], size: number\)/);
  assert.match(source, /chunk\(slots\.map\(\(slot\) => slot\.id\), 50\)\.map/);
  assert.match(source, /const allAssignments = assignmentChunks\.flat\(\)/);
});
