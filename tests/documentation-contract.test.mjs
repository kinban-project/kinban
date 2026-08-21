import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const runbook = "PUBLIC_DEMO_RUNBOOK.md";
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
  assert.match(contents[9], /submit_work_record/);
  assert.doesNotMatch(contents[9], /review_work_record/);
  assert.match(contents[9], /\/api\/groups\/:id\/assistant`/);
  assert.match(contents[9], /お知らせ管理 \| お知らせを作成・配信する.*create_announcement/);
  assert.doesNotMatch(contents[9], /お知らせ管理 \| お知らせを作成・配信する.*send_member_message/);
  const runbookContent = await readFile(resolve(root, runbook), "utf8");
  assert.match(runbookContent, /^# 公開デモ構築・復旧手順/m);
  assert.match(runbookContent, /DEMO_MODE=true/);
  assert.match(runbookContent, /LOCAL_MODE/);
  assert.match(runbookContent, /site_users/);
  assert.match(runbookContent, /db:seed:remote:demo/);
  assert.match(runbookContent, /SEED DEMO D1/);
  assert.match(runbookContent, /Cloudflareの管理権限/);
  assert.match(runbookContent, /本番でしてはいけないこと/);
  assert.match(await readFile(resolve(root, "README.md"), "utf8"), /\[公開デモ構築・復旧手順\]\(PUBLIC_DEMO_RUNBOOK\.md\)/);
});

test("remote demo seed rejects production config and accepts a demo dry-run config", async () => {
  const temp = await mkdtemp(resolve(tmpdir(), "kinban-seed-test-"));
  const demoConfig = resolve(temp, "wrangler.demo.jsonc");
  await writeFile(demoConfig, JSON.stringify({
    vars: { DEMO_MODE: true, NEXT_PUBLIC_DEMO_MODE: true },
    d1_databases: [{ binding: "DB", database_name: "demo-db", database_id: "demo-id" }],
  }));
  try {
    const script = resolve(root, "scripts/seed-remote-demo.mjs");
    const demo = spawnSync(process.execPath, [script, "--config", demoConfig, "--database", "demo-db", "--confirm", "SEED DEMO D1", "--dry-run"], { encoding: "utf8" });
    assert.equal(demo.status, 0, demo.stderr);
    assert.match(demo.stdout, /Dry run only/);

    const production = spawnSync(process.execPath, [script, "--config", resolve(root, "wrangler.production.jsonc"), "--database", "kinban-prod-db", "--confirm", "SEED DEMO D1", "--dry-run"], { encoding: "utf8" });
    assert.notEqual(production.status, 0);
    assert.match(production.stderr, /demo-only|DEMO_MODE/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

