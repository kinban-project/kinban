import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("yakiniku assignment demo is discoverable and seeded with position coverage cases", async () => {
  const seed = await readFile(new URL("../scripts/seed-local.sql", import.meta.url), "utf8");
  const standalone = await readFile(new URL("../scripts/seed-yakiniku.sql", import.meta.url), "utf8");
  const demo = await readFile(new URL("../app/demo/page.tsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../public/demo-scenarios/yakiniku.html", import.meta.url), "utf8");

  assert.match(seed, /焼肉店（ポジション割当デモ）/);
  assert.match(seed, /duty-yakiniku-waiting/);
  assert.match(seed, /coverage_duty_ids/);
  assert.match(seed, /yakiniku-slot-\' \|\| date \|\| \'-1900-hall/);
  assert.match(seed, /yakiniku-assignment-0808-1900-kitchen-wrong/);
  assert.match(seed, /yakiniku-hall-c@local\.test/);
  assert.match(standalone, /yakiniku-hall-c@local\.test/);
  assert.match(standalone, /yakiniku-flex-b@local\.test/);
  assert.match(standalone, /member-duty-yakiniku-hall-c/);
  assert.match(standalone, /member-duty-yakiniku-flex-b-wash/);
  assert.match(standalone, /coverage_duty_ids/);
  assert.match(standalone, /yakiniku-assignment-0808-1900-kitchen-wrong/);
  assert.match(demo, /detail: "yakiniku"/);
  assert.match(demo, /焼肉店（ポジション割当デモ）/);
  assert.match(detail, /焼肉店（ポジション割当デモ）/);
  assert.match(detail, /体制不足/);
  assert.match(detail, /焼肉店長/);
});
