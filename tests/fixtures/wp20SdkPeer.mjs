// A deliberately untrusted ACP wire peer; it does not produce signed evidence.
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const pages = JSON.parse(process.env.AMC_WP20_PAGES ?? "[]");
const delays = JSON.parse(process.env.AMC_WP20_PAGE_DELAYS ?? "[]");
const reference = process.env.AMC_WP20_TURN_REF ? JSON.parse(process.env.AMC_WP20_TURN_REF)
  : { turn: 1, seq: 51, eventId: "seal-1", eventHash: "a".repeat(64) };
let pending;
const reply = (id, stopReason) => console.log(JSON.stringify({ jsonrpc: "2.0", id, result: { stopReason,
  _meta: { "dev.agentmaturity.amc": process.env.AMC_WP20_NO_TURN_REF ? {} : { committedTurn: reference } } } }));
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (process.env.AMC_WP20_CAPTURE) appendFileSync(process.env.AMC_WP20_CAPTURE, JSON.stringify(request) + "\n");
  if (request.method === "session/cancel" && pending !== undefined) { reply(pending, "cancelled"); pending = undefined; }
  if (request.id === undefined) continue;
  if (request.method === "_amc/session/withdraw") {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { withdrawn: process.env.AMC_WP20_BAD_WITHDRAW ? "true" : true } })); continue;
  }
  if (request.method === "session/prompt" && process.env.AMC_WP20_REQUEST_IDS) {
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { stopReason: "end_turn", _meta: request.params._meta } })); continue;
  }
  if (request.method === "session/prompt" && process.env.AMC_WP20_OVERFLOW) {
    for (let index = 0; index < Number(process.env.AMC_WP20_OVERFLOW); index++) {
      console.log(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: request.params.sessionId, update: process.env.AMC_WP20_TOOL_OVERFLOW
          ? { sessionUpdate: "tool_call", toolCallId: `call-${index}`, status: "pending", title: "tool" }
          : { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `part-${index};` } }
      } }));
    }
    if (process.env.AMC_WP20_HOLD_PROMPT) pending = request.id;
    else reply(request.id, "end_turn");
    continue;
  }
  if (request.method === "session/prompt" && process.env.AMC_WP20_LIVE_PLAN) {
    console.log(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: request.params.sessionId, update: JSON.parse(process.env.AMC_WP20_LIVE_PLAN)
    } }));
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { stopReason: "end_turn" } }));
    continue;
  }
  if (request.method === "_amc/session/events") await new Promise(resolve => setTimeout(resolve, Number(delays.shift() ?? 0)));
  const result = request.method === "initialize"
    ? { protocolVersion: 1, agentInfo: { name: "agent-maturity-compass", version: "1.2.0" },
        agentCapabilities: { _meta: { "dev.agentmaturity.amc": {
          executionApi: 1, committedTurn: process.env.AMC_WP20_NO_TURN_CAP ? undefined : "amc-committed-turn-v1",
          currentPlanUpdates: process.env.AMC_WP20_NO_PLANS ? undefined : "amc-current-plan-v1", clientRequestIds: !process.env.AMC_WP20_NO_REQUEST_IDS,
          withdrawSubmission: !process.env.AMC_WP20_NO_REQUEST_IDS, sessionEventPage: process.env.AMC_WP20_NO_PAGES ? undefined : "amc-session-event-page-v1"
        } } } }
    : request.method === "_amc/session/events" ? pages.shift() : { sessionId: "fixture-session" };
  console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
}
