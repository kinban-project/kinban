import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

function parseEnv(contents) {
  return Object.fromEntries(contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }));
}

async function loadConfig() {
  const envPath = path.resolve(process.cwd(), "connection.env");
  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  if (!env.KINBAN_MCP_URL || !env.KINBAN_API_KEY) {
    throw new Error("connection.env must define KINBAN_MCP_URL and KINBAN_API_KEY");
  }
  return { url: env.KINBAN_MCP_URL, key: env.KINBAN_API_KEY };
}

function errorResponse(id, message = "KINBAN MCP request failed") {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .pop();
    return data ? JSON.parse(data) : null;
  }
  return JSON.parse(text);
}

async function forward(message, config) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${config.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
  const payload = await readResponse(response);
  if (!response.ok) {
    return payload?.error ? { jsonrpc: "2.0", id: message.id ?? null, error: payload.error } : errorResponse(message.id);
  }
  return payload;
}

let config;
try {
  config = await loadConfig();
} catch {
  process.stderr.write("KINBAN MCP bridge: connection.env is missing or invalid.\n");
  process.exit(1);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let message;
    try {
      message = JSON.parse(line);
      const payload = await forward(message, config);
      if (payload && message.id !== undefined) process.stdout.write(`${JSON.stringify(payload)}\n`);
    } catch {
      if (message && message.id !== undefined) process.stdout.write(`${JSON.stringify(errorResponse(message.id))}\n`);
    }
  });
});
