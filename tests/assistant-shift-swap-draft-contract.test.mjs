import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const schema = await fs.readFile("db/schema.ts", "utf8");
const mcpRoute = await fs.readFile("app/mcp/route.ts", "utf8");
const assistantRoute = await fs.readFile(
  "app/api/groups/[id]/assistant/route.ts",
  "utf8",
);
const chat = await fs.readFile("app/assistant-chat.tsx", "utf8");

test("shift-swap requests create a reviewable draft, not a direct announcement", () => {
  assert.match(schema, /assistantAnnouncementDrafts/);
  assert.match(
    schema,
    /sourceMessageId: text\("source_message_id"\)\.notNull\(\)\.unique\(\)/,
  );
  assert.match(mcpRoute, /name: "create_shift_swap_announcement_draft"/);
  assert.match(mcpRoute, /eq\(shiftPlans\.status, "published"\)/);
  assert.match(mcpRoute, /chunk\(planIds, 50\)/);
  assert.match(mcpRoute, /chunk\(slotIds, 50\)/);
  assert.match(mcpRoute, /Multiple published shifts matched/);
  assert.match(mcpRoute, /status: "needs_review"/);
  assert.match(mcpRoute, /This never distributes an announcement/);
});

test("manager can review, edit, publish, or reject the draft from one screen", () => {
  assert.match(assistantRoute, /updateAnnouncementDraft/);
  assert.match(assistantRoute, /publishAnnouncementDraft/);
  assert.match(assistantRoute, /rejectAnnouncementDraft/);
  assert.match(assistantRoute, /assistant\.announcement_draft\.publish/);
  assert.match(
    assistantRoute,
    /isNull\(assistantAnnouncementDrafts\.announcementId\)/,
  );
  assert.match(
    assistantRoute,
    /This draft was already processed\. Reload the assistant view\./,
  );
  assert.match(
    assistantRoute,
    /inArray\(assistantAnnouncementDrafts\.status, \[/,
  );
  assert.match(assistantRoute, /"needs_review",\s*"rejected"/);
  assert.match(assistantRoute, /const resumingPublish/);
  assert.match(
    assistantRoute,
    /eventType: "shift_swap_announcement_published"/,
  );
  assert.match(assistantRoute, /交代募集のお知らせを配信しました/);
  assert.match(chat, /承認して配信/);
  assert.match(chat, /差戻し/);
});
