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

test("arbitrary slot creation expands rows across the plan and supports sequence helpers", () => {
  assert.match(source, /function arbitrarySlots\(\)/);
  assert.match(source, /function copyPreviousRule\(\)/);
  assert.match(source, /function addNextRule\(\)/);
  assert.match(source, /function moveSlotRule\(index: number, offset: -1 \| 1\)/);
  assert.match(source, /customSlots:\s*\n\s*inputMode === "json"/);
});
