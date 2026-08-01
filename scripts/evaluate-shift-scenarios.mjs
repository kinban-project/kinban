#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PRIORITIES = ["preference", "labor", "fairness", "minimal"];
const SCOPES = ["unfilled", "problems", "all"];
const SEEDS = ["evaluation-a", "evaluation-b"];
const SCENARIOS = [
  { id: "demo-store", label: "Demo store", planId: "seed-plan-august-first", user: "tanaka" },
  { id: "demo-nightclub", label: "Demo nightclub", planId: "seed-night-cast-plan-august-month", user: "night-manager" },
  { id: "cafe-peak", label: "Cafe weekday peak", planId: "eval-plan-cafe", user: "tanaka" },
  { id: "cross-midnight-event", label: "Cross-midnight event", planId: "eval-plan-event", user: "tanaka" },
  { id: "sudden-absence", label: "Sudden absence", planId: "eval-plan-absence", user: "tanaka" },
];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = arg("--base-url", process.env.KINBAN_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const defaultUser = arg("--user", process.env.KINBAN_DEMO_USER || "tanaka");
const outputDir = arg("--output", "qa/shift-evaluation/runs");
const keepScenarios = process.argv.includes("--keep-scenarios");

function minutes(value) {
  const [hours, mins] = String(value || "0:0").split(":").map(Number);
  return (hours * 60) + mins;
}

function overlaps(left, right) {
  return left.date === right.date && minutes(left.startTime) < minutes(right.endTime) && minutes(right.startTime) < minutes(left.endTime);
}

function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function availabilityStatus(data, email, slot) {
  const request = (data.requests || []).find((item) => item.userEmail === email && item.date === slot.date && item.startTime === slot.startTime && item.endTime === slot.endTime);
  if (request) return request.preference === "want" ? "want" : ["off", "unavailable"].includes(request.preference) ? request.preference : "possible";
  const rows = (data.memberAvailability || []).filter((item) => item.userEmail === email && item.dayOfWeek === weekday(slot.date));
  if (!rows.length) return "possible";
  const matching = rows.find((item) => !item.startTime || (minutes(item.startTime) <= minutes(slot.startTime) && minutes(item.endTime) >= minutes(slot.endTime)));
  return matching?.status === "want" ? "want" : ["off", "unavailable"].includes(matching?.status) ? matching.status : matching ? "possible" : "unavailable";
}

function scoreCandidate(data, assignments, generated) {
  const slots = data.slots || [];
  const members = new Set((data.members || []).map((member) => member.userEmail));
  const rows = slots.flatMap((slot) => (assignments[slot.id] || []).filter((email) => members.has(email)).map((userEmail) => ({ ...slot, userEmail })));
  const unfilled = slots.filter((slot) => (assignments[slot.id] || []).length < slot.requiredCount).length;
  const overfilled = slots.filter((slot) => (assignments[slot.id] || []).length > slot.requiredCount).length;
  const unavailable = rows.filter((row) => ["off", "unavailable"].includes(availabilityStatus(data, row.userEmail, row))).length;
  let overlapCount = 0;
  const overlapPairs = [];
  for (let index = 0; index < rows.length; index += 1) {
    for (let next = index + 1; next < rows.length; next += 1) {
      if (rows[index].userEmail === rows[next].userEmail && overlaps(rows[index], rows[next])) {
        overlapCount += 1;
        overlapPairs.push(`${rows[index].userEmail}:${rows[index].date}`);
      }
    }
  }
  const minutesByMember = new Map();
  for (const row of rows) minutesByMember.set(row.userEmail, (minutesByMember.get(row.userEmail) || 0) + Math.max(0, minutes(row.endTime) - minutes(row.startTime)));
  const workloads = [...minutesByMember.values()];
  const workloadSpread = workloads.length ? Math.max(...workloads) - Math.min(...workloads) : 0;
  const preferenceConflicts = unavailable;
  const hardViolations = unavailable + overlapCount;
  const score = (hardViolations * 1000) + (unfilled * 100) + (overfilled * 50) + ((generated?.warnings || []).length * 5) + (preferenceConflicts * 20) + Math.round(workloadSpread / 60);
  return { score, hardViolations, unfilled, overfilled, unavailable, overlapCount, preferenceConflicts, warningCount: (generated?.warnings || []).length, assignedCount: rows.length, workloadSpreadMinutes: workloadSpread, overlapPairs: [...new Set(overlapPairs)].slice(0, 20) };
}

async function requestJson(url, init = {}, user = defaultUser) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", "x-demo-user-id": user, ...(init.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`${response.status} ${url}: invalid JSON`); }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.error || "request failed"}`);
  return body;
}

