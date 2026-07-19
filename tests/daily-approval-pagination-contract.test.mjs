import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("app/work-records-panel.tsx", "utf8");

test("daily approval manager view receives its pagination props before rendering controls", () => {
  const managerView = panel.slice(panel.indexOf("function ManagerView"));
  assert.match(managerView, /monthAction,\s*page,\s*hasNext,\s*onPageChange,/);
  assert.match(managerView, /onClick=\{\(\) => onPageChange\(Math\.max\(1, page - 1\)\)\}/);
  assert.match(managerView, /disabled=\{!hasNext\}/);
});
