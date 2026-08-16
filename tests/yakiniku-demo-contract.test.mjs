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
  assert.match(seed, /duty_scope_ids/);
  assert.match(seed, /templates\(suffix, start_time, end_time, role, duty_id, duty_name_snapshot, duty_scope_ids\) AS \(VALUES/);
  assert.match(seed, /\('2100-meat', '21:00', '24:00'/);
  assert.match(seed, /\('1700-hall',[\s\S]*duty-yakiniku-wash/);
  assert.match(seed, /\('1800-drink',[\s\S]*duty-yakiniku-wash/);
  assert.match(seed, /\('1900-drink',[\s\S]*duty-yakiniku-wash/);
  assert.match(seed, /\('2100-hall',[\s\S]*duty-yakiniku-wash/);
  assert.match(seed, /seed-yakiniku-request-hall-a-off/);
  assert.match(seed, /yakiniku-assignment-0808-1900-meat-wrong/);
  assert.match(seed, /yakiniku-hall-c@local\.test/);
  assert.match(standalone, /yakiniku-hall-c@local\.test/);
  assert.match(standalone, /yakiniku-flex-b@local\.test/);
  assert.match(standalone, /member-duty-yakiniku-hall-c/);
  assert.match(standalone, /member-duty-yakiniku-flex-b-wash/);
  assert.match(standalone, /duty_scope_ids/);
  assert.match(standalone, /yakiniku-assignment-0808-1900-meat-wrong/);
  assert.match(standalone, /shift_request_submissions/);
  assert.match(standalone, /seed-yakiniku-request-hall-a-off/);
  assert.match(standalone, /'unavailable'/);
  assert.match(standalone, /templates\(suffix, start_time, end_time, role, duty_id, duty_name_snapshot, duty_scope_ids\) AS \(VALUES/);
  assert.match(standalone, /\('1700-hall',[\s\S]*duty-yakiniku-wash/);
  assert.match(standalone, /\('1800-drink',[\s\S]*duty-yakiniku-wash/);
  assert.match(standalone, /\('1900-drink',[\s\S]*duty-yakiniku-wash/);
  assert.match(standalone, /\('2100-hall',[\s\S]*duty-yakiniku-wash/);
  assert.equal((standalone.match(/\('(?:1400|1700|1800|1900|2100)-[^']+', '[0-9]{2}:[0-9]{2}', '[0-9]{2}:[0-9]{2}',/g) ?? []).length, 18);
  assert.doesNotMatch(standalone, /UNION ALL SELECT 'yakiniku-slot-/);
  assert.match(demo, /detail: "yakiniku"/);
  assert.match(demo, /焼肉店（ポジション割当デモ）/);
  assert.match(detail, /焼肉店（ポジション割当デモ）/);
  assert.match(detail, /体制不足/);
  assert.match(detail, /焼肉店長/);
});

test("yakiniku time bands cover all six duties through slot scopes", async () => {
  const sources = await Promise.all([
    readFile(new URL("../scripts/seed-local.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/seed-yakiniku.sql", import.meta.url), "utf8"),
  ]);
  const expected = [
    '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-drink","duty-yakiniku-wash"]',
    '["duty-yakiniku-salad-soup","duty-yakiniku-meat"]',
    '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-wash"]',
    '["duty-yakiniku-drink","duty-yakiniku-wash"]',
  ];
  for (const source of sources) {
    const templateBlock = source.match(/templates\(suffix,[\s\S]*?\n\)\nINSERT INTO shift_slots/)[0];
    const scopeJson = [...templateBlock.matchAll(/'\[(.*?)\]'\)/g)].map((match) => `[${match[1]}]`);
    const normalized = scopeJson.map((value) => value.replaceAll("'", "\"").replaceAll("\"\"", "\""));
    for (const scope of expected) {
      assert.ok(normalized.some((value) => value === scope), `missing expected scope ${scope}`);
    }
  }
});
