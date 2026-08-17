import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getShiftDisplayStatus } from "../app/shift-status.ts";

const listRoute = fs.readFileSync("app/api/shifts/route.ts", "utf8");
const detailRoute = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");
const builder = fs.readFileSync("app/shift-builder.tsx", "utf8");
const adjustment = fs.readFileSync("app/shift-adjustment.tsx", "utf8");

const basePlan = { status: "draft", endDate: "2026-08-15" };

test("shift display status follows an explicit demo date across the request lifecycle", () => {
  assert.equal(getShiftDisplayStatus({ ...basePlan, requestStatus: "pending" }, "2026-07-19"), "before-request");
  assert.equal(getShiftDisplayStatus({ ...basePlan, requestStatus: "open" }, "2026-07-21"), "request-open");
  assert.equal(getShiftDisplayStatus({ ...basePlan, requestStatus: "closed" }, "2026-07-31"), "assignment");
  assert.equal(getShiftDisplayStatus({ ...basePlan, requestStatus: "closed" }, "2026-08-16"), "ended");
});

test("shift APIs and screens use the returned demo time rather than the browser date", () => {
  assert.match(listRoute, /demoTime:\s*\{\s*currentAt: demoNow\.toISOString\(\),\s*today: jstDate\(demoNow\)/);
  assert.match(detailRoute, /demoTime:\s*\{\s*currentAt: demoNow\.toISOString\(\),\s*today: jstDate\(demoNow\)/);
  assert.match(builder, /displayStatus\(plan, null, demoToday\)/);
  assert.match(builder, /detail\.demoTime\?\.today \?\? demoToday/);
  assert.match(adjustment, /getShiftDisplayStatus\(plan, detail\?\.demoTime\?\.today \?\? demoToday\)/);
});
