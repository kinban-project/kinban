import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Wrangler batches a --file input as one local D1 batch. Keep the seed SQL as
// the readable source of truth, but send it in smaller batches so the local
// SQLite compound-select limit is not reached by a large demo seed.
function splitSql(sql) {
  const statements = [];
  let statement = '';
  let quote = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (!quote && char === '-' && next === '-') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (char === "'") {
      if (quote && next === "'") {
        statement += "''";
        i += 1;
        continue;
      }
      quote = !quote;
    }
    statement += char;
    if (!quote && char === ';' && statement.trim()) {
      statements.push(statement.trim());
      statement = '';
    }
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const statements = splitSql(readFileSync(resolve('scripts/seed-local.sql'), 'utf8'));
const batchSize = 10;
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');

for (let start = 0; start < statements.length; start += batchSize) {
  const batch = statements.slice(start, start + batchSize).join('\n');
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--local', '--command', batch], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Local seed batch failed (${start + 1}-${Math.min(start + batchSize, statements.length)})`);
  }
}

console.log(`Local seed applied in ${Math.ceil(statements.length / batchSize)} batches (${statements.length} statements).`);
