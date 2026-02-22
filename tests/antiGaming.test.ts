import { afterEach, describe, expect, test, vi } from "vitest";
import type { EvidenceEvent, Gate } from "../src/types.js";
import { evaluateGate, parseEvidenceEvent, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import { isStrictEvidenceBindingEnabled, selectRelevantEvents } from "../src/diagnostic/runner.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORIGINAL_STRICT_EVIDENCE_BINDING = process.env.STRICT_EVIDENCE_BINDING;
let eventSeq = 0;

function makeParsedEvent(params: {
  questionId?: string;
  trustTier?: string;
  ts?: number;
  eventType?: EvidenceEvent["event_type"];
  payload?: string;
  metaJson?: string;
  sessionId?: string;
} = {}): ParsedEvidenceEvent {
  eventSeq += 1;
  const meta =
    params.metaJson ??
    JSON.stringify({
      ...(params.questionId ? { questionId: params.questionId } : {}),
      ...(params.trustTier ? { trustTier: params.trustTier } : {})
    });
  return parseEvidenceEvent({
    id: `ev-${eventSeq}`,
    ts: params.ts ?? Date.now(),
    session_id: params.sessionId ?? `session-${eventSeq}`,
    runtime: "unknown",
    event_type: params.eventType ?? "audit",
    payload_path: null,
    payload_inline: params.payload ?? "evidence",
    payload_sha256: `sha-${eventSeq}`,
    meta_json: meta,
    prev_event_hash: "prev",
    event_hash: "hash",
    writer_sig: "sig"
  });
}

function makeLevel3Gate(overrides: Partial<Gate> = {}): Gate {
  return {
    level: 3,
    requiredEvidenceTypes: ["audit"],
    minEvents: 1,
    minSessions: 1,
    minDistinctDays: 1,
    requiredTrustTier: "OBSERVED",
    acceptedTrustTiers: ["OBSERVED"],
    mustInclude: {},
    mustNotInclude: {},
    ...overrides
  };
}

afterEach(() => {
  if (ORIGINAL_STRICT_EVIDENCE_BINDING === undefined) {
    delete process.env.STRICT_EVIDENCE_BINDING;
  } else {
    process.env.STRICT_EVIDENCE_BINDING = ORIGINAL_STRICT_EVIDENCE_BINDING;
  }
  vi.restoreAllMocks();
});

describe("anti-gaming: strict evidence binding", () => {
  test("strict evidence binding is enabled by default", () => {
    delete process.env.STRICT_EVIDENCE_BINDING;
    expect(isStrictEvidenceBindingEnabled()).toBe(true);
  });

  test("strict evidence binding can be disabled explicitly", () => {
    process.env.STRICT_EVIDENCE_BINDING = "false";
    expect(isStrictEvidenceBindingEnabled()).toBe(false);
  });

  test("selectRelevantEvents returns question-tagged evidence when available", () => {
    const q1 = makeParsedEvent({ questionId: "AMC-1.1", trustTier: "OBSERVED" });
    const q2 = makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED" });

    const selected = selectRelevantEvents("AMC-1.1", [q1, q2], 5);
    expect(selected).toEqual([q1]);
  });

  test("L3+ selection does not fallback when strict mode is enabled", () => {
    delete process.env.STRICT_EVIDENCE_BINDING;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unrelated = makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED" });

    const selected = selectRelevantEvents("AMC-1.1", [unrelated], 3);
    expect(selected).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("STRICT_EVIDENCE_BINDING=true blocked fallback");
  });

  test("L0-L2 selection warns and falls back when strict mode is enabled", () => {
    delete process.env.STRICT_EVIDENCE_BINDING;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unrelated = makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED" });

    const selected = selectRelevantEvents("AMC-1.1", [unrelated], 2);
    expect(selected).toEqual([unrelated]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Falling back to unbound evidence");
  });

  test("L3+ selection warns and falls back when strict mode is disabled", () => {
    process.env.STRICT_EVIDENCE_BINDING = "false";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unrelated = makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED" });

    const selected = selectRelevantEvents("AMC-1.1", [unrelated], 4);
    expect(selected).toEqual([unrelated]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Falling back to unbound evidence");
  });

  test("missing questionId binding does not inflate scoring to level 3+", () => {
    delete process.env.STRICT_EVIDENCE_BINDING;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unrelated = [
      makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED", sessionId: "a", ts: Date.now() - DAY_MS }),
      makeParsedEvent({ questionId: "AMC-1.2", trustTier: "OBSERVED", sessionId: "b", ts: Date.now() })
    ];
    const gate = makeLevel3Gate();

    const selected = selectRelevantEvents("AMC-1.1", unrelated, 3);
    const evaluation = evaluateGate(gate, selected);

    expect(selected).toHaveLength(0);
    expect(evaluation.pass).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("anti-gaming: conservative trust parsing", () => {
  test("unknown trust metadata defaults to SELF_REPORTED", () => {
    const parsed = makeParsedEvent({ metaJson: JSON.stringify({ trustTier: "UNRECOGNIZED" }) });
    expect(parsed.trustTier).toBe("SELF_REPORTED");
  });

  test("invalid metadata defaults to SELF_REPORTED", () => {
    const parsed = makeParsedEvent({ metaJson: "{not-json" });
    expect(parsed.trustTier).toBe("SELF_REPORTED");
  });

  test("known trust metadata is preserved for fresh evidence", () => {
    const parsed = makeParsedEvent({ trustTier: "ATTESTED", ts: Date.now() - 5 * DAY_MS });
    expect(parsed.trustTier).toBe("ATTESTED");
  });

  test("stale OBSERVED evidence degrades to ATTESTED", () => {
    const parsed = makeParsedEvent({ trustTier: "OBSERVED", ts: Date.now() - 95 * DAY_MS });
    expect(parsed.trustTier).toBe("ATTESTED");
  });

  test("stale OBSERVED_HARDENED evidence degrades to OBSERVED", () => {
    const parsed = makeParsedEvent({ trustTier: "OBSERVED_HARDENED", ts: Date.now() - 95 * DAY_MS });
    expect(parsed.trustTier).toBe("OBSERVED");
  });

  test("stale ATTESTED evidence degrades to SELF_REPORTED", () => {
    const parsed = makeParsedEvent({ trustTier: "ATTESTED", ts: Date.now() - 95 * DAY_MS });
    expect(parsed.trustTier).toBe("SELF_REPORTED");
  });

  test("evidence newer than 90 days does not degrade", () => {
    const parsed = makeParsedEvent({ trustTier: "OBSERVED", ts: Date.now() - (90 * DAY_MS - 1000) });
    expect(parsed.trustTier).toBe("OBSERVED");
  });
});

describe("anti-gaming: mustNotInclude trust filtering", () => {
  test("mustNotInclude audit checks ignore excluded audits outside accepted trust tiers", () => {
    const gate = makeLevel3Gate({
      mustNotInclude: { auditTypes: ["UNSUPPORTED_HIGH_CLAIM"] }
    });
    const observed = makeParsedEvent({ trustTier: "OBSERVED", payload: "safe audit", questionId: "AMC-1.1" });
    const selfReportedExcluded = makeParsedEvent({
      trustTier: "SELF_REPORTED",
      payload: "unsafe audit",
      questionId: "AMC-1.1",
      metaJson: JSON.stringify({ questionId: "AMC-1.1", trustTier: "SELF_REPORTED", auditType: "UNSUPPORTED_HIGH_CLAIM" })
    });

    const evaluation = evaluateGate(gate, [observed, selfReportedExcluded]);
    expect(evaluation.pass).toBe(true);
  });

  test("mustNotInclude text checks ignore excluded text outside accepted trust tiers", () => {
    const gate = makeLevel3Gate({
      mustNotInclude: { textRegex: ["forbidden"] }
    });
    const observed = makeParsedEvent({ trustTier: "OBSERVED", payload: "clean payload", questionId: "AMC-1.1" });
    const selfReportedExcluded = makeParsedEvent({
      trustTier: "SELF_REPORTED",
      payload: "forbidden marker",
      questionId: "AMC-1.1"
    });

    const evaluation = evaluateGate(gate, [observed, selfReportedExcluded]);
    expect(evaluation.pass).toBe(true);
  });

  test("mustNotInclude audit checks still block when excluded audit is in accepted trust tier", () => {
    const gate = makeLevel3Gate({
      mustNotInclude: { auditTypes: ["UNSUPPORTED_HIGH_CLAIM"] }
    });
    const excludedObserved = makeParsedEvent({
      trustTier: "OBSERVED",
      questionId: "AMC-1.1",
      metaJson: JSON.stringify({ questionId: "AMC-1.1", trustTier: "OBSERVED", auditType: "UNSUPPORTED_HIGH_CLAIM" })
    });

    const evaluation = evaluateGate(gate, [excludedObserved]);
    expect(evaluation.pass).toBe(false);
  });
});
