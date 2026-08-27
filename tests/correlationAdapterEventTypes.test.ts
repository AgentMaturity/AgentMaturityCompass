import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { correlateTracesAgainstEvidence } from "../src/correlation/correlate.js";
import { parseEvidenceEvent, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * Correlation must look at the event types the observation paths actually write.
 *
 * `traceSourceEvents` filtered `event_type === "stdout" || "stderr"`. The
 * wrap/supervise path writes exactly those (src/ledger/monitor.ts), but
 * `amc adapters run` — the entry point P5.3 blessed as the single observation
 * command — writes `agent_stdout`/`agent_stderr` (src/adapters/adapterRunner.ts).
 * So the supported path contributed ZERO traces while the deprecated aliases
 * contributed all of them, and `correlationRatio >= 0.95` is a precondition for
 * OBSERVED_HARDENED in `runTrustTier` (src/forecast/forecastSignals.ts:68).
 */
const TRACE = JSON.stringify({
  amc_trace_v: 1,
  event: "llm_call",
  agentId: "payments-agent",
  providerId: "openai",
  ts: 1_787_000_000_000
});

function event(eventType: string, text: string): ParsedEvidenceEvent {
  return {
    id: `evt-${eventType}`,
    ts: Date.now(),
    session_id: "s1",
    runtime: "any",
    event_type: eventType,
    payload_sha256: "0".repeat(64),
    prev_event_hash: "0".repeat(64),
    event_hash: `hash-${eventType}`,
    writer_sig: "",
    meta_json: "{}",
    payload_inline: text,
    meta: {},
    text,
    trustTier: "OBSERVED"
  } as unknown as ParsedEvidenceEvent;
}

const correlate = (events: ParsedEvidenceEvent[]) =>
  correlateTracesAgainstEvidence({
    events,
    monitorPublicKeys: [],
    expectedAgentId: "payments-agent"
  });

describe("adapter output is a trace source", () => {
  it("counts traces from agent_stdout, as `adapters run` writes them", () => {
    const metrics = correlate([event("agent_stdout", TRACE)]);
    expect(metrics.totalTraces, "the supported observation path must contribute").toBe(1);
  });

  it("counts traces from agent_stderr too", () => {
    const metrics = correlate([event("agent_stderr", TRACE)]);
    expect(metrics.totalTraces).toBe(1);
  });

  it("still counts the wrap/supervise event types", () => {
    // The deprecated aliases stay supported for at least one release cycle, and
    // their evidence must keep correlating for as long as they do.
    expect(correlate([event("stdout", TRACE)]).totalTraces).toBe(1);
    expect(correlate([event("stderr", TRACE)]).totalTraces).toBe(1);
  });

  it("does not treat unrelated event types as trace sources", () => {
    // The filter is a whitelist for a reason: counting every row's text would
    // let a payload that merely quotes a trace line inflate the denominator.
    expect(correlate([event("metric", TRACE)]).totalTraces).toBe(0);
    expect(correlate([event("audit", TRACE)]).totalTraces).toBe(0);
  });
});

/**
 * The counting tests above are necessary but do not reach the consequence.
 *
 * `correlationRatio < 0.8` caps AMC-1.7 at L2 and AMC-2.3, AMC-2.5 and
 * AMC-3.3.1 at L3 (src/diagnostic/runner.ts:1047-1060), and the ratio shares one
 * denominator across every trace source (`validReceipts /
 * max(1, totalTracesWithReceipt)`, correlate.ts). So widening the filter moves
 * published levels in BOTH directions: an adapter-observed workspace whose
 * receipts verify leaves a structural zero and its caps lift, while a mixed one
 * whose newly-counted traces fail can cross below 0.8 for the first time.
 *
 * These pin that movement with real signed receipts, not synthetic events.
 */
const PASS = "correlation-adapter-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** A workspace with one signed llm_response and adapter-vocabulary traces about it. */
function workspaceWithAdapterTraces(includeInvalid: boolean): {
  events: ParsedEvidenceEvent[];
  monitorPublicKeys: string[];
} {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-corr-adapter-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });

  const ledger = openLedger(dir);
  const sessionId = "corr-adapter-session";
  ledger.startSession({ sessionId, runtime: "any", binaryPath: "test-runtime", binarySha256: "abc" });

  const body = JSON.stringify({ body: "ok" });
  const llm = ledger.appendEvidenceWithReceipt({
    sessionId,
    runtime: "gateway",
    eventType: "llm_response",
    payload: body,
    payloadExt: "json",
    inline: true,
    meta: { agentId: "default", trustTier: "OBSERVED" },
    receipt: {
      kind: "llm_response",
      agentId: "default",
      providerId: "openai",
      model: "gpt-test",
      bodySha256: sha256Hex(Buffer.from(body, "utf8"))
    }
  });

  const trace = (receipt: string) => JSON.stringify({
    amc_trace_v: 1, ts: Date.now(), agentId: "default", event: "llm_result", receipt
  });

  // Written under the vocabulary `amc adapters run` actually emits.
  ledger.appendEvidence({
    sessionId, runtime: "any", eventType: "agent_stdout",
    payload: trace(llm.receipt), inline: true,
    meta: { agentId: "default", trustTier: "OBSERVED" }
  });
  if (includeInvalid) {
    ledger.appendEvidence({
      sessionId, runtime: "any", eventType: "agent_stdout",
      payload: trace("bad.receipt"), inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED" }
    });
  }

  const events = (ledger.getEventsBetween(0, Date.now() + 60_000) as EvidenceEvent[]).map(parseEvidenceEvent);
  return { events, monitorPublicKeys: getPublicKeyHistory(dir, "monitor") };
}

describe("the ratio moves in both directions", () => {
  it("lifts an adapter-observed workspace off a structural zero", () => {
    const { events, monitorPublicKeys } = workspaceWithAdapterTraces(false);

    const metrics = correlateTracesAgainstEvidence({
      events, monitorPublicKeys, expectedAgentId: "default"
    });

    expect(metrics.totalTracesWithReceipt).toBe(1);
    expect(metrics.validReceipts).toBe(1);
    expect(metrics.correlationRatio, "above the 0.8 cap threshold, where it used to be 0")
      .toBeGreaterThanOrEqual(0.8);
  });

  it("drops below the cap threshold when a newly-counted trace does not verify", () => {
    // The other direction, and the reason the r225 migration text says scores
    // may move either way: one shared denominator across all trace sources.
    const { events, monitorPublicKeys } = workspaceWithAdapterTraces(true);

    const metrics = correlateTracesAgainstEvidence({
      events, monitorPublicKeys, expectedAgentId: "default"
    });

    expect(metrics.totalTracesWithReceipt).toBe(2);
    expect(metrics.validReceipts).toBe(1);
    expect(metrics.correlationRatio, "0.5 — below the 0.8 that caps AMC-1.7 at L2")
      .toBeLessThan(0.8);
  });
});
