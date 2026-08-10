import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cleanup = fs.readFileSync("app/shift-request-cleanup.ts", "utf8");
const requestRoute = fs.readFileSync("app/api/shift-requests/route.ts", "utf8");
const shiftRoute = fs.readFileSync("app/api/shifts/[id]/route.ts", "utf8");
const scenarioRoute = fs.readFileSync("app/api/shifts/[id]/scenarios/route.ts", "utf8");
const exportRoute = fs.readFileSync("app/api/v1/groups/[id]/export/route.ts", "utf8");
const mcpRoute = fs.readFileSync("app/mcp/route.ts", "utf8");

test("stale shift requests are removed by the plan slot identity", () => {
  assert.match(cleanup, /shiftRequests/);
  assert.match(cleanup, /shiftSlots/);
  assert.match(cleanup, /request\.date.*request\.startTime.*request\.endTime/);
  assert.match(cleanup, /validSlots\.has/);
  assert.match(cleanup, /db\.delete\(shiftRequests\)/);
  assert.match(cleanup, /chunk\(invalidIds, 50\)/);
});

test("all request read and save paths clean stale rows while preserving new-row validation", () => {
  assert.match(requestRoute, /pruneInvalidShiftRequestsForPlans/);
  assert.match(requestRoute, /pruneInvalidShiftRequests\(db, period\.planId\)/);
  assert.match(requestRoute, /requests\.findIndex/);
  assert.match(shiftRoute, /pruneInvalidShiftRequests\(db, id\)/);
  assert.match(scenarioRoute, /pruneInvalidShiftRequests\(db, planId\)/);
  assert.match(exportRoute, /pruneInvalidShiftRequestsForPlans/);
  assert.match(mcpRoute, /pruneInvalidShiftRequests\(db, period\.planId\)/);
  assert.match(mcpRoute, /pruneInvalidShiftRequests\(db, plan\.id\)/);
  assert.match(mcpRoute, /prunedRequestCount/);
  assert.match(mcpRoute, /requests\[\$\{invalidIndex\}\]/);
});
