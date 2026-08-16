import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const seed = fs.readFileSync("scripts/seed-local.sql", "utf8");
const scenariosRoute = fs.readFileSync("app/api/shifts/[id]/scenarios/route.ts", "utf8");
const scenarioRoute = fs.readFileSync("app/api/shifts/[id]/scenarios/[scenarioId]/route.ts", "utf8");
const adjustment = fs.readFileSync("app/shift-adjustment.tsx", "utf8");
const cluster = fs.readFileSync("app/shift-cluster.ts", "utf8");
const mcpRoute = fs.readFileSync("app/mcp/route.ts", "utf8");

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

test("automatic assignment rejects new same-day split clusters and prefers connected work", () => {
  assert.match(cluster, /sameDayWorkClusterCount/);
  assert.match(cluster, /after <= before/);
  assert.match(cluster, /range\.start > currentEnd/);
  assert.match(scenariosRoute, /doesNotCreateSplitShift/);
  assert.match(scenariosRoute, /clusterPlacement\(a\.userEmail, slot\)\.delta/);
  assert.match(mcpRoute, /doesNotCreateSplitShift/);
  assert.match(mcpRoute, /clusterPlacement\(candidate, left\.userEmail, slot\)\.delta/);
});

test("shift adjustment exposes scenario lifecycle without changing the base until adoption", () => {
  assert.match(adjustment, /割当案/);
  assert.match(adjustment, /案一覧に保存します/);
  assert.match(adjustment, /複製/);
  assert.match(adjustment, /比較/);
  assert.match(adjustment, /採用するまで本体の割当/);
  assert.match(adjustment, /本体の割当・公開シフトに影響しません/);
  assert.match(adjustment, /setBaseAssignments/);
  assert.match(adjustment, /preferenceOutOfRangeCount/);
  assert.match(adjustment, /baseAssignments\[slot\.id\]/);
  assert.match(adjustment, /previewPreferenceFor/);
  assert.match(adjustment, /assignment-preview-person/);
  assert.match(adjustment, /未割当/);
});

test("shift adjustment exposes a read-only duty capability directory", () => {
  assert.match(adjustment, /担当可能一覧/);
  assert.match(adjustment, /現在表示中の候補/);
  assert.match(adjustment, /全メンバー/);
  assert.match(adjustment, /duty-directory-table/);
  assert.match(adjustment, /担当マスタとメンバーごとの担当可能設定/);
  assert.match(adjustment, /dutyIds/);
  assert.match(adjustment, /担当可能:/);
});
