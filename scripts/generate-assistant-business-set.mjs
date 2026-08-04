import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "kinban-manager-agent");
const outputPath = path.join(root, "app", "assistant-business-set.ts");

function walkMarkdown(directory, relative = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      const nextRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) return walkMarkdown(absolute, nextRelative);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".md")
        ? [nextRelative]
        : [];
    });
}

function normalize(contents) {
  return contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Canonical manager-agent directory not found: ${sourceRoot}`);
}

const relativeFiles = walkMarkdown(sourceRoot);
if (relativeFiles.length === 0) {
  throw new Error("No Markdown files found in the canonical manager-agent directory");
}

const files = Object.fromEntries(relativeFiles.map((relativeFile) => {
  const contents = normalize(fs.readFileSync(path.join(sourceRoot, relativeFile), "utf8"));
  if (/(?:^|\W)(?:mcp|sk)-[A-Za-z0-9_-]{24,}(?:$|\W)|Bearer\s+[A-Za-z0-9._-]{32,}/i.test(contents)) {
    throw new Error(`Potential secret or local credential found in business guidance: ${relativeFile}`);
  }
  return [relativeFile.split(path.sep).join("/"), contents];
}));

const sourceFingerprint = crypto.createHash("sha256")
  .update(JSON.stringify(files))
  .digest("hex")
  .slice(0, 16);
const releasedAt = process.env.ASSISTANT_BUSINESS_SET_RELEASED_AT ?? new Date().toISOString().slice(0, 10);
const packageVersion = process.env.ASSISTANT_BUSINESS_SET_VERSION ?? releasedAt.replaceAll("-", ".");
const summary = "KINBAN運営支援AIの運用方針・Skill・runbookを、kinban-manager-agentから生成した業務関連セットです。";

const generated = `// GENERATED FILE. Do not edit manually. Run: npm run generate:assistant-business-set
export const assistantBusinessSet = ${JSON.stringify({
  packageVersion,
  releasedAt,
  summary,
  minimumKinbanVersion: "0.1.0",
  source: "kinban-manager-agent",
  sourceFingerprint,
  files,
}, null, 2)} as const;

export function buildAssistantBusinessSetFiles() {
  return {
    ...assistantBusinessSet.files,
    "manifest.json": JSON.stringify({
      packageVersion: assistantBusinessSet.packageVersion,
      releasedAt: assistantBusinessSet.releasedAt,
      summary: assistantBusinessSet.summary,
      minimumKinbanVersion: assistantBusinessSet.minimumKinbanVersion,
      source: assistantBusinessSet.source,
      sourceFingerprint: assistantBusinessSet.sourceFingerprint,
      files: Object.keys(assistantBusinessSet.files),
    }, null, 2) + "\\n",
  };
}
`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== generated) {
    console.error(`Generated business set is out of date: ${path.relative(root, outputPath)}`);
    process.exit(1);
  }
} else {
  fs.writeFileSync(outputPath, generated, "utf8");
  console.log(`Generated ${path.relative(root, outputPath)} from ${relativeFiles.length} canonical Markdown files (${sourceFingerprint})`);
}
