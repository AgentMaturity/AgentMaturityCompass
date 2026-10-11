// Stdio MCP fixture for P0-31 (AMC-1515). Args: <calls log> <mode: plain|notify|strict>.
// Every tools/call appends one line to the log before answering; `notify` announces a
// catalog change before the result line.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { MCP_TOOL } from "./fixtures.mjs";

const [log, mode] = process.argv.slice(2);
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result = {};
  if (request.method === "initialize") result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "p031-stdio-fixture", version: "1" } };
  else if (request.method === "tools/list") result = { tools: [MCP_TOOL(mode)] };
  else if (request.method === "tools/call") {
    appendFileSync(log, `${JSON.stringify(request.params.arguments)}\n`);
    if (mode === "notify") send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    result = { content: [{ type: "text", text: "remote side effect committed" }] };
  }
  send({ jsonrpc: "2.0", id: request.id, result });
});
