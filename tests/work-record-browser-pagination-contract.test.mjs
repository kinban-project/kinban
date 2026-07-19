import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("app/work-records-panel.tsx", "utf8");

test("work record browser exposes next-page controls for bounded API results", () => {
  assert.match(panel, /work-records\?page=\$\{recordPage\}&pageSize=100/);
  assert.match(panel, /pagination\?\.hasNext/);
  assert.match(panel, /onPageChange\(page \+ 1\)/);
  assert.match(panel, /onPageChange\(Math\.max\(1, page - 1\)\)/);
});
