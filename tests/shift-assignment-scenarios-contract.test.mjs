import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const seed = fs.readFileSync("scripts/seed-local.sql", "utf8");
const scenariosRoute = fs.readFileSync("app/api/shifts/[id]/scenarios/route.ts", "utf8");
const scenarioRoute = fs.readFileSync("app/api/shifts/[id]/scenarios/[scenarioId]/route.ts", "utf8");
const adjustment = fs.readFileSync("app/shift-adjustment.tsx", "utf8");

test("assignment scenarios have independent persisted storage and seed bootstrap", () => {
  assert.match(schema, /shiftAssignmentScenarios/);
  assert.match(schema, /assignmentsJson: text\("assignments_json"\)/);
  assert.match(seed, /CREATE TABLE IF NOT EXISTS shift_assignment_scenarios/);
  assert.match(seed, /DELETE FROM shift_assignment_scenarios/);
});

test("assignment scenario API supports deterministic generation and manager-only access", () => {
  assert.match(scenariosRoute, /membership\.role !== "owner" && membership\.role !== "editor"/);
  assert.match(scenariosRoute, /body\.action === "auto"/);
  assert.match(scenariosRoute, /seededScore/);
  assert.match(scenariosRoute, /shiftRequestPeriods/);
  assert.match(scenariosRoute, /shiftRequests/);
  assert.match(scenariosRoute, /preferenceStatus/);
  assert.match(scenariosRoute, /memberAvailability\.length \? "unavailable"/);
  assert.match(scenariosRoute, /settings\.unavailableMode === "exclude"/);
  assert.match(scenariosRoute, /status !== "unavailable" && status !== "off"/);
  assert.match(scenariosRoute, /chunk\(slots\.map\(\(slot\) => slot\.id\), 50\)/);
  assert.match(scenarioRoute, /export async function PATCH/);
  assert.match(scenarioRoute, /export async function DELETE/);
});

test("shift adjustment exposes scenario lifecycle without changing the base until adoption", () => {
  assert.match(adjustment, /割当案/);
  assert.match(adjustment, /条件付きで作成・保存/);
  assert.match(adjustment, /複製/);
  assert.match(adjustment, /比較/);
  assert.match(adjustment, /現行下書きに採用/);
  assert.match(adjustment, /本体割当はまだ変更されていません/);
  assert.match(adjustment, /setBaseAssignments/);
  assert.match(adjustment, /preferenceOutOfRangeCount/);
  assert.match(adjustment, /baseAssignments\[slot\.id\]/);
  assert.match(adjustment, /previewPreferenceFor/);
  assert.match(adjustment, /assignment-preview-person/);
  assert.match(adjustment, /未割当/);
});
