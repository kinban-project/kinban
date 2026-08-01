import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("shift evaluation fixtures and runner cover the five-scenario matrix", () => {
  const sql = fs.readFileSync("scripts/seed-shift-evaluation.sql", "utf8");
  const runner = fs.readFileSync("scripts/evaluate-shift-scenarios.mjs", "utf8");
  for (const id of ["eval-plan-cafe", "eval-plan-event", "eval-plan-absence", "eval-group-shifts"]) assert.match(sql, new RegExp(id));
  for (const id of ["seed-plan-august-first", "seed-night-cast-plan-august-month", "eval-plan-cafe", "eval-plan-event", "eval-plan-absence"]) assert.match(runner, new RegExp(id));
  for (const value of ["preference", "labor", "fairness", "minimal", "unfilled", "problems", "all", "evaluation-a", "evaluation-b"]) assert.match(runner, new RegExp(value));
  assert.match(runner, /unavailable/);
  assert.match(runner, /workloadSpreadMinutes/);
});
