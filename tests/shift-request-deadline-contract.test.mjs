import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const helper = fs.readFileSync("app/shift-request-deadline.ts", "utf8");
const api = fs.readFileSync("app/api/shift-requests/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const builder = fs.readFileSync("app/shift-builder.tsx", "utf8");

test("shift request deadlines are treated as JST date-times", () => {
  assert.match(helper, /T23:59:59/);
  assert.match(helper, /\+09:00/);
  assert.match(helper, /toDateTimeLocal/);
});

test("API, MCP, and the manager UI enforce deadline times", () => {
  assert.match(api, /shiftRequestDeadlinePassed/);
  assert.match(api, /status: "closed"/);
  assert.match(mcp, /shiftRequestDeadlinePassed/);
  assert.match(builder, /type="datetime-local"/);
});
