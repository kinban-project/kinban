import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = "kinban-manager-agent";
const files = [
  "README.md",
  "AGENTS.md",
  "SECURITY_BOUNDARY.md",
  ".env.example",
  ".gitignore",
  "config/agent-config.example.json",
  "config/schedules.example.json",
  "skills/kinban-daily-operations/SKILL.md",
  "skills/shift-planning/SKILL.md",
  "skills/attendance-review/SKILL.md",
  "skills/assistant-messages/SKILL.md",
  "runbooks/defaults/shift-allocation-policy.md",
  "runbooks/defaults/attendance-review-policy.md",
  "runbooks/defaults/member-communication-policy.md",
  "runbooks/defaults/escalation-policy.md",
  "runbooks/local/README.md",
  "jobs/daily-check.md",
  "jobs/shift-request-reminder.md",
  "jobs/shift-draft-preview.md",
  "jobs/month-end-check.md",
  "scripts/bootstrap.ps1",
  "scripts/verify-connection.ps1",
  "workspace/README.md",
  "pack/.codex/config.toml",
  "pack/.mcp.json",
  "pack/CLAUDE.md",
  "pack/scripts/mcp-http-bridge.mjs",
];

test("manager agent template contains the documented safe operating structure", () => {
  for (const file of files) assert.equal(fs.existsSync(`${root}/${file}`), true, `missing ${file}`);
  const agents = fs.readFileSync(`${root}/AGENTS.md`, "utf8");
  const securityBoundary = fs.readFileSync(`${root}/SECURITY_BOUNDARY.md`, "utf8");
  const shiftSkill = fs.readFileSync(`${root}/skills/shift-planning/SKILL.md`, "utf8");
  const messageSkill = fs.readFileSync(`${root}/skills/assistant-messages/SKILL.md`, "utf8");
  const dailySkill = fs.readFileSync(`${root}/skills/kinban-daily-operations/SKILL.md`, "utf8");
  const verify = fs.readFileSync(`${root}/scripts/verify-connection.ps1`, "utf8");
  const ignore = fs.readFileSync(`${root}/.gitignore`, "utf8");
  assert.match(agents, /管理者確認が必要なもの/);
  assert.match(agents, /同じPC・ユーザー・ローカルプロジェクト/);
  assert.match(securityBoundary, /直接HTTP/);
  assert.match(securityBoundary, /ローカルDB/);
  assert.match(securityBoundary, /KINBAN本体/);
  assert.match(shiftSkill, /get_shift_request_overview/);
  assert.match(messageSkill, /claim_next_assistant_message/);
  assert.match(dailySkill, /get_assistant_message_queue_summary/);
  assert.doesNotMatch(dailySkill, /list_assistant_messages/);
  assert.match(verify, /list_groups/);
  assert.match(ignore, /\.env/);
  assert.match(ignore, /workspace/);
});

test("bootstrap updates standard files without nesting directories and preserves local state", { skip: process.platform !== "win32" }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kinban-manager-agent-test-"));
  const source = path.join(tempRoot, "template");
  const destination = path.join(tempRoot, "runtime");
  try {
    fs.cpSync(root, source, { recursive: true });
    const bootstrap = path.join(source, "scripts", "bootstrap.ps1");
    const run = (update = false) => execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", bootstrap, "-Destination", destination, ...(update ? ["-Update"] : [])], { encoding: "utf8" });
    run();
    fs.writeFileSync(path.join(destination, ".env"), "KINBAN_ASSISTANT_API_KEY=local-only\n");
    fs.mkdirSync(path.join(destination, "workspace", "state"), { recursive: true });
    fs.writeFileSync(path.join(destination, "workspace", "state", "keep.txt"), "keep");
    fs.writeFileSync(path.join(destination, "runbooks", "local", "company-policy.md"), "local policy");
    fs.writeFileSync(path.join(source, "runbooks", "defaults", "shift-allocation-policy.md"), "updated default");
    const output = run(true);
    assert.match(output, /updated\s+runbooks\/defaults\/shift-allocation-policy\.md/);
    assert.equal(fs.readFileSync(path.join(destination, "runbooks", "defaults", "shift-allocation-policy.md"), "utf8"), "updated default");
    assert.equal(fs.readFileSync(path.join(destination, "runbooks", "local", "company-policy.md"), "utf8"), "local policy");
    assert.equal(fs.readFileSync(path.join(destination, "workspace", "state", "keep.txt"), "utf8"), "keep");
    assert.equal(fs.existsSync(path.join(destination, "config", "config")), false);
    assert.equal(fs.existsSync(path.join(destination, "runbooks", "defaults", "defaults")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
