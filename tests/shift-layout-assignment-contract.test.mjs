import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const routePath = resolve(root, "app/api/shifts/[id]/route.ts");

test("shift PATCH applies assignments against slots reloaded after layout", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /let currentSlots = slots;/);
  assert.match(source, /currentSlots = await db\.select\(\)\.from\(shiftSlots\)\.where\(eq\(shiftSlots\.planId, id\)\);/);
  assert.match(source, /body\.action !== "start-requests" && body\.assignments === undefined/);
  assert.match(source, /const allRows = currentSlots\.flatMap/);
  assert.match(source, /const statements = chunk\(currentSlots\.map\(\(slot\) => slot\.id\), 50\)/);
});
