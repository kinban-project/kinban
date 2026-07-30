import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docs = [
  "docs/ARCHITECTURE.md",
  "docs/DOMAIN_MODEL.md",
  "docs/DATABASE.md",
  "docs/AUTHORIZATION.md",
  "docs/TESTING.md",
  "docs/KINBANガイド目次.md",
  "docs/管理者ガイド.md",
  "docs/運営支援AIガイド.md",
  "docs/サイト管理者ガイド.md",
  "docs/操作カタログ.md",
];

test("technical documentation set exists and links to source of truth", async () => {
  const contents = await Promise.all(docs.map((file) => readFile(resolve(root, file), "utf8")));
  for (const content of contents) {
    assert.match(content, /^# /m);
    assert.doesNotMatch(content, /(?:sk-|mcp_|md_)[A-Za-z0-9_-]{12,}/);
  }
  assert.match(contents[0], /db\/schema\.ts/);
  assert.match(contents[2], /drizzle\//);
  assert.match(contents[4], /npm test/);
  assert.match(contents[5], /管理者ガイド/);
  assert.match(contents[9], /関連MCP/);
});
