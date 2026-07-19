import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const api = fs.readFileSync("app/api/shift-requests/route.ts", "utf8");

test("MCP shift request saves create or update the same submission record as the API", () => {
  assert.match(mcp, /shiftRequestSubmissions/);
  assert.match(mcp, /savedAt/);
  assert.match(mcp, /action: "shift\.request"/);
  assert.match(mcp, /submissionStatus: "submitted"/);
  assert.match(api, /shiftRequestSubmissions/);
  assert.match(api, /action: "shift\.request"/);
});
