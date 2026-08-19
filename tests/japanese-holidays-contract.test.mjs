import test from "node:test";
import assert from "node:assert/strict";
import { formatJapaneseDate, getJapaneseHoliday } from "../app/japanese-holidays.ts";

test("Japanese holiday labels include names and distinguish ordinary weekends", () => {
  assert.deepEqual(getJapaneseHoliday("2026-08-11"), { date: "2026-08-11", name: "山の日", kind: "national" });
  assert.equal(formatJapaneseDate("2026-08-11"), "2026-08-11（火・山の日）");
  assert.equal(getJapaneseHoliday("2026-08-09"), null);
  assert.equal(formatJapaneseDate("2026-08-09", false), "8月9日（日）");
});

test("holiday calculation handles equinoxes, substitute holidays, and citizen holidays", () => {
  assert.equal(getJapaneseHoliday("2026-09-22")?.name, "国民の休日");
  assert.equal(getJapaneseHoliday("2026-03-20")?.name, "春分の日");
  assert.equal(getJapaneseHoliday("2021-08-09")?.name, "振替休日");
});
