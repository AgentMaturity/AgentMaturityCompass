/** AUTHORED UNEXECUTED. Deliberately untrusted wire peer, NOT an AMC runtime. */
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const [mode = "good", capture] = process.argv.slice(2);
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=";
const sessionId = "image-wire-session";
let active;
const line = frame => JSON.stringify(frame) + "\n";
const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const update = content => ({ jsonrpc: "2.0", method: "session/update", params: {
  sessionId, update: { sessionUpdate: mode === "assistant-image" ? "agent_message_chunk" : "user_message_chunk", content }
} });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", data => {
  const request = JSON.parse(data);
  if (capture) appendFileSync(capture, line(request));
  if (request.method === "session/cancel") {
    if (active !== undefined) { process.stdout.write(line(reply(active, { stopReason: "cancelled" }))); active = undefined; }
    return;
  }
  if (request.id === undefined) return;
  if (request.method === "initialize") {
    const image = mode === "no-image" ? false : mode === "truthy-image" ? "true" : true;
    process.stdout.write(line(reply(request.id, { protocolVersion: 1, agentInfo: { name: "agent-maturity-compass", version: "untrusted-fixture" },
      agentCapabilities: { loadSession: true, promptCapabilities: { image, audio: false, embeddedContext: false },
        _meta: { "dev.agentmaturity.amc": { releaseSession: true } } } })));
  } else if (request.method === "session/new") process.stdout.write(line(reply(request.id, { sessionId })));
  else if (request.method === "_amc/session/release") process.stdout.write(line(reply(request.id, {})));
  else if (request.method === "session/prompt") {
    if (mode === "cancel") {
      active = request.id;
      process.stdout.write(line({ jsonrpc: "2.0", method: "session/update", params: { sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "waiting for cancellation" } } } }));
    } else if (mode === "unsolicited-image") process.stdout.write(line(update({ type: "image", mimeType: "image/png", data: png })));
    else process.stdout.write(line(reply(request.id, { stopReason: "end_turn" })));
  } else if (request.method === "session/load") {
    const content = { type: "image", mimeType: mode === "mime" ? "image/jpeg" : "image/png",
      data: mode === "bad-base64" ? png + "\n" : mode === "uri-only" ? "" : png,
      ...(mode === "uri-only" ? { uri: "file:///never-read.png" } : {}) };
    if (mode === "late-image") process.stdout.write(line(reply(request.id, {})) + line(update(content)));
    else if (mode === "oversize-history") {
      // Valid header bytes, bounded individual image; enough framed updates to
      // exceed the client's aggregate replay bound without an oversized frame.
      const bytes = Buffer.alloc(180000); Buffer.from(png, "base64").copy(bytes);
      content.data = bytes.toString("base64");
      process.stdout.write(Array.from({ length: 40 }, () => line(update(content))).join("") + line(reply(request.id, {})));
    } else process.stdout.write(line(update(content)) + line(reply(request.id, {})));
  } else process.stdout.write(line({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "fixture method unavailable" } }));
});
