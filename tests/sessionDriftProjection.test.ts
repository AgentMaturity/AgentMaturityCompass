import { describe, expect, it } from "vitest";
import { parseEvidenceEvent, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import {
  SESSION_DRIFT_PROJECTION_VERSION,
  projectToolCallDriftRows,
  toolCallBehaviorSignature
} from "../src/watch/sessionDriftProjection.js";

/**
 * P5.2b step 2 — the bridge between live evidence and the drift engine.
 *
 * AMC had two disjoint drift systems. `src/drift/continuousMonitor.ts` reads the
 * ledger and ticks, but computes with a 241-line detector over diagnostic
 * reports. `src/watch/liveDriftAlerts.ts` carries the real statistics engine and
 * NEVER reads the ledger — it takes caller-supplied rows, which is what the plan
 * meant by "pure report-builders".
 *
 * Neither called the other. This projects the governed tool-call evidence P5.2a
 * writes into the six mandatory `LiveDriftSampleRow` fields, which is all the
 * engine needs; the other 930 are benchmark-specific and stay unset.
 */
const BASE = Date.parse("2026-08-20T10:00:00Z");

function auditEvent(over: {
  id: string;
  minute: number;
  auditType: string;
  toolName?: string;
  denialGuard?: string;
  eventType?: string;
}): ParsedEvidenceEvent {
  return parseEvidenceEvent({
    id: over.id,
    ts: BASE + over.minute * 60_000,
    session_id: "s1",
    runtime: "amc",
    event_type: (over.eventType ?? "audit") as ParsedEvidenceEvent["event_type"],
    payload_path: null,
    payload_inline: "evidence",
    payload_sha256: `sha-${over.id}`,
    meta_json: JSON.stringify({
      trustTier: "OBSERVED",
      auditType: over.auditType,
      toolName: over.toolName ?? "fs.read",
      toolToken: `tok_${over.id}`,
      ...(over.denialGuard ? { denialGuard: over.denialGuard } : {})
    }),
    prev_event_hash: "prev",
    event_hash: `hash-${over.id}`,
    writer_sig: "sig"
  });
}

describe("only governed tool-call decisions project", () => {
  it("projects an audit row carrying a TOOL_CALL_* decision", () => {
    const rows = projectToolCallDriftRows([auditEvent({ id: "a", minute: 0, auditType: "TOOL_CALL_ALLOWED" })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.traceId).toBe("tok_a");
    expect(rows[0]?.scenarioId, "the tool is the scenario").toBe("fs.read");
    expect(rows[0]?.timestamp).toBe(new Date(BASE).toISOString());
  });

  it("ignores evidence that is not a tool-call decision", () => {
    // metric rows, stdout rows and unrelated audit types are not decisions.
    // Projecting them would put rows with an invented score into the baseline.
    const rows = projectToolCallDriftRows([
      auditEvent({ id: "m", minute: 0, auditType: "TOOL_CALL_ALLOWED", eventType: "metric" }),
      auditEvent({ id: "s", minute: 1, auditType: "TOOL_CALL_ALLOWED", eventType: "stdout" }),
      auditEvent({ id: "o", minute: 2, auditType: "ALIGNMENT_CHECK_PASS" })
    ]);

    expect(rows, "only audit rows naming a tool-call decision").toEqual([]);
  });

  it("carries the signed evidence id it came from", () => {
    // The engine raises a HIGH alert on a receipt with no evidence refs, and it
    // is right to: a drift claim nobody can trace back to signed evidence is an
    // assertion. Every sample walks back to its ledger row.
    const [row] = projectToolCallDriftRows([auditEvent({ id: "a", minute: 0, auditType: "TOOL_CALL_ALLOWED" })]);

    expect(row?.evidenceRefs).toEqual(["a"]);
  });

  it("invents no benchmark fields", () => {
    // The engine's row type has 936 fields across 74 benchmark domains. A
    // runtime tool call evidences six of them, plus the signed ref. Filling any
    // of the other 929 with a plausible-looking default would put fabricated
    // benchmark data into a signed drift receipt.
    const [row] = projectToolCallDriftRows([auditEvent({ id: "a", minute: 0, auditType: "TOOL_CALL_ALLOWED" })]);

    expect(Object.keys(row ?? {}).sort())
      .toEqual([
        "behaviorSignature", "evidenceRefs", "scenarioId", "score0to1",
        "signedEvidenceRefs", "timestamp", "traceId"
      ]);
  });
});

describe("the score is a compliance rate, and says so", () => {
  it("scores an allowed call 1 and a refused call 0", () => {
    // `score0to1` in the engine means "quality". Here it means COMPLIANCE: the
    // fraction of calls policy permitted. A drop is more guard denials, which
    // is a behavioural change worth alerting on — not a quality judgement.
    const allowed = projectToolCallDriftRows([auditEvent({ id: "a", minute: 0, auditType: "TOOL_CALL_ALLOWED" })]);
    const denied = projectToolCallDriftRows([
      auditEvent({ id: "d", minute: 0, auditType: "TOOL_CALL_DENIED", denialGuard: "tool-allowlist" })
    ]);

    expect(allowed[0]?.score0to1).toBe(1);
    expect(denied[0]?.score0to1).toBe(0);
  });

  it("scores a tool that threw 0 as well, but signs it differently", () => {
    // A tool that failed is not a tool policy refused. Conflating them in the
    // signature would credit the guards with stopping something they allowed.
    const failed = projectToolCallDriftRows([auditEvent({ id: "f", minute: 0, auditType: "TOOL_CALL_FAILED" })]);
    const denied = projectToolCallDriftRows([
      auditEvent({ id: "d", minute: 1, auditType: "TOOL_CALL_DENIED", denialGuard: "budgets" })
    ]);

    expect(failed[0]?.score0to1).toBe(0);
    expect(denied[0]?.score0to1).toBe(0);
    expect(failed[0]?.behaviorSignature).not.toBe(denied[0]?.behaviorSignature);
  });
});

describe("the behaviour signature distinguishes what changed", () => {
  it("names the guard that refused, so a denial shift is attributable", () => {
    const sig = toolCallBehaviorSignature({ auditType: "TOOL_CALL_DENIED", toolName: "bash", denialGuard: "budgets" });

    expect(sig).toContain("bash");
    expect(sig, "which control fired is the interesting half").toContain("budgets");
  });

  it("separates two guards refusing the same tool", () => {
    // Without the guard in the signature, a workspace whose denials shifted
    // from the allowlist to the budget guard would look unchanged.
    const a = toolCallBehaviorSignature({ auditType: "TOOL_CALL_DENIED", toolName: "bash", denialGuard: "tool-allowlist" });
    const b = toolCallBehaviorSignature({ auditType: "TOOL_CALL_DENIED", toolName: "bash", denialGuard: "budgets" });

    expect(a).not.toBe(b);
  });

  it("is stable for identical calls, so unchanged behaviour shows no divergence", () => {
    const a = toolCallBehaviorSignature({ auditType: "TOOL_CALL_ALLOWED", toolName: "fs.read", denialGuard: null });
    const b = toolCallBehaviorSignature({ auditType: "TOOL_CALL_ALLOWED", toolName: "fs.read", denialGuard: null });

    expect(a).toBe(b);
  });
});

describe("the projection declares its version", () => {
  it("carries a version, because the mapping is a judgement", () => {
    expect(SESSION_DRIFT_PROJECTION_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-p52b$/);
  });
});

describe("signed provenance is carried, not faked", () => {
  it("carries the hash-chain entry when the evidence row is signed", () => {
    // The engine raises a HIGH alert when a receipt has no signed refs. It is
    // the right alert: AMC's whole claim is signed evidence, so a drift receipt
    // that cannot be verified cryptographically is an assertion.
    const [row] = projectToolCallDriftRows([auditEvent({ id: "a", minute: 0, auditType: "TOOL_CALL_ALLOWED" })]);

    expect(row?.signedEvidenceRefs).toEqual(["hash-a"]);
  });

  it("omits the signed ref rather than faking one when the row is unsigned", () => {
    const unsigned = parseEvidenceEvent({
      id: "u", ts: BASE, session_id: "s1", runtime: "amc", event_type: "audit",
      payload_path: null, payload_inline: "e", payload_sha256: "sha-u",
      meta_json: JSON.stringify({ auditType: "TOOL_CALL_ALLOWED", toolName: "fs.read" }),
      prev_event_hash: "prev", event_hash: "hash-u", writer_sig: ""
    });
    const [row] = projectToolCallDriftRows([unsigned]);

    expect(row, "the sample still counts").toBeDefined();
    expect(row?.signedEvidenceRefs, "but it claims no signature it does not have").toBeUndefined();
  });
});
