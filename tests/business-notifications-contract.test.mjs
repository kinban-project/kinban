import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("business notifications keep urgency, system events, and no-duplicate contracts", () => {
  const schema = read("db/schema.ts");
  const helper = read("app/notification-events.ts");
  const announcements = read("app/api/groups/[id]/announcements/route.ts");
  const shifts = read("app/api/shifts/[id]/route.ts");

  assert.match(schema, /notificationLevel/);
  assert.doesNotMatch(schema, /"important"/);
  assert.match(schema, /category/);
  assert.match(schema, /senderType.*system/);
  assert.match(schema, /assistant_message_event_recipient_unique_idx/);
  assert.match(schema, /where\(sql`event_id <> ''`\)/);
  assert.match(helper, /onConflictDoNothing\(\)/);
  assert.match(helper, /sendBusinessPush/);
  assert.match(announcements, /notificationLevel === "urgent"/);
  assert.match(announcements, /notificationLevel === "important" \? "normal"/);
  assert.match(announcements, /緊急のお知らせがあります/);
  assert.match(shifts, /published_shift_changed/);
});

test("assistant replies and attendance rejections use generic push text", () => {
  const mcp = read("app/mcp/route.ts");
  const daily = read("app/api/groups/[id]/work-records/route.ts");
  const monthly = read("app/api/groups/[id]/monthly-work/route.ts");

  assert.match(mcp, /KINBANアシスタントから新しい連絡があります/);
  assert.match(mcp, /assistant_needs_review/);
  assert.match(daily, /勤怠の確認・修正が必要です/);
  assert.match(monthly, /勤怠の確認・修正が必要です/);
});
