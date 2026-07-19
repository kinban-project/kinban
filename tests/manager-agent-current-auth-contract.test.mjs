import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const files = [
  "kinban-manager-agent/README.md",
  "kinban-manager-agent/AGENTS.md",
  "kinban-manager-agent/ASSISTANT_EXECUTION.md",
  "kinban-manager-agent/AI運用ガイド.md",
  "kinban-manager-agent/skills/assistant-messages/SKILL.md",
  "kinban-manager-agent/skills/shift-planning/SKILL.md",
  "kinban-manager-agent/skills/attendance-review/SKILL.md",
  "kinban-manager-agent/skills/kinban-daily-operations/SKILL.md",
];

test("manager agent instructions describe current source-message claims", async () => {
  const contents = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
  for (const content of contents) {
    assert.match(content, /claimId/);
    assert.doesNotMatch(content, /confirmationToken/);
  }
  assert.match(contents[0], /新しいCodexタスク/);
  assert.match(contents[4], /sourceMessageId/);
});
