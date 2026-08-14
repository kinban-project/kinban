import assert from "node:assert/strict";

const baseUrl = (process.env.KINBAN_RUNTIME_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const groupId = process.env.KINBAN_RUNTIME_GROUP_ID || "seed-group-yakiniku";
const planId = process.env.KINBAN_RUNTIME_PLAN_ID || "seed-yakiniku-plan-august-first";
const managerDemoUserId = process.env.KINBAN_RUNTIME_MANAGER_ID || "yakiniku-manager";

async function jsonFetch(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

function rpcCall(url, token, id, name, args = {}) {
  return jsonFetch("/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

async function rpcRequest(token, id, method, params = {}) {
  return jsonFetch("/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

function mcpResult(body) {
  body = body.body ?? body;
  assert.equal(body?.error, undefined, `MCP JSON-RPC error: ${JSON.stringify(body?.error)}`);
  const text = body?.result?.content?.find((item) => item.type === "text")?.text;
  assert.equal(typeof text, "string", `MCP response did not contain text content: ${JSON.stringify(body)}`);
  return JSON.parse(text);
}

const demoHeaders = { "x-demo-user-id": managerDemoUserId };
const detail = await jsonFetch(`/api/shifts/${encodeURIComponent(planId)}`, { headers: demoHeaders });
assert.equal(detail.response.status, 200, `shift detail failed: ${detail.response.status}`);
const slots = detail.body.slots ?? [];
const members = detail.body.members ?? [];
const dutySlot = slots.find((slot) => slot.dutyId);
assert.ok(dutySlot, "seed plan did not contain a duty-bound slot");
const incapableMember = members.find((member) => !member.dutyIds?.includes(dutySlot.dutyId));
assert.ok(incapableMember, "seed plan did not contain a member incapable of the selected duty");

const apiAttempt = await jsonFetch(`/api/shifts/${encodeURIComponent(planId)}`, {
  method: "PATCH",
  headers: { ...demoHeaders, "content-type": "application/json" },
  body: JSON.stringify({
    expectedVersion: detail.body.plan.version,
    assignments: { [dutySlot.id]: [incapableMember.userEmail] },
  }),
});
assert.equal(apiAttempt.response.status, 409, "HTTP API accepted an incapable duty assignment");
assert.ok(apiAttempt.body?.dutyErrors?.length, "HTTP API did not return dutyErrors");

const access = await jsonFetch(`/api/groups/${encodeURIComponent(groupId)}/assistant/access`, {
  method: "POST",
  headers: { ...demoHeaders, "content-type": "application/json" },
  body: JSON.stringify({ name: "runtime-duty-assignment-test" }),
});
assert.equal(access.response.status, 201, `assistant key issuance failed: ${access.response.status}`);
assert.equal(typeof access.body?.key, "string", "assistant key was not issued");
const token = access.body.key;

const planning = mcpResult(await rpcCall(baseUrl, token, 1, "get_shift_planning_context", { planId }));
assert.ok(planning.slots?.some((slot) => slot.dutyId), "MCP planning context omitted duty-bound slots");
const mcpMember = planning.members?.find((member) => member.userEmail === incapableMember.userEmail);
assert.ok(mcpMember && !mcpMember.dutyIds?.includes(dutySlot.dutyId), "MCP planning context omitted member duty capabilities");

const candidate = mcpResult(await rpcCall(baseUrl, token, 2, "validate_shift_assignment_candidate", {
  planId,
  assignments: { [dutySlot.id]: [incapableMember.userEmail] },
}));
assert.ok(candidate.errors?.some((issue) => issue.type === "duty_conflict"), "MCP candidate validation missed duty conflict");

const storeAccess = await jsonFetch("/api/groups/seed-group-store/assistant/access", {
  method: "POST",
  headers: { "x-demo-user-id": "tanaka", "content-type": "application/json" },
  body: JSON.stringify({ name: "runtime-duty-unassigned-slot-test" }),
});
assert.equal(storeAccess.response.status, 201, `store assistant key issuance failed: ${storeAccess.response.status}`);
const storeToken = storeAccess.body?.key;
assert.equal(typeof storeToken, "string", "store assistant key was not issued");
const storePlanning = mcpResult(await rpcCall(baseUrl, storeToken, 4, "get_shift_planning_context", { planId: "seed-plan-august-first" }));
const unassignedSlot = storePlanning.slots?.find((slot) => !slot.dutyId);
const unassignedMember = storePlanning.members?.find((member) => member.status === "active");
assert.ok(unassignedSlot && unassignedMember, "seed store plan did not contain an unassigned slot and active member");
const unassignedCandidate = mcpResult(await rpcCall(baseUrl, storeToken, 5, "validate_shift_assignment_candidate", {
  planId: "seed-plan-august-first",
  assignments: { [unassignedSlot.id]: [unassignedMember.userEmail] },
}));
assert.ok(!unassignedCandidate.errors?.some((issue) => issue.type === "duty_conflict"), "MCP rejected a member on a duty-unassigned slot");

const listedResponse = await rpcRequest(token, 3, "tools/list");
assert.equal(listedResponse.body?.error, undefined, `MCP tools/list error: ${JSON.stringify(listedResponse.body?.error)}`);
assert.ok(listedResponse.body?.result?.tools?.some((tool) => tool.name === "validate_shift_assignment_candidate"), "MCP tool list omitted candidate validation");

console.log(JSON.stringify({
  ok: true,
  planId,
  dutySlotId: dutySlot.id,
  dutyId: dutySlot.dutyId,
  incapableMember: incapableMember.userEmail,
  httpStatus: apiAttempt.response.status,
  mcpDutyConflict: true,
  mcpMemberCapabilities: mcpMember.dutyIds,
  mcpUnassignedSlotAccepted: true,
}, null, 2));
