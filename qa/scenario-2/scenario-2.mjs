import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3003";
const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const outputDir = resolve(root, "qa/scenario-2");
const results = [];
let rpcId = 0;

const owner = "tanaka@local.test";
const memberA = "member02@local.test";
const memberB = "member03@local.test";
const groupId = "seed-group-store";

async function api(user, method, path, body) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "x-dev-user-id": user,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const row = { kind: "api", user, method, path, status: response.status, ms: Math.round(performance.now() - started), data };
  results.push(row);
  return row;
}

function readEnvFile(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

const agentRoot = process.env.KINBAN_AGENT_DIR ?? "D:\\coconara\\kinban-manager-agent";
const agentEnv = readEnvFile(await readFile(resolve(agentRoot, ".env.local"), "utf8"));
const mcpUrl = agentEnv.KINBAN_MCP_URL ?? `${baseUrl}/mcp`;
const assistantKey = agentEnv.KINBAN_ASSISTANT_API_KEY;
assert.ok(assistantKey, "KINBAN_ASSISTANT_API_KEY is required in kinban-manager-agent/.env.local");

async function mcp(name, args = {}) {
  const started = performance.now();
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${assistantKey}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const data = await response.json();
  const row = { kind: "mcp", name, status: response.status, ms: Math.round(performance.now() - started), isError: Boolean(data?.result?.isError), data };
  results.push(row);
  return row;
}

function jsonText(row) {
  const text = row?.data?.result?.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : null;
}

async function step(name, fn) {
  try {
    const value = await fn();
    results.push({ kind: "step", name, status: "passed" });
    return value;
  } catch (error) {
    results.push({ kind: "step", name, status: "failed", error: String(error?.stack ?? error) });
    return null;
  }
}

const summary = { baseUrl, groupId, passed: 0, failed: 0, planId: null, recordId: null, checks: [] };

await step("seed group is available", async () => {
  const row = await api(owner, "GET", "/api/groups");
  assert.equal(row.status, 200);
  assert.ok(row.data.groups.some((group) => group.id === groupId));
});

await step("MCP read connection", async () => {
  const row = await mcp("list_groups", {});
  assert.equal(row.status, 200);
  assert.equal(row.isError, false);
});

const created = await step("manager creates a shift plan", async () => {
  const row = await api(owner, "POST", "/api/shifts", {
    groupId,
    name: "シナリオ2 8月後半",
    startDate: "2026-08-20",
    endDate: "2026-08-21",
    requestCloseDate: "2026-08-10",
    openingTime: "17:00",
    closingTime: "26:00",
    slotMinutes: 120,
    slotRules: [
      { role: "ホール", requiredCount: 1 },
      { role: "厨房", requiredCount: 1 },
    ],
  });
  assert.equal(row.status, 201);
  summary.planId = row.data.plan.id;
  return row.data.plan.id;
});

if (created) {
  const detail = await step("manager starts request period", async () => {
    const row = await api(owner, "PATCH", `/api/shifts/${created}`, { action: "start-requests", requestCloseDate: "2026-08-10" });
    assert.equal(row.status, 200);
    const get = await api(owner, "GET", `/api/shifts/${created}`);
    assert.equal(get.status, 200);
    assert.equal(get.data.requestPeriod.status, "open");
    return get.data;
  });

  if (detail) {
    const slots = detail.slots;
    const requestRows = slots.slice(0, 2).map((slot, index) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      preference: index === 0 ? "want" : "possible",
      note: "シナリオテスト2の希望",
    }));

    await step("member saves shift requests", async () => {
      const row = await api(memberA, "POST", "/api/shift-requests", { action: "save-requests", groupId, periodId: detail.requestPeriod.id, requests: requestRows, requestComment: "テスト用の希望コメント" });
      assert.equal(row.status, 200);
    });

    await step("MCP reads request overview", async () => {
      const row = await mcp("get_shift_request_overview", { groupId, periodId: detail.requestPeriod.id });
      assert.equal(row.status, 200);
      assert.equal(row.isError, false);
      const overview = jsonText(row);
      assert.ok(overview);
      assert.ok(JSON.stringify(overview).includes(memberA));
    });

    await step("MCP checks assignment warnings", async () => {
      const row = await mcp("check_shift_assignments", { planId: created });
      assert.equal(row.status, 200);
      assert.equal(row.isError, false);
      const check = jsonText(row);
      assert.ok(check);
      summary.checks.push({ beforeAssignment: check });
    });

    const assignments = Object.fromEntries(slots.map((slot) => [slot.id, []]));
    if (slots[0]) assignments[slots[0].id] = [memberA];
    if (slots[1]) assignments[slots[1].id] = [memberB];

    await step("MCP saves assignment draft and publishes", async () => {
      const row = await mcp("set_shift_assignments", {
        planId: created,
        assignments,
        status: "published",
        expectedVersion: detail.plan.version,
        reason: "シナリオテスト2で公開確認",
        confirm: true,
      });
      assert.equal(row.status, 200);
      assert.equal(row.isError, false);
    });

    await step("published shift appears in calendar", async () => {
      const row = await api(memberA, "GET", "/api/calendar");
      assert.equal(row.status, 200);
      assert.ok(row.data.events.some((event) => event.shiftPlanId === created));
    });

    const assignedSlot = slots[0];
    if (assignedSlot) {
      const started = await step("member clocks in and records break", async () => {
        const start = await api(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "start", note: "シナリオテスト2の予定外勤務" });
        assert.equal(start.status, 201);
        summary.recordId = start.data.record.id;
        assert.equal((await api(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "break-start", recordId: summary.recordId })).status, 200);
        assert.equal((await api(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "break-end", recordId: summary.recordId })).status, 200);
        assert.equal((await api(memberA, "POST", `/api/groups/${groupId}/work-records`, { action: "end", recordId: summary.recordId })).status, 200);
        return true;
      });

      if (started) {
        await step("member submits daily work claim and manager approves", async () => {
          assert.equal((await api(memberA, "PATCH", `/api/groups/${groupId}/work-records`, { action: "submit-claim", recordId: summary.recordId })).status, 200);
          assert.equal((await api(owner, "PATCH", `/api/groups/${groupId}/work-records`, { recordId: summary.recordId, status: "approved", managerNote: "シナリオテスト2承認" })).status, 200);
        });
      }
    }
  }
}

