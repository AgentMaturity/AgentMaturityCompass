import { describe, expect, it } from "vitest";
import { evaluateGate, parseEvidenceEvent, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import { selectRelevantEvents } from "../src/diagnostic/runner.js";
import { AMC_PUBLIC_METHODOLOGY_VERSION } from "../src/methodology/publicMethodology.js";
import type { Gate } from "../src/types.js";

/**
 * The evidence-gating correction (ADR-0022, methodology 2026.08.25-r224).
 *
 * Two behaviours the published methodology described and the code did not
 * implement:
 *
 * 1. `requiredEvidenceTypes` was a whitelist FILTER on what got counted, not a
 *    requirement that those types be present. A gate declaring
 *    [stdout, audit, metric] passed on stdout alone — while
 *    docs/SCORING_METHODOLOGY.md told users "Required evidence types for each
 *    level".
 * 2. Below L3, a question with no evidence tagged to it was scored against
 *    EVERY event in the window, including events tagged to other questions.
 *    The code's own warning read "add meta.questionId tagging to avoid score
 *    inflation".
 *
 * Both made scores higher than the methodology claimed they were. Both are
 * corrected here, and both make scores stricter.
 */
const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-08-20T12:00:00Z");

/**
 * Built through `parseEvidenceEvent`, not hand-shaped.
 *
 * `ParsedEvidenceEvent` carries a parsed `.meta` alongside the raw
 * `meta_json`, and a fixture that sets only the JSON string looks right and
 * throws the moment anything reads a meta field.
 */
function event(overrides: {
  id: string;
  type: string;
  session: string;
  dayOffset: number;
  questionId?: string;
}): ParsedEvidenceEvent {
  return parseEvidenceEvent({
    id: overrides.id,
    ts: BASE + overrides.dayOffset * DAY,
    session_id: overrides.session,
    runtime: "unknown",
    event_type: overrides.type as ParsedEvidenceEvent["event_type"],
    payload_path: null,
    payload_inline: "evidence",
    payload_sha256: `sha-${overrides.id}`,
    meta_json: JSON.stringify({
      trustTier: "OBSERVED",
      ...(overrides.questionId ? { questionId: overrides.questionId } : {})
    }),
    prev_event_hash: "prev",
    event_hash: "hash",
    writer_sig: "sig"
  });
}

const gateFor = (types: string[]): Gate => ({
  level: 3,
  requiredEvidenceTypes: types as Gate["requiredEvidenceTypes"],
  minEvents: 2,
  minSessions: 2,
  minDistinctDays: 2,
  acceptedTrustTiers: ["OBSERVED"],
  mustInclude: { metaKeys: [], auditTypes: [] },
  mustNotInclude: { auditTypes: [] }
});

describe("required evidence types are required", () => {
  it("refuses a level when a named type is absent", () => {
    // The exact case that used to pass: three stdout events against a gate
    // naming three types.
    const verdict = evaluateGate(gateFor(["stdout", "audit", "metric"]), [
      event({ id: "e0", type: "stdout", session: "s1", dayOffset: 0 }),
      event({ id: "e1", type: "stdout", session: "s2", dayOffset: 1 }),
      event({ id: "e2", type: "stdout", session: "s2", dayOffset: 1 })
    ]);

    expect(verdict.pass, "a gate naming three types is not satisfied by one").toBe(false);
  });

  it("names which types are missing, so the gap is actionable", () => {
    // "failed gate 3" alone tells an operator nothing they can act on.
    const verdict = evaluateGate(gateFor(["stdout", "audit", "metric"]), [
      event({ id: "e0", type: "stdout", session: "s1", dayOffset: 0 }),
      event({ id: "e1", type: "stdout", session: "s2", dayOffset: 1 })
    ]);

    expect(verdict.reason).toContain("missing evidence types=audit,metric");
  });

  it("passes when every named type is present", () => {
    // The correction must not make levels unreachable — only unreachable
    // without the evidence they name.
    const verdict = evaluateGate(gateFor(["stdout", "audit", "metric"]), [
      event({ id: "e0", type: "stdout", session: "s1", dayOffset: 0 }),
      event({ id: "e1", type: "audit", session: "s2", dayOffset: 1 }),
      event({ id: "e2", type: "metric", session: "s2", dayOffset: 1 })
    ]);

    expect(verdict.pass, `denied: ${verdict.reason}`).toBe(true);
  });

  it("still counts thresholds independently of the type requirement", () => {
    // Having every type is necessary, not sufficient: the event, session and
    // day thresholds still apply.
    const verdict = evaluateGate(gateFor(["stdout", "audit", "metric"]), [
      event({ id: "e0", type: "stdout", session: "s1", dayOffset: 0 }),
      event({ id: "e1", type: "audit", session: "s1", dayOffset: 0 }),
      event({ id: "e2", type: "metric", session: "s1", dayOffset: 0 })
    ]);

    expect(verdict.pass, "one session and one day is not two of each").toBe(false);
    expect(verdict.reason).toContain("sessions=1/2");
  });

  it("leaves a gate that names no types alone", () => {
    // Level 0 declares none, and must stay reachable with nothing at all —
    // otherwise every question becomes unscoreable.
    const verdict = evaluateGate(
      { ...gateFor([]), level: 0, minEvents: 0, minSessions: 0, minDistinctDays: 0 },
      []
    );
    expect(verdict.pass).toBe(true);
  });
});

describe("evidence counts only toward its own question", () => {
  it("does not lend another question's evidence at L0-L2", () => {
    // The inflation the code's own warning named. This used to return the
    // event, at every level below 3.
    const other = event({ id: "x", type: "stdout", session: "s1", dayOffset: 0, questionId: "AMC-1.2" });
    const selected = selectRelevantEvents("AMC-1.1", [other], 2);

    expect(selected, "evidence gathered for another question is not evidence for this one")
      .toHaveLength(0);
  });

  it("does not lend it at L3+ either, which was already true", () => {
    const other = event({ id: "x", type: "stdout", session: "s1", dayOffset: 0, questionId: "AMC-1.2" });
    expect(selectRelevantEvents("AMC-1.1", [other], 4)).toHaveLength(0);
  });

  it("returns evidence tagged to the question itself", () => {
    // The correction must not make tagged evidence unusable.
    const mine = event({ id: "m", type: "stdout", session: "s1", dayOffset: 0, questionId: "AMC-1.1" });
    expect(selectRelevantEvents("AMC-1.1", [mine], 2)).toHaveLength(1);
  });

  it("can be turned off for local diagnosis, and says so", () => {
    // The escape hatch survives, because someone debugging why a score is 0
    // needs to see what the old behaviour would have counted. It is not for
    // scoring a real workspace, and the methodology doc says as much.
    const prior = process.env["STRICT_EVIDENCE_BINDING"];
    process.env["STRICT_EVIDENCE_BINDING"] = "false";
    try {
      const other = event({ id: "x", type: "stdout", session: "s1", dayOffset: 0, questionId: "AMC-1.2" });
      expect(selectRelevantEvents("AMC-1.1", [other], 2)).toHaveLength(1);
    } finally {
      if (prior === undefined) delete process.env["STRICT_EVIDENCE_BINDING"];
      else process.env["STRICT_EVIDENCE_BINDING"] = prior;
    }
  });
});

describe("the methodology version records the change", () => {
  it("is past r223, because scores moved", () => {
    // A published methodology whose behaviour changes without its version
    // changing makes two different scores indistinguishable to a consumer.
    expect(AMC_PUBLIC_METHODOLOGY_VERSION).not.toBe("2026.07.29-r223");
    expect(AMC_PUBLIC_METHODOLOGY_VERSION).toBe("2026.08.25-r224");
  });
});
