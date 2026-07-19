import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const logPath = resolve(root, "logs/api-scenarios.jsonl");
const statePath = resolve(root, "logs/scenario-state.json");
const results = [];
const findings = [];

await mkdir(dirname(logPath), { recursive: true });

async function request(user, method, path, body, extraHeaders = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "x-dev-user-id": user,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const entry = { at: new Date().toISOString(), user, method, path, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10, data };
  results.push(entry);
  return entry;
}

function status(entry, expected, label) {
  assert.equal(entry.status, expected, `${label}: expected ${expected}, got ${entry.status}: ${JSON.stringify(entry.data)}`);
}

const owner = "qa-owner@local.test";
const editor = "qa-editor@local.test";
const memberA = "qa-member-a@local.test";
const memberB = "qa-member-b@local.test";
const outsider = "qa-outsider@local.test";

const created = await request(owner, "POST", "/api/groups", { name: "QA受入テスト店舗", description: "2026-07-19 業務シナリオ" });
status(created, 201, "group create");
const groupId = created.data.group.id;

for (const user of [editor, memberA, memberB]) {
  status(await request(user, "POST", `/api/groups/${groupId}/join`), 201, `join ${user}`);
}
const joins = await request(owner, "GET", `/api/groups/${groupId}/requests`);
status(joins, 200, "list join requests");
for (const row of joins.data.requests) {
  status(await request(owner, "POST", `/api/groups/${groupId}/requests`, { requestId: row.id, action: "approve" }), 200, `approve ${row.userEmail}`);
}
status(await request(owner, "PATCH", `/api/groups/${groupId}/members`, { userEmail: editor, role: "editor", adminNote: "副店長評価: 外部非公開" }), 200, "promote editor");
status(await request(owner, "PATCH", `/api/groups/${groupId}/members`, { userEmail: memberA, adminNote: "評価情報: memberには見せない" }), 200, "set admin note");

const memberGroup = await request(memberA, "GET", `/api/groups/${groupId}`);
status(memberGroup, 200, "member group detail");
if (JSON.stringify(memberGroup.data).includes("評価情報")) findings.push({ id: "P-01-API", detail: "member本人のmembershipにadminNoteが含まれる" });
status(await request(memberA, "PATCH", `/api/groups/${groupId}/members`, { userEmail: memberB, adminNote: "改ざん" }), 403, "member cannot update peer");
status(await request(outsider, "GET", `/api/groups/${groupId}`), 403, "outsider cannot read group");

status(await request(memberA, "PATCH", `/api/groups/${groupId}/preferences`, {
  minDays: 2, maxDays: 4, minHours: 8, maxHours: 24, freeComment: "夕方希望",
  availability: [
    { dayOfWeek: 1, status: "want", startTime: "17:00", endTime: "22:00", note: "月曜" },
    { dayOfWeek: 2, status: "off", startTime: "", endTime: "", note: "火曜休み" },
  ],
}), 200, "save preferences");

const shift = await request(owner, "POST", "/api/shifts", {
  groupId,
  name: "QA 8月前半",
  startDate: "2026-08-03",
  endDate: "2026-08-04",
  requestCloseDate: "2026-07-31",
  openingTime: "17:00",
  closingTime: "26:00",
  slotMinutes: 120,
  slotRules: [{ role: "ホール", requiredCount: 1 }, { role: "厨房", requiredCount: 1 }],
});
status(shift, 201, "create shift plan");
const planId = shift.data.plan.id;
let detail = await request(owner, "GET", `/api/shifts/${planId}`);
status(detail, 200, "get plan");
const periodId = detail.data.requestPeriod.id;
status(await request(owner, "PATCH", `/api/shifts/${planId}`, { action: "start-requests", requestCloseDate: "2026-07-31" }), 200, "start requests");

const requestRows = detail.data.slots.slice(0, 2).map((slot, index) => ({
  date: slot.date, startTime: slot.startTime, endTime: slot.endTime,
  preference: index === 0 ? "want" : "possible", note: "APIシナリオ",
}));
for (let i = 0; i < 2; i += 1) {
  status(await request(memberA, "POST", "/api/shift-requests", { action: "save-requests", groupId, periodId, requests: requestRows }), 200, `save requests ${i + 1}`);
}
status(await request(memberA, "PATCH", `/api/shifts/${planId}`, { assignments: {}, status: "published" }), 403, "member cannot publish");

detail = await request(owner, "GET", `/api/shifts/${planId}`);
const firstSlot = detail.data.slots[0];
const nightSlot = detail.data.slots.find((slot) => slot.endTime === "25:00" || slot.endTime === "26:00") ?? detail.data.slots.at(-1);
const assignments = Object.fromEntries(detail.data.slots.map((slot) => [slot.id, []]));
assignments[firstSlot.id] = [memberA];
assignments[nightSlot.id] = [...new Set([...(assignments[nightSlot.id] ?? []), memberB])];
const published = await request(owner, "PATCH", `/api/shifts/${planId}`, { assignments, status: "published" });
status(published, 200, "publish plan");

const futureStart = await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "start", slotId: firstSlot.id });
status(futureStart, 201, "start assigned future shift");
const recordId = futureStart.data.record.id;
status(await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "start", slotId: firstSlot.id }), 409, "duplicate start");
status(await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "break-start", recordId }), 200, "break start");
status(await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "break-start", recordId }), 409, "duplicate break start");
status(await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "break-end", recordId }), 200, "break end");
status(await request(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "end", recordId }), 200, "work end");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "apply-schedule", recordId }), 200, "apply schedule");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "submit-claim", recordId }), 200, "submit claim");
status(await request(owner, "PATCH", `/api/groups/${groupId}/work-records`, { recordId, status: "rejected", managerNote: "再確認" }), 200, "reject daily claim");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "apply-schedule", recordId }), 200, "edit rejected claim");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "submit-claim", recordId }), 200, "resubmit claim");
status(await request(owner, "PATCH", `/api/groups/${groupId}/work-records`, { recordId, status: "approved", managerNote: "確認済み" }), 200, "approve daily claim");

status(await request(memberA, "POST", `/api/groups/${groupId}/monthly-work`, { action: "submit", month: "2026-08" }), 200, "submit month");
status(await request(owner, "POST", `/api/groups/${groupId}/monthly-work`, { action: "approve", month: "2026-08", userEmail: memberA, managerNote: "月次確認済み" }), 200, "approve month");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "apply-schedule", recordId }), 409, "monthly lock");
status(await request(owner, "POST", `/api/groups/${groupId}/monthly-work`, { action: "reopen", month: "2026-08", userEmail: memberA }), 200, "reopen month");

const memberRecords = await request(memberA, "GET", `/api/groups/${groupId}/work-records`);
status(memberRecords, 200, "member work records");
assert.equal(memberRecords.data.records.every((row) => row.userEmail === memberA), true, "member received another user's record");
status(await request(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { recordId: "not-owned", status: "approved" }), 403, "member cannot approve");

await writeFile(logPath, results.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
await writeFile(statePath, JSON.stringify({ baseUrl, owner, editor, memberA, memberB, outsider, groupId, planId, periodId, firstSlotId: firstSlot.id, nightSlotId: nightSlot.id, recordId, findings }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: true, requests: results.length, findings, groupId, planId, recordId, logPath, statePath }, null, 2));
