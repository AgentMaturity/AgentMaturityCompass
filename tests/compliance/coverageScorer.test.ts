import { describe, expect, test } from "vitest";
import { coverageScore } from "../../src/compliance/coverageScorer.js";
import type { ComplianceCategoryResult, ComplianceCategoryStatus } from "../../src/compliance/mappingSchema.js";

function row(status: ComplianceCategoryStatus): ComplianceCategoryResult {
  const result = status === "SATISFIED" ? "pass" : status === "PARTIAL" || status === "MISSING" ? "fail" : "not_evaluated";
  return {
    id: `row-${status}`,
    framework: "SOC2",
    category: status,
    description: status,
    status,
    result,
    evidence: result === "not_evaluated" ? "incomplete" : "sufficient",
    dimensions: { applicability: { state: "applicable" }, evidence: result === "not_evaluated" ? "incomplete" : "sufficient", result,
      enforcement: { state: "none" }, review: "pending" },
    claimKind: "observed",
    claimReasons: [],
    admitted: [],
    rejected: [],
    notEvaluatedReasons: [],
    reasons: [],
    evidenceRefs: [],
    neededToSatisfy: []
  };
}

describe("coverageScore (P0-17)", () => {
  test("score is null when nothing was evaluated", () => {
    expect(coverageScore([]).score).toBeNull();
    const coverage = coverageScore([row("NOT_EVALUATED"), row("NOT_EVALUATED"), row("UNKNOWN")]);
    expect(coverage).toEqual({ satisfied: 0, partial: 0, missing: 0, unknown: 1, notEvaluated: 2, evaluated: 0, score: null });
  });

  test("only a pass earns credit; NOT_EVALUATED, UNKNOWN and legacy PARTIAL earn 0 and stay in the denominator", () => {
    expect(coverageScore([row("SATISFIED"), row("NOT_EVALUATED")]).score).toBe(0.5);
    expect(coverageScore([row("SATISFIED"), row("UNKNOWN")]).score).toBe(0.5);
    const coverage = coverageScore([row("SATISFIED"), row("PARTIAL"), row("MISSING"), row("NOT_EVALUATED")]);
    // P1-11: a partial result earns nothing (it earned 0.5 before).
    expect(coverage).toEqual({ satisfied: 1, partial: 1, missing: 1, unknown: 0, notEvaluated: 1, evaluated: 3, score: 0.25 });
  });
});

describe("coverageScore on top of P0-17 (P1-45, S6 rules ratified 2026-10-04)", () => {
  test("zero rows: not evaluated, never a score of 0", () => {
    expect(coverageScore([])).toEqual({ satisfied: 0, partial: 0, missing: 0, unknown: 0, notEvaluated: 0, evaluated: 0, score: null });
  });

  test("UNKNOWN earns 0 (it earned 0.25 before S6) and is not an evaluation", () => {
    expect(coverageScore([row("UNKNOWN")]).score).toBeNull();
    expect(coverageScore([row("SATISFIED"), row("UNKNOWN"), row("UNKNOWN"), row("UNKNOWN")]).score).toBe(0.25);
  });

  test("a self-reported PARTIAL is not an evaluation: the score stays null, not 0", () => {
    const selfReported = { ...row("PARTIAL"), claimKind: "self_reported" as const };
    expect(coverageScore([selfReported])).toEqual({ satisfied: 0, partial: 0, missing: 0, unknown: 0, notEvaluated: 1, evaluated: 0, score: null });
    // An observed PARTIAL (a report from before P1-11) still counts as evaluated and earns 0.
    expect(coverageScore([row("PARTIAL")])).toMatchObject({ partial: 1, evaluated: 1, score: 0 });
  });

  test.each(["", "   ", "\t"])("a row whose control id is %j throws instead of being scored", (id) => {
    expect(() => coverageScore([row("SATISFIED"), { ...row("SATISFIED"), id }])).toThrow(/has no control id; refusing to score it/);
  });
});
