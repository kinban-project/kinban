import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/shift-builder.tsx", import.meta.url), "utf8");

test("shift builder exposes the three creation modes in the documented order", () => {
  assert.match(source, /簡易設定/);
  assert.match(source, /任意設定/);
  assert.match(source, /JSON設定/);
  assert.ok(source.indexOf("勤務枠の方針・メモ") < source.indexOf("勤務枠の作り方"));
});

test("arbitrary slot creation expands time bands and child duty rows across the plan", () => {
  assert.match(source, /type TimeBand =/);
  assert.match(source, /const \[arbitraryBands, setArbitraryBands\]/);
  assert.match(source, /band\.rules\.map/);
  assert.match(source, /function arbitrarySlots\(\)/);
  assert.match(source, /function addNextBand\(\)/);
  assert.match(source, /function removeBand\(index: number\)/);
  assert.match(source, /function addBandRule\(bandIndex: number\)/);
  assert.match(source, /＋この時間帯に担当枠を追加/);
  assert.match(source, /この時間帯を削除/);
  assert.doesNotMatch(source, /copyPreviousBand|moveBandRule|function moveBand\(/);
  assert.match(source, /customSlots:\s*\n\s*inputMode === "json"/);
});
