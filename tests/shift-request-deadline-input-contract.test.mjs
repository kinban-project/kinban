import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/shift-builder.tsx", "utf8");

test("pending shift request deadline is editable as a date and time", () => {
  const pendingSection = source.slice(source.indexOf("detail.requestPeriod.status === \"pending\""), source.indexOf("detail.requestPeriod.status === \"pending\"") + 700);
  assert.match(pendingSection, /type="datetime-local"/);
  assert.match(pendingSection, /toDateTimeLocal\(detail\.requestPeriod\.closesOn\)/);
});
