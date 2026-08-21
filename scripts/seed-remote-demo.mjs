import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CONFIRMATION = "SEED DEMO D1";
const BATCH_SIZE = 10;

function fail(message) {
  console.error(`Remote demo seed aborted: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--config" || arg === "--database" || arg === "--confirm") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    fail(`unknown option: ${arg}`);
  }
  if (!options.config || !options.database || !options.confirm) {
    fail("required options: --config <demo wrangler config> --database <demo database> --confirm \"SEED DEMO D1\"");
  }
  if (options.confirm !== CONFIRMATION) {
    fail(`confirmation must be exactly \"${CONFIRMATION}\"`);
  }
  return options;
}

function splitSql(sql) {
  const statements = [];
  let statement = "";
  let quote = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (!quote && char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (char === "'") {
      if (quote && next === "'") {
        statement += "''";
        index += 1;
        continue;
      }
      quote = !quote;
    }
    statement += char;
    if (!quote && char === ";" && statement.trim()) {
      statements.push(statement.trim());
      statement = "";
    }
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const options = parseArgs(process.argv.slice(2));
const configPath = resolve(options.config);
let config;
try {
  config = readFileSync(configPath, "utf8");
} catch (error) {
  fail(`cannot read config ${configPath}: ${error.message}`);
}

const escapedDatabase = options.database.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const databasePattern = new RegExp(`\"(?:database_name|binding)\"\\s*:\\s*\"${escapedDatabase}\"`);
if (!databasePattern.test(config)) {
  fail(`database ${options.database} is not declared by ${configPath}; use a demo-only config`);
}

const seedPath = resolve("scripts/seed-local.sql");
const statements = splitSql(readFileSync(seedPath, "utf8"));
const batchCount = Math.ceil(statements.length / BATCH_SIZE);
console.log(`Target database: ${options.database}`);
console.log(`Wrangler config: ${configPath}`);
console.log(`Seed source: ${seedPath}`);
console.log(`Statements: ${statements.length} (${batchCount} remote batches)`);
console.log("WARNING: this replaces data in the selected remote demo D1.");

if (options.dryRun) {
  console.log("Dry run only; no Cloudflare command was executed.");
  process.exit(0);
}

const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
for (let start = 0; start < statements.length; start += BATCH_SIZE) {
  const batch = statements.slice(start, start + BATCH_SIZE).join("\n");
  const result = spawnSync(process.execPath, [
    wrangler,
    "d1",
    "execute",
    options.database,
    "--remote",
    "--config",
    configPath,
    "--command",
    batch,
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    fail(`remote seed batch failed (${start + 1}-${Math.min(start + BATCH_SIZE, statements.length)})`);
  }
}

console.log(`Remote demo seed applied in ${batchCount} batches.`);
