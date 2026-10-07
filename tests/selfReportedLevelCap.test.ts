import { describe, expect, test } from "vitest";
import { evaluateGate, type ParsedEvidenceEvent } from "../src/diagnostic/gates.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import type { Gate, TrustTier } from "../src/types.js";

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.now() - 5 * DAY;
const QUESTION = "AMC-1.1";

/** Hand-shaped parsed events: the tier is the fixture's subject, so it is set directly. */
function evidence(tier: TrustTier): ParsedEvidenceEvent[] {
  const events: ParsedEvidenceEvent[] = [];
  const kinds: Array<[ParsedEvidenceEvent["event_type"], Record<string, unknown>]> = [
    ["stdout", {}], ["stdout", {}], ["review", {}],
    ["audit", { auditType: "ALIGNMENT_CHECK_PASS" }], ["metric", { metricKey: "alignment_rate" }]
  ];
  for (let day = 0; day < 3; day += 1) {
    kinds.forEach(([type, meta], index) => {
      const fullMeta = { questionId: QUESTION, ...meta };
      events.push({
        id: `e-${day}-${index}`, ts: BASE + day * DAY, session_id: `s-${day}`, runtime: "unknown",
        event_type: type, payload_path: null, payload_inline: "evidence", payload_sha256: `sha-${day}-${index}`,
        meta_json: JSON.stringify(fullMeta), prev_event_hash: "prev", event_hash: `hash-${day}-${index}`, writer_sig: "sig",
        meta: fullMeta, text: "evidence", trustTier: tier
      });
    });
  }
  return events;
}

/** The highest level whose gate passes, top down, as the diagnostic runner walks them. */
function supportedLevel(events: ParsedEvidenceEvent[]): number {
  const question = questionBank.find((q) => q.id === QUESTION)!;
  for (let level = 5; level >= 0; level -= 1) {
    if (evaluateGate(question.gates[level]!, events).pass) return level;
  }
  return 0;
}

describe("self-reported evidence caps at L1 (P0-21)", () => {
  test("L3 counts met only by SELF_REPORTED events support level 1", () => {
    expect(supportedLevel(evidence("SELF_REPORTED"))).toBe(1);
  });

  test("the same counts with OBSERVED events support level 3", () => {
    expect(supportedLevel(evidence("OBSERVED"))).toBe(3);
  });

  test("no base gate at L2 or above accepts SELF_REPORTED", () => {
    for (const question of questionBank) {
      for (const gate of question.gates.filter((g) => g.level >= 2)) {
        expect(gate.acceptedTrustTiers ?? [], `${question.id} L${gate.level}`).not.toContain("SELF_REPORTED");
      }
    }
  });

  test("a gate that lists no tiers defaults to OBSERVED and ATTESTED", () => {
    const gate: Gate = {
      level: 2, requiredEvidenceTypes: ["stdout"], minEvents: 1, minSessions: 1, minDistinctDays: 1,
      mustInclude: { metaKeys: [], auditTypes: [] }, mustNotInclude: { auditTypes: [] }
    };
    expect(evaluateGate(gate, evidence("SELF_REPORTED")).pass).toBe(false);
    expect(evaluateGate(gate, evidence("ATTESTED")).pass).toBe(true);
  });
});
