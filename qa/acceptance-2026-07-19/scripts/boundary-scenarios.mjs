import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const state = JSON.parse(await readFile(resolve(root, "logs/scenario-state.json"), "utf8"));
const rows = [];
const findings = [];

async function call(user, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${state.baseUrl}${path}`, { method, headers: { "x-dev-user-id": user, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const row = { user, method, path, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10, data };
  rows.push(row);
  return row;
}

const expiredPlan = await call(state.owner, "POST", "/api/shifts", { groupId: state.groupId, name: "締切経過テスト", startDate: "2026-08-10", endDate: "2026-08-10", requestCloseDate: "2026-07-18", openingTime: "09:00", closingTime: "11:00", slotMinutes: 120, slotRules: [{ role: "共通", requiredCount: 1 }] });
const expiredPlanId = expiredPlan.data.plan.id;
let expiredDetail = await call(state.owner, "GET", `/api/shifts/${expiredPlanId}`);
await call(state.owner, "PATCH", `/api/shifts/${expiredPlanId}`, { action: "start-requests", requestCloseDate: "2026-07-18" });
expiredDetail = await call(state.memberA, "GET", `/api/shifts/${expiredPlanId}`);
const expiredSlot = expiredDetail.data.slots[0];
const expiredSave = await call(state.memberA, "POST", "/api/shift-requests", { action: "save-requests", groupId: state.groupId, periodId: expiredDetail.data.requestPeriod.id, requests: [{ date: expiredSlot.date, startTime: expiredSlot.startTime, endTime: expiredSlot.endTime, preference: "want" }] });
if (expiredSave.status === 200) findings.push({ id: "S-06", severity: "High", detail: "締切日経過後も希望受付status=openのまま保存できる" });

const nightClaim = await call(state.memberB, "POST", `/api/groups/${state.groupId}/work-records`, { action: "create-claim", slotId: state.nightSlotId, claimedStartAt: "2026-08-03T22:00", claimedEndAt: "2026-08-04T02:00" });
const nightRecordId = nightClaim.data.record?.id;
if (nightClaim.status === 201) {
  const endDate = nightClaim.data.record.claimedEndAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(nightClaim.data.record.claimedEndAt)) : null;
  if (endDate === "2026-08-04") findings.push({ id: "A-04", severity: "Pass", detail: "26:00が翌日ISO時刻に正規化された" });
  const monthSubmit = await call(state.memberB, "POST", `/api/groups/${state.groupId}/monthly-work`, { action: "submit", month: "2026-08" });
  const monthApprove = await call(state.owner, "POST", `/api/groups/${state.groupId}/monthly-work`, { action: "approve", month: "2026-08", userEmail: state.memberB, managerNote: "日次未申告のまま承認テスト" });
  if (monthSubmit.status === 200 && monthApprove.status === 200) findings.push({ id: "M-04", severity: "High", detail: "日次status=unsubmittedの勤務が残っていても月次提出・承認できる" });
}

const futureStart = rows.find((row) => row.path.includes("work-records") && row.data?.record?.scheduledDate > "2026-07-19");
await writeFile(resolve(root, "logs/boundary-scenarios.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
await writeFile(resolve(root, "logs/boundary-summary.json"), JSON.stringify({ findings, expiredPlanId, nightRecordId, futureStart: futureStart ?? null }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ findings, expiredPlanId, nightRecordId }, null, 2));
