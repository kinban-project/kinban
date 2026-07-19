import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = "kinban-manager-agent";
const files = [
  "README.md",
  "AGENTS.md",
  ".env.example",
  ".gitignore",
  "config/agent-config.example.json",
  "config/schedules.example.json",
  "skills/kinban-daily-operations/SKILL.md",
  "skills/shift-planning/SKILL.md",
  "skills/attendance-review/SKILL.md",
  "skills/assistant-messages/SKILL.md",
  "runbooks/shift-allocation-policy.md",
  "runbooks/attendance-review-policy.md",
  "runbooks/member-communication-policy.md",
  "runbooks/escalation-policy.md",
  "jobs/daily-check.md",
  "jobs/shift-request-reminder.md",
  "jobs/shift-draft-preview.md",
  "jobs/month-end-check.md",
  "scripts/bootstrap.ps1",
  "scripts/verify-connection.ps1",
  "workspace/README.md",
];

test("manager agent template contains the documented safe operating structure", () => {
  for (const file of files) assert.equal(fs.existsSync(`${root}/${file}`), true, `missing ${file}`);
  const agents = fs.readFileSync(`${root}/AGENTS.md`, "utf8");
  const shiftSkill = fs.readFileSync(`${root}/skills/shift-planning/SKILL.md`, "utf8");
  const messageSkill = fs.readFileSync(`${root}/skills/assistant-messages/SKILL.md`, "utf8");
  const verify = fs.readFileSync(`${root}/scripts/verify-connection.ps1`, "utf8");
  const ignore = fs.readFileSync(`${root}/.gitignore`, "utf8");
  assert.match(agents, /人の確認が必須/);
  assert.match(agents, /メンバーコンテキスト/);
  assert.match(shiftSkill, /get_shift_request_overview/);
  assert.match(messageSkill, /claim_next_assistant_message/);
  assert.match(verify, /list_groups/);
  assert.match(ignore, /\.env/);
  assert.match(ignore, /workspace/);
});
