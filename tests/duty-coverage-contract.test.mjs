import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("duty coverage warnings are shared by UI, API, and MCP validation", async () => {
  const validation = await readFile(new URL("../app/duty-validation.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/shift-adjustment.tsx", import.meta.url), "utf8");
  const shiftsApi = await readFile(new URL("../app/api/shifts/[id]/route.ts", import.meta.url), "utf8");
  const scenariosApi = await readFile(new URL("../app/api/shifts/[id]/scenarios/route.ts", import.meta.url), "utf8");
  const publishApi = await readFile(new URL("../app/api/shifts/[id]/scenarios/[scenarioId]/publish/route.ts", import.meta.url), "utf8");
  const mcp = await readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8");

  assert.match(validation, /buildDutyCoverageWarnings/);
  assert.match(validation, /coverage:/);
  assert.match(validation, /体制不足/);
  assert.match(ui, /warningFilter === "duty"/);
  assert.match(ui, /warningFilter === "coverage"/);
  assert.match(ui, /適性外/);
  assert.match(ui, /体制不足/);
  assert.match(shiftsApi, /buildDutyCoverageWarnings/);
  assert.match(scenariosApi, /buildDutyCoverageWarnings/);
  assert.match(publishApi, /buildDutyCoverageWarnings/);
  assert.match(mcp, /coverage_missing/);
});