await step("MCP creates an announcement", async () => {
  const row = await mcp("create_announcement", { groupId, title: "シナリオテスト2のお知らせ", body: "テスト完了後にseedを再投入します。", confirm: true });
  assert.equal(row.status, 200);
  assert.equal(row.isError, false);
});

await step("MCP queue summary is readable", async () => {
  const row = await mcp("get_assistant_message_queue_summary", { groupId });
  assert.equal(row.status, 200);
  assert.equal(row.isError, false);
  const queue = jsonText(row);
  assert.ok(queue && typeof queue.pendingCount === "number");
});

const stepRows = results.filter((row) => row.kind === "step");
summary.passed = stepRows.filter((row) => row.status === "passed").length;
summary.failed = stepRows.filter((row) => row.status === "failed").length;
summary.ok = summary.failed === 0;
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "results.json"), JSON.stringify({ summary, results }, null, 2) + "\n", "utf8");
await writeFile(resolve(outputDir, "RESULT.md"), `# シナリオテスト2結果\n\n- 実行日時: ${new Date().toISOString()}\n- 対象: ${baseUrl}\n- 判定: ${summary.ok ? "PASS" : "FAIL"}\n- 成功: ${summary.passed}\n- 失敗: ${summary.failed}\n- 作成した計画: ${summary.planId ?? "なし"}\n- 作成した勤務記録: ${summary.recordId ?? "なし"}\n\n詳細は同じディレクトリの \`results.json\` を参照してください。テスト後は \`npm run db:seed:local\` で初期状態へ戻します。\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
