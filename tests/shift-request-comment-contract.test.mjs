import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const api = fs.readFileSync("app/api/shift-requests/route.ts", "utf8");
const mcp = fs.readFileSync("app/mcp/route.ts", "utf8");
const browser = fs.readFileSync("app/shift-requests.tsx", "utf8");
const adjustment = fs.readFileSync("app/shift-adjustment.tsx", "utf8");

test("period-specific shift request comments are stored and exposed consistently", () => {
  assert.match(schema, /requestComment: text\("request_comment"\)/);
  assert.match(api, /requestComment/);
  assert.match(mcp, /requestComment/);
  assert.match(browser, /maxLength=\{500\}/);
  assert.match(browser, /requestComment/);
  assert.match(adjustment, /requestComment/);
});
