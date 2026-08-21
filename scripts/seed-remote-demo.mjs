import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
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

function parseJsonc(text) {
  return JSON.parse(
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,\s*([}\]])/g, "$1"),
  );
}

function isTrue(value) {
  return value === true || value === "true";
}

function validateDemoConfig(configPath, configText, database) {
  const filename = basename(configPath).toLowerCase();
  if (!/^wrangler\.demo(?:[-.][a-z0-9-]+)?\.jsonc$/.test(filename)) {
    fail(`config must be a demo-only wrangler.demo*.jsonc file: ${filename}`);
  }

  let parsed;
  try {
    parsed = parseJsonc(configText);
  } catch (error) {
    fail(`cannot parse JSONC config ${configPath}: ${error.message}`);
  }

  if (!isTrue(parsed.vars?.DEMO_MODE) || !isTrue(parsed.vars?.NEXT_PUBLIC_DEMO_MODE)) {
    fail("demo config must set vars.DEMO_MODE=true and vars.NEXT_PUBLIC_DEMO_MODE=true");
  }

  const databaseEntry = (parsed.d1_databases ?? []).find((entry) => entry.binding === "DB");
  if (!databaseEntry || databaseEntry.database_name !== database || !databaseEntry.database_id) {
    fail("DB binding, database_name, and database_id must identify the selected demo D1");
  }
}

function runWrangler(args, options = {}) {
  const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
  return spawnSync(process.execPath, [wrangler, ...args], {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

const options = parseArgs(process.argv.slice(2));
const configPath = resolve(options.config);
let config;
try {
  config = readFileSync(configPath, "utf8");
} catch (error) {
  fail(`cannot read config ${configPath}: ${error.message}`);
}
validateDemoConfig(configPath, config, options.database);

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

const preflight = runWrangler([
  "d1",
  "execute",
  options.database,
  "--remote",
  "--config",
  configPath,
  "--command",
  "SELECT (SELECT count(*) FROM site_users) AS site_users, (SELECT count(*) FROM groups) AS groups, (SELECT count(*) FROM group_members) AS group_members, (SELECT count(*) FROM demo_clocks) AS demo_clocks;",
  "--json",
], { capture: true });
if (preflight.status !== 0) {
  fail(`remote D1 preflight failed: ${preflight.stderr.trim()}`);
}
let preflightRows;
try {
  const payload = JSON.parse(preflight.stdout);
  preflightRows = payload?.[0]?.results ?? payload?.results;
} catch (error) {
  fail(`could not parse remote D1 preflight response: ${error.message}`);
}
const counts = preflightRows?.[0];
const existingCounts = Object.fromEntries(
  ["site_users", "groups", "group_members", "demo_clocks"].map((table) => [table, Number(counts?.[table] ?? NaN)]),
);
if (Object.values(existingCounts).some((count) => !Number.isFinite(count))) {
  fail("remote D1 preflight did not return all required table counts; refusing to seed");
}
const existingData = Object.entries(existingCounts).filter(([, count]) => count > 0);
if (existingData.length > 0) {
  fail(`remote D1 already contains data (${existingData.map(([table, count]) => `${table}=${count}`).join(", ")}); initial seed only refuses existing data`);
}

for (let start = 0; start < statements.length; start += BATCH_SIZE) {
  const batch = statements.slice(start, start + BATCH_SIZE).join("\n");
  const result = runWrangler([
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
