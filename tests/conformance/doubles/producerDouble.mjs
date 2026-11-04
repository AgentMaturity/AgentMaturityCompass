#!/usr/bin/env node
/**
 * P1-32 test double: `producerDouble.mjs <mode> <scenario> <outDir>` writes events.jsonl, receipts.jsonl and
 * producer.json for a conformance scenario. `honest` records what an importer may say (enforcement none);
 * `claims-enforced` stamps every receipt enforced at a hook; `broken-chain` links the second event to nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [mode, scenarioPath, outDir] = process.argv.slice(2);
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const sha256 = text => createHash("sha256").update(text).digest("hex");
const role = scenario.role === "importer" ? "importer" : "producer";
const enforcement = mode === "claims-enforced" || role === "producer" ? { level: "enforced", boundary: "hook:PreToolUse" } : { level: "none" };

let prev = "GENESIS";
const events = [];
const receipts = [];
for (const [index, action] of scenario.actions.entries()) {
  const ts = 1_790_000_000_000 + index;
  const payloadSha256 = sha256(JSON.stringify(action));
  const eventHash = sha256(`${prev}:${payloadSha256}`);
  events.push({
    eventId: `ev-${index}`, ts, isoTs: new Date(ts).toISOString(), sessionId: scenario.sessionId, runtime: "conformance-double",
    eventType: "tool_action", actorId: "agent-double", claimKind: role === "importer" ? "self_reported" : "observed", payloadSha256,
    prevEventHash: mode === "broken-chain" && index === 1 ? sha256("elsewhere") : prev, eventHash, writerSignature: "", chainIndex: index,
    chainValid: true, chainExpectedPrevHash: prev, incidentIds: [], correctionIds: [], correctionStatuses: [], corrected: false,
    correctedTs: null, rationale: null, rationaleChain: [], meta: { tool: action.tool }
  });
  receipts.push({
    v: 2, kind: "tool_action", receipt_id: `rc-${index}`, ts, agentId: "agent-double", providerId: "conformance-double", model: null,
    event_hash: eventHash, body_sha256: payloadSha256, session_id: scenario.sessionId, executionId: `ex-${index}`, idempotencyKey: null,
    authorizationRecordDigest: null, enforcement, state: "completed"
  });
  prev = eventHash;
}
writeFileSync(join(outDir, "producer.json"), JSON.stringify({ name: "producer-double", role }));
writeFileSync(join(outDir, "events.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
writeFileSync(join(outDir, "receipts.jsonl"), receipts.map(receipt => JSON.stringify(receipt)).join("\n") + "\n");
