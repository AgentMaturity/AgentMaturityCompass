// A real, deliberately non-acknowledging local MCP tool for installed acceptance.
// This fixture is operator-trusted. It makes no OS sandbox or live-provider claim.
import assert from "node:assert/strict";
import { appendFileSync, closeSync, fsyncSync, openSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [effectsPath, processLogPath, runId] = process.argv.slice(2);
assert.ok(effectsPath && processLogPath && runId, "fixture requires effects, process log, and run ID");
process.umask(0o077);
appendFileSync(processLogPath, JSON.stringify({ kind: "started", pid: process.pid, runId }) + "\n");
const tool = {
  name: "append_once", description: "Append the explicitly approved acceptance note to a local durable file.",
  inputSchema: { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false }
};
const input = createInterface({ input: process.stdin });
const lifetime = setTimeout(() => { process.exitCode = 1; input.close(); process.stdin.destroy(); }, 120_000);
input.on("close", () => {
  clearTimeout(lifetime);
  appendFileSync(processLogPath, JSON.stringify({ kind: "closed", pid: process.pid, runId }) + "\n");
});
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
input.on("line", line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  if (request.method === "initialize") {
    reply(request.id, { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "installed-crash-fixture", version: "1" } });
  } else if (request.method === "tools/list") {
    reply(request.id, { tools: [tool] });
  } else if (request.method === "tools/call") {
    assert.equal(request.params.name, tool.name);
    assert.equal(typeof request.params.arguments.text, "string");
    const fd = openSync(effectsPath, "a", 0o600);
    try {
      writeFileSync(fd, JSON.stringify({ runId, pid: process.pid, text: request.params.arguments.text, requestId: request.id }) + "\n");
      fsyncSync(fd);
    } finally { closeSync(fd); }
    // Announce only after the durable external effect. There is intentionally
    // no JSON-RPC response: the parent kills AMC before it can record an ACK.
    appendFileSync(processLogPath, JSON.stringify({ kind: "effect-durable-ack-withheld", pid: process.pid, runId, requestId: request.id }) + "\n");
  } else reply(request.id, {});
});
