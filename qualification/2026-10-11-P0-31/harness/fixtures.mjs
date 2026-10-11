// Local, keyless fixture servers for the P0-31 installed rows. Loopback only; nothing here is a model.
import { createServer } from "node:http";

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
};
const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};
const closeAll = (server, sockets) => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); });
const track = (server) => { const sockets = new Set(); server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); }); return sockets; };

/**
 * Scripted Ollama-protocol server (POST /api/chat, one NDJSON frame with done:true).
 * `script(body, index)` returns { toolCall: { name, arguments } } or { text } and an optional delayMs.
 * Every request body is kept so the row can read what the runtime actually sent back (tool results).
 */
export async function startOllamaFixture(script) {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/api/chat")) { res.writeHead(404); res.end(); return; }
    const body = await readJson(req);
    const index = requests.push(body) - 1;
    const step = script(body, index) ?? { text: "done" };
    if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    const message = step.toolCall
      ? { role: "assistant", content: "", tool_calls: [{ function: { name: step.toolCall.name, arguments: step.toolCall.arguments } }] }
      : { role: "assistant", content: step.text };
    const frame = { model: body.model ?? "fixture", created_at: new Date().toISOString(), message, done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 };
    if (res.destroyed) return;
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    res.end(`${JSON.stringify(frame)}\n`);
  });
  const sockets = track(server);
  return { url: await listen(server), requests, close: () => closeAll(server, sockets) };
}

/** Tool names offered in one Ollama request. */
export const offeredTools = (body) => (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
/** Text of every role:"tool" message in one request (what the model was told the tool returned). */
export const toolResults = (body) => (body.messages ?? []).filter((m) => m.role === "tool").map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content));

export const MCP_TOOL = (mode) => ({
  name: "note",
  description: "Append an acceptance note (fixture).",
  inputSchema: mode === "strict"
    ? { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false }
    : { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false }
});

/** Streamable HTTP MCP fixture; `notify` answers tools/call with a list_changed notification before the result. */
export async function startMcpHttpFixture(mode) {
  let calls = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
    const message = await readJson(req);
    if (message.id === undefined) { res.writeHead(202); res.end(); return; }
    let result = {};
    if (message.method === "initialize") result = { protocolVersion: message.params?.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "p031-http-fixture", version: "1" } };
    else if (message.method === "tools/list") result = { tools: [MCP_TOOL(mode)] };
    else if (message.method === "tools/call") { calls += 1; result = { content: [{ type: "text", text: "remote side effect committed" }] }; }
    const reply = { jsonrpc: "2.0", id: message.id, result };
    const body = mode === "notify" && message.method === "tools/call" ? [{ jsonrpc: "2.0", method: "notifications/tools/list_changed" }, reply] : reply;
    res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "p031-http-session" });
    res.end(JSON.stringify(body));
  });
  const sockets = track(server);
  const origin = await listen(server);
  return { url: `${origin}/mcp`, origin, calls: () => calls, close: () => closeAll(server, sockets) };
}
