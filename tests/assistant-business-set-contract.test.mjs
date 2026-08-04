import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("operations assistant packages keep secrets separate from business guidance", () => {
  const route = fs.readFileSync("app/api/groups/[id]/assistant/access/route.ts", "utf8");
  const businessSet = fs.readFileSync("app/assistant-business-set.ts", "utf8");

  assert.match(route, /downloadBusinessSet/);
  assert.match(route, /assistant\.business_set\.download/);
  assert.match(route, /Content-Disposition.*kinban-operations-business-set\.zip/);
  assert.match(businessSet, /manifest\.json/);
  assert.match(businessSet, /packageVersion/);
  assert.match(businessSet, /GENERATED FILE/);
  assert.match(businessSet, /sourceFingerprint/);
  assert.match(businessSet, /kinban-manager-agent/);
  assert.match(businessSet, /SECURITY_BOUNDARY\.md/);
  assert.match(businessSet, /DIRECT_MANAGER_MODE\.md/);
  assert.match(businessSet, /AI運用ガイド\.md/);
  assert.match(businessSet, /skills\/shift-planning\/SKILL\.md/);
  assert.match(businessSet, /runbooks\/ui-only-operations\.md/);
  assert.doesNotMatch(businessSet, /KINBAN_API_KEY\s*=/);

  const connectionPackStart = route.lastIndexOf('const files = {');
  const connectionPackEnd = route.lastIndexOf('const archive = buildZip(files);');
  const connectionPackBlock = route.slice(connectionPackStart, connectionPackEnd);
  assert.match(connectionPackBlock, /connection\.env/);
  assert.doesNotMatch(connectionPackBlock, /skills\/operations\/SKILL\.md/);
});
