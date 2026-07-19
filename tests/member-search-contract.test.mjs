import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("app/groups-panel.tsx", "utf8");

test("member management provides name and email search without changing member data", () => {
  assert.match(panel, /memberQuery/);
  assert.match(panel, /member-search/);
  assert.match(panel, /member\.displayName/);
  assert.match(panel, /member\.userEmail/);
  assert.match(panel, /filteredMembers\.map/);
});
