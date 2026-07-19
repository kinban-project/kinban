import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const raw = [];

async function timed(user, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "x-dev-user-id": user, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = { user, method, path, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10, bytes: Buffer.byteLength(text), data: text ? JSON.parse(text) : null };
  raw.push({ ...result, data: undefined });
  return result;
}

function stats(name, items) {
  const times = items.map((item) => item.ms).sort((a, b) => a - b);
  const pick = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0;
  return { name, count: items.length, ok: items.filter((item) => item.status < 400).length, p50: pick(0.5), p95: pick(0.95), max: times.at(-1) ?? 0, maxBytes: Math.max(...items.map((item) => item.bytes), 0) };
}

const owner = "scale-user-001@local.test";
const groupList = await timed(owner, "GET", "/api/groups");
assert.equal(groupList.status, 200);

const endpoints = [
  "/api/groups/scale-group-01",
  "/api/shifts?groupId=scale-group-01",
  "/api/shifts/scale-plan-big",
  "/api/groups/scale-group-01/work-records",
  "/api/groups/scale-group-01/monthly-work?month=2026-08",
];
const serial = [];
for (const path of endpoints) for (let i = 0; i < 10; i += 1) serial.push(await timed(owner, "GET", path));

const concurrentReads = await Promise.all(Array.from({ length: 50 }, (_, i) => timed(`scale-user-${String(i + 1).padStart(3, "0")}@local.test`, "GET", "/api/groups/scale-group-01")));
const concurrentPreferences = await Promise.all(Array.from({ length: 50 }, (_, i) => timed(`scale-user-${String(i + 1).padStart(3, "0")}@local.test`, "PATCH", "/api/groups/scale-group-01/preferences", { minDays: 1, maxDays: 5, minHours: 4, maxHours: 40, freeComment: `同時保存${i + 1}`, availability: [{ dayOfWeek: i % 7, status: "possible", startTime: "09:00", endTime: "17:00" }] })));
const starts = await Promise.all(Array.from({ length: 50 }, (_, i) => timed(`scale-user-${String(i + 1).padStart(3, "0")}@local.test`, "POST", "/api/groups/scale-group-01/work-records", { action: "start", note: "負荷テスト" })));
const ends = await Promise.all(starts.filter((item) => item.status === 201).map((item, i) => timed(`scale-user-${String(i + 1).padStart(3, "0")}@local.test`, "POST", "/api/groups/scale-group-01/work-records", { action: "end", recordId: item.data.record.id })));
const raceUser = "scale-user-100@local.test";
const sameUserStarts = await Promise.all(Array.from({ length: 20 }, () => timed(raceUser, "POST", "/api/groups/scale-group-01/work-records", { action: "start", note: "同一ユーザー同時送信" })));
const raceSuccesses = sameUserStarts.filter((item) => item.status === 201);
const sameUserEnds = await Promise.all(raceSuccesses.map((item) => timed(raceUser, "POST", "/api/groups/scale-group-01/work-records", { action: "end", recordId: item.data.record.id })));

const summary = {
  at: new Date().toISOString(),
  fixture: { groupsVisibleToScaleOwner: groupList.data.groups.length, groupCount: 5, bigGroupMembers: 100, slots: 248, assignments: 496 },
  measurements: [
    stats("serial mixed reads", serial),
    stats("50 concurrent group reads", concurrentReads),
    stats("50 concurrent preference saves", concurrentPreferences),
    stats("50 concurrent clock starts", starts),
    stats("clock ends", ends),
    { ...stats("20 duplicate clock starts for one user", sameUserStarts), createdRecords: raceSuccesses.length },
    stats("duplicate-start cleanup ends", sameUserEnds),
  ],
};
await writeFile(resolve(root, "logs/load-raw.jsonl"), raw.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
await writeFile(resolve(root, "logs/load-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));