async function evaluateScenario(scenario) {
  let data;
  try { data = await requestJson(`${baseUrl}/api/shifts/${encodeURIComponent(scenario.planId)}`, {}, scenario.user); }
  catch (error) { return { ...scenario, status: "skipped", reason: String(error.message || error) }; }
  if (data.plan?.status !== "draft") return { ...scenario, status: "skipped", reason: `plan status is ${data.plan?.status || "unknown"}` };
  const candidates = [];
  for (const priority of PRIORITIES) {
    for (const allocationScope of SCOPES) {
      for (const seed of SEEDS) {
        const name = `evaluation-${scenario.id}-${priority}-${allocationScope}-${seed}`;
        const generated = await requestJson(`${baseUrl}/api/shifts/${encodeURIComponent(scenario.planId)}/scenarios`, { method: "POST", body: JSON.stringify({ action: "auto", name, description: "Issue #93 evaluation candidate", seed, settings: { priority, allocationScope, laborMode: "avoid", unavailableMode: "exclude" } }) }, scenario.user);
        const scenarioRow = generated.scenario;
        const result = scoreCandidate(data, generated.generated?.assignments || scenarioRow?.assignments || {}, generated.generated);
        candidates.push({ priority, allocationScope, seed, ...result });
        if (!keepScenarios && scenarioRow?.id) await requestJson(`${baseUrl}/api/shifts/${encodeURIComponent(scenario.planId)}/scenarios/${encodeURIComponent(scenarioRow.id)}`, { method: "DELETE" }, scenario.user);
      }
    }
  }
  candidates.sort((left, right) => left.score - right.score || left.hardViolations - right.hardViolations);
  return { ...scenario, status: "completed", plan: { id: data.plan.id, name: data.plan.name, status: data.plan.status, slotCount: data.slots.length }, candidateCount: candidates.length, best: candidates[0], candidates };
}

const results = [];
for (const scenario of SCENARIOS) results.push(await evaluateScenario(scenario));
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  defaultUser,
  matrix: { priorities: PRIORITIES, allocationScopes: SCOPES, seeds: SEEDS },
  results,
  aiComparison: { status: "not-run", note: "Run the same scorer against an AI-produced assignment snapshot before accepting an AI candidate." },
};

await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await fs.writeFile(path.join(outputDir, `report-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const lines = [
  "# Shift assignment evaluation report",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Target: ${baseUrl}`,
  `- Matrix: ${PRIORITIES.length} priorities x ${SCOPES.length} scopes x ${SEEDS.length} seeds`,
  "",
  "| Scenario | Status | Candidates | Best score | Unfilled | Overlap | Unavailable | Warnings |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
];
for (const result of results) lines.push(`| ${result.label} | ${result.status}${result.reason ? ` (${result.reason})` : ""} | ${result.candidateCount || 0} | ${result.best?.score ?? "-"} | ${result.best?.unfilled ?? "-"} | ${result.best?.overlapCount ?? "-"} | ${result.best?.unavailable ?? "-"} | ${result.best?.warningCount ?? "-"} |`);
lines.push("", "## Scoring", "", "Hard violations are weighted first: unavailable assignment or overlap, then shortages, overfill, warnings, preference conflicts, and workload spread. The score is comparative; it is not an automatic approval decision.", "", "## AI comparison", "", report.aiComparison.note);
await fs.writeFile(path.join(outputDir, `report-${stamp}.md`), `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputDir, results: results.map((result) => ({ id: result.id, status: result.status, candidateCount: result.candidateCount, best: result.best, reason: result.reason })) }, null, 2));
