import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");
const personalPack = fs.readFileSync("app/api/api-key/route.ts", "utf8");

test("personal MCP exposes request-period discovery without exposing assignments", () => {
  assert.match(route, /name: "list_my_shift_request_periods"/);
  assert.match(route, /personalTools = new Set\(\[[\s\S]*"list_my_shift_request_periods"/);
  assert.match(route, /isAcceptingNow/);
  assert.match(route, /submissionByPeriod/);
  assert.match(route, /requiredCount: slot\.requiredCount/);
  assert.doesNotMatch(route.slice(route.indexOf('name: "list_my_shift_request_periods"'), route.indexOf('if (name === "get_shift_plan")')), /shiftAssignments/);
});

test("omitted personal request period never falls back to arbitrary database order", () => {
  const start = route.indexOf('if (name === "get_shift_requests")');
  const end = route.indexOf('if (name === "save_shift_requests")', start);
  const block = route.slice(start, end);
  assert.match(block, /acceptingPeriods/);
  assert.match(block, /acceptingPeriods\.length === 1/);
  assert.match(block, /requiresPeriodId: true/);
  assert.doesNotMatch(block, /periods\[0\]/);
});

test("personal connection pack explains request-period discovery and explicit periodId", () => {
  assert.match(personalPack, /list_my_shift_request_periods/);
  assert.match(personalPack, /Pass the returned periodId/);
  assert.match(personalPack, /before the related shift is published/);
  assert.match(personalPack, /Never select an arbitrary old or closed period/);
});

test("saving personal shift requests uses the demo clock for the deadline", () => {
  const start = route.indexOf('if (name === "save_shift_requests")');
  const end = route.indexOf('if (name === "set_shift_assignments")', start);
  const block = route.slice(start, end);
  assert.match(block, /const demoTime = await getDemoTimeContext\(groupId\)/);
  assert.match(block, /shiftRequestDeadlinePassed\(\s*period\.closesOn,\s*new Date\(demoTime\.currentAt\)/);
});
