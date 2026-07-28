import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("demo mode is explicit and disabled in the shared example", async () => {
  const envExample = await source(".env.example");
  assert.match(envExample, /^DEMO_MODE=false$/m);
  assert.match(envExample, /^NEXT_PUBLIC_DEMO_MODE=false$/m);
  assert.match(envExample, /^DEMO_DEFAULT_USER_ID=/m);
});

test("demo user switching is gated by demo mode", async () => {
  const localApi = await source("app/local-api.ts");
  const demoMode = await source("app/client-demo-mode.ts");
  const groupsPanel = await source("app/groups-panel.tsx");
  const page = await source("app/page.tsx");
  const demoPage = await source("app/demo/page.tsx");

  assert.match(demoMode, /NEXT_PUBLIC_DEMO_MODE/);
  assert.match(demoMode, /isDemoModeClient/);
  assert.match(localApi, /x-demo-user-id/);
  assert.match(groupsPanel, /NEXT_PUBLIC_DEMO_MODE === "true"/);
  assert.match(page, /isDemoModeClient\(\)/);
  assert.match(demoPage, /isDemoModeServer\(\)/);
});
