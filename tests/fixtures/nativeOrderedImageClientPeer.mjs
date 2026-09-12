/** AUTHORED UNEXECUTED. Untrusted subprocess peer, explicitly NOT a native runtime. */
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const [mode = "good", capture] = process.argv.slice(2);
const sessionId = "ordered-wire-session", format = "amc-image-input@2";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=";
let active, saved = [];
const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const update = content => ({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "user_message_chunk", content } } });
const send = frame => process.stdout.write(JSON.stringify(frame) + "\n");
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", line => {
  const request = JSON.parse(line); if (capture) appendFileSync(capture, line + "\n");
  if (request.method === "session/cancel") { if (active !== undefined) { send(reply(active, { stopReason: "cancelled" })); active = undefined; } return; }
  if (request.id === undefined) return;
  if (request.method === "initialize") {
    send(reply(request.id, { protocolVersion: 1, agentInfo: { name: "agent-maturity-compass", version: "untrusted-fixture" }, agentCapabilities: {
      loadSession: true, promptCapabilities: { image: mode !== "no-image", audio: false, embeddedContext: false },
      _meta: { "dev.agentmaturity.amc": { releaseSession: true,
        ...(mode === "missing" ? {} : { orderedImageInput: mode === "truthy" ? true : mode === "future" ? "amc-image-input@3" : format }) } }
    } }));
  } else if (request.method === "session/new") send(reply(request.id, { sessionId }));
  else if (request.method === "_amc/session/release") send(reply(request.id, {}));
  else if (request.method === "session/prompt") {
    saved = request.params.prompt;
    if (mode === "cancel") { active = request.id; send({ jsonrpc: "2.0", method: "session/update", params: { sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "waiting" } } } }); }
    else if (mode === "unsolicited") send(update({ type: "image", mimeType: "image/png", data: png }));
    else send(reply(request.id, { stopReason: "end_turn" }));
  } else if (request.method === "session/load") {
    const history = saved.length ? saved : [{ type: "image", mimeType: "image/png", data: png }, { type: "text", text: "after" }];
    if (mode === "late") { send(reply(request.id, {})); for (const part of history) send(update(part)); }
    else if (mode === "oversize") {
      const bytes = Buffer.alloc(180000); Buffer.from(png, "base64").copy(bytes);
      for (let index = 0; index < 40; index++) send(update({ type: "image", mimeType: "image/png", data: bytes.toString("base64") }));
      send(reply(request.id, {}));
    } else { for (const part of history) send(update(mode === "malformed" && part.type === "image" ? { ...part, data: part.data + "\n" } : part)); send(reply(request.id, {})); }
  } else send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unknown fixture method" } });
});
