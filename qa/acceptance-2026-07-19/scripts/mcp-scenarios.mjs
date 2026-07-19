import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const state = JSON.parse(await readFile(resolve(root, "logs/scenario-state.json"), "utf8"));
const rows = [];

async function jsonFetch(path, options) {
  const started = performance.now();
  const response = await fetch(`${state.baseUrl}${path}`, options);
  const data = await response.json();
  rows.push({ at: new Date().toISOString(), path, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10, data });
  return { response, data };
}

async function token(user, name) {
  const { response, data } = await jsonFetch("/api/api-key", { method: "POST", headers: { "x-dev-user-id": user, "content-type": "application/json" }, body: JSON.stringify({ name }) });
  assert.equal(response.status, 201);
  return data.key;
}

let rpcId = 0;
async function mcp(key, method, params = {}) {
  const result = await jsonFetch("/mcp", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  return result.data;
}

const ownerKey = await token(state.owner, "QA MCP owner");
const memberKey = await token(state.memberA, "QA MCP member");

const initialized = await mcp(ownerKey, "initialize");
assert.equal(initialized.result.serverInfo.name, "my-day");
const listed = await mcp(ownerKey, "tools/list");
assert.ok(listed.result.tools.length >= 20);

const memberList = await mcp(memberKey, "tools/call", { name: "get_group_members", arguments: { groupId: state.groupId } });
const memberListText = memberList.result.content[0].text;
const leakedAdminNote = memberListText.includes("評価情報") || memberListText.includes("副店長評価");

const noConfirm = await mcp(ownerKey, "tools/call", { name: "create_shift_plan", arguments: { groupId: state.groupId, name: "確認なし", startDate: "2026-09-01", endDate: "2026-09-01" } });
assert.equal(noConfirm.result.isError, true);

const outsiderKey = await token(state.outsider, "QA MCP outsider");
const outsider = await mcp(outsiderKey, "tools/call", { name: "get_shift_plan", arguments: { planId: state.planId } });
assert.equal(outsider.result.isError, true);

const groups = await mcp(memberKey, "tools/call", { name: "list_groups", arguments: {} });
assert.equal(groups.result.isError, undefined);

await mcp(memberKey, "tools/call", { name: "save_group_preferences", arguments: { groupId: state.groupId, confirm: true, minDays: 2, maxDays: 4, minHours: 8, maxHours: 24, availability: [{ dayOfWeek: 1, status: "want", startTime: "17:00", endTime: "22:00" }] } });
const prefsAfterMcp = await mcp(memberKey, "tools/call", { name: "get_group_preferences", arguments: { groupId: state.groupId } });
const parsedPrefs = JSON.parse(prefsAfterMcp.result.content[0].text);
const mcpDroppedUiPreference = parsedPrefs.availability.length === 0;

const createdByMcp = await mcp(ownerKey, "tools/call", { name: "create_shift_plan", arguments: { groupId: state.groupId, name: "MCP 15分互換性", startDate: "2026-09-01", endDate: "2026-09-01", openingTime: "09:00", closingTime: "09:30", slotMinutes: 15, requestPeriod: { name: "MCP希望", opensOn: "2026-07-19", closesOn: "2026-08-20" }, confirm: true } });
const createdMcpData = JSON.parse(createdByMcp.result.content[0].text);
const planByMcp = await mcp(ownerKey, "tools/call", { name: "get_shift_plan", arguments: { planId: createdMcpData.planId } });
const parsedPlan = JSON.parse(planByMcp.result.content[0].text);
const firstMcpSlot = parsedPlan.slots[0];
const requestData = await jsonFetch(`/api/shift-requests?groupId=${state.groupId}`, { headers: { "x-dev-user-id": state.memberA } });
const mcpPeriod = requestData.data.periods.find((period) => period.planId === createdMcpData.planId);
await mcp(memberKey, "tools/call", { name: "save_shift_requests", arguments: { groupId: state.groupId, periodId: mcpPeriod.id, requests: [{ date: firstMcpSlot.date, startTime: firstMcpSlot.startTime, endTime: firstMcpSlot.endTime, preference: "want" }], confirm: true } });
const planAfterRequest = await jsonFetch(`/api/shifts/${createdMcpData.planId}`, { headers: { "x-dev-user-id": state.owner } });
const mcpMissingSubmission = planAfterRequest.data.requestSubmissions.length === 0;
await mcp(ownerKey, "tools/call", { name: "set_shift_assignments", arguments: { planId: createdMcpData.planId, assignments: { [firstMcpSlot.id]: [state.memberA] }, status: "published", confirm: true } });
const calendarAfterPublish = await jsonFetch("/api/calendar", { headers: { "x-dev-user-id": state.owner } });
const mcpMissingCalendarEvent = !calendarAfterPublish.data.events.some((event) => event.shiftPlanId === createdMcpData.planId);
const auditAfterMcp = await jsonFetch(`/api/groups/${state.groupId}/audit-logs`, { headers: { "x-dev-user-id": state.owner } });
const mcpMissingAudit = !auditAfterMcp.data.logs.some((log) => log.entityId === createdMcpData.planId);

const summary = { ok: !(leakedAdminNote || mcpDroppedUiPreference || mcpMissingSubmission || mcpMissingCalendarEvent || mcpMissingAudit), leakedAdminNote, toolCount: listed.result.tools.length, hasAttendanceTools: listed.result.tools.some((tool) => /work|attendance|clock|break|monthly/i.test(tool.name)), mcpDroppedUiPreference, accepts15MinuteSlots: createdMcpData.slotCount === 2, mcpMissingSubmission, mcpMissingCalendarEvent, mcpMissingAudit, mcpPlanId: createdMcpData.planId };
await writeFile(resolve(root, "logs/mcp-scenarios.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
await writeFile(resolve(root, "logs/mcp-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));
if (leakedAdminNote) process.exitCode = 2;
