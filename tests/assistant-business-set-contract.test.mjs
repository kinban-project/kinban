import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("operations assistant connection packs include generated business guidance and secrets", () => {
  const route = fs.readFileSync("app/api/groups/[id]/assistant/access/route.ts", "utf8");
  const businessSet = fs.readFileSync("app/assistant-business-set.ts", "utf8");

  assert.doesNotMatch(route, /downloadBusinessSet/);
  assert.match(route, /buildAssistantBusinessSetFiles/);
  assert.match(route, /Content-Disposition.*kinban-operations-assistant-\$\{assistantBusinessSet\.packageVersion\}\.zip/);
  assert.match(businessSet, /manifest\.json/);
  assert.match(businessSet, /packageVersion/);
  assert.match(businessSet, /GENERATED FILE/);
  assert.match(businessSet, /sourceFingerprint/);
  assert.match(businessSet, /kinban-manager-agent/);
  assert.match(businessSet, /SECURITY_BOUNDARY\.md/);
  assert.match(businessSet, /DIRECT_MANAGER_MODE\.md/);
  assert.match(businessSet, /AI運用ガイド\.md/);
  assert.match(businessSet, /docs\/運営支援AI実行環境分離\.md/);
  assert.match(businessSet, /skills\/shift-planning\/SKILL\.md/);
  assert.match(businessSet, /runbooks\/ui-only-operations\.md/);
  assert.match(businessSet, /scripts\/mcp-http-bridge\.mjs/);
  assert.match(businessSet, /\.codex\/config\.toml/);
  assert.match(businessSet, /\.mcp\.json/);
  assert.match(businessSet, /CLAUDE\.md/);
  assert.doesNotMatch(businessSet, /KINBAN_API_KEY\s*=/);

  const connectionPackStart = route.lastIndexOf('const files = buildAssistantBusinessSetFiles();');
  const connectionPackEnd = route.lastIndexOf('const archive = buildZip(files);');
  const connectionPackBlock = route.slice(connectionPackStart, connectionPackEnd);
  assert.match(connectionPackBlock, /connection\.env/);
  assert.match(connectionPackBlock, /permissions\.txt/);
  assert.match(connectionPackBlock, /manifest\.json/);
  assert.match(connectionPackBlock, /sourceFingerprint/);
  assert.match(connectionPackBlock, /connection\.envとAPIキーは秘密情報です/);
  assert.match(connectionPackBlock, /mcp-http-bridge\.mjs/);
  assert.match(connectionPackBlock, /\.codex\/config\.toml/);
  assert.match(connectionPackBlock, /\.mcp\.json/);
  assert.doesNotMatch(connectionPackBlock, /baseReadme/);
  assert.doesNotMatch(connectionPackBlock, /別途ダウンロードした/);
});
