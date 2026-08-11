import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";

test("local MCP bridge reads connection.env and forwards JSON-RPC with bearer auth", async () => {
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.headers.authorization, "Bearer local-test-key");
      assert.equal(JSON.parse(body).method, "tools/list");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 7, result: { tools: [{ name: "list_groups" }] } }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kinban-mcp-bridge-"));
  const bridge = path.resolve("kinban-manager-agent/pack/scripts/mcp-http-bridge.mjs");
  fs.writeFileSync(path.join(temp, "connection.env"), `KINBAN_MCP_URL=http://127.0.0.1:${address.port}/api/mcp\nKINBAN_API_KEY=local-test-key\n`);
  const child = spawn(process.execPath, [bridge], { cwd: temp, stdio: ["pipe", "pipe", "pipe"] });
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })}\n`);
    const [line] = await once(child.stdout, "data");
    const payload = JSON.parse(line.toString().trim());
    assert.deepEqual(payload.result.tools[0], { name: "list_groups" });
  } finally {
    child.kill();
    await once(child, "exit").catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
