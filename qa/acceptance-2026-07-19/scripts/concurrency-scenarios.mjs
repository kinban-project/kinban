import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const state = JSON.parse(await readFile(resolve(root, "logs/scenario-state.json"), "utf8"));

async function request(user, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${state.baseUrl}${path}`, {
    method,
    headers: { "x-dev-user-id": user, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { user, method, path, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10, data: text ? JSON.parse(text) : null };
}

const detail = await request(state.owner, "GET", `/api/shifts/${state.planId}`, undefined);
const existing = Object.fromEntries(detail.data.slots.map((slot) => [slot.id, detail.data.assignments.filter((assignment) => assignment.slotId === slot.id).map((assignment) => assignment.userEmail)]));
const ownerVersion = { ...existing, [state.firstSlotId]: [state.memberA] };
const editorVersion = { ...existing, [state.firstSlotId]: [state.memberB] };
const [ownerResult, editorResult] = await Promise.all([
  request(state.owner, "PATCH", `/api/shifts/${state.planId}`, { assignments: ownerVersion, status: "published", reason: "同時更新A" }),
  request(state.editor, "PATCH", `/api/shifts/${state.planId}`, { assignments: editorVersion, status: "published", reason: "同時更新B" }),
]);
const finalDetail = await request(state.owner, "GET", `/api/shifts/${state.planId}`, undefined);
const finalUsers = finalDetail.data.assignments.filter((assignment) => assignment.slotId === state.firstSlotId).map((assignment) => assignment.userEmail);
const finding = ownerResult.status === 200 && editorResult.status === 200
  ? { id: "C-02", severity: "High", detail: "同じシフトへの同時更新が両方200となり、競合検知なしで片方が上書きされる", finalUsers }
  : null;
const result = { at: new Date().toISOString(), ownerResult, editorResult, finalUsers, finding };
await writeFile(resolve(root, "logs/concurrency-summary.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));
