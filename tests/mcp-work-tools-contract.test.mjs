import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/mcp/route.ts", "utf8");
const tools = fs.readFileSync("app/mcp/work-tools.ts", "utf8");

test("MCP exposes attendance and daily/monthly work operations", () => {
  for (const name of ["get_work_records", "clock_work", "submit_work_record", "submit_monthly_work", "review_monthly_work"]) assert.match(route, new RegExp(name));
  for (const name of ["getMcpWorkRecords", "mcpClock", "mcpDailyReview", "mcpSubmitMonthly", "mcpReviewMonthly"]) assert.match(tools, new RegExp(`export async function ${name}`));
  assert.match(tools, /recordAudit/);
  assert.match(tools, /monthlyClosedAt/);
});
