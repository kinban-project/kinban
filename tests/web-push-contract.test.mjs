import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const schema = await fs.readFile("db/schema.ts", "utf8");
const push = await fs.readFile("app/push.ts", "utf8");
const api = await fs.readFile("app/api/push/route.ts", "utf8");
const worker = await fs.readFile("public/kinban-sw.js", "utf8");
const control = await fs.readFile("app/push-notification-control.tsx", "utf8");

test("web push stores subscriptions per user and deduplicates deliveries", () => {
  assert.match(schema, /pushSubscriptions/);
  assert.match(schema, /pushDeliveries/);
  assert.match(schema, /push_delivery_event_subscription_unique_idx/);
  assert.match(push, /onConflictDoNothing\(\)/);
  assert.match(push, /response\.status === 404 \|\| response\.status === 410/);
  assert.doesNotMatch(push, /console\.log\(.*endpoint/);
});

test("notification APIs and worker protect subscription details and open only local routes", () => {
  assert.match(api, /getChatGPTUser/);
  assert.match(api, /userEmail !== user\.email/);
  assert.match(api, /action === "test"/);
  assert.match(worker, /self\.addEventListener\("push"/);
  assert.match(worker, /data\.url.*startsWith\("\/"\)/);
  assert.match(worker, /clients\.matchAll/);
  assert.match(control, /Notification\.requestPermission/);
  assert.match(control, /pushManager\.subscribe/);
  assert.match(control, /ホーム画面に追加/);
});
