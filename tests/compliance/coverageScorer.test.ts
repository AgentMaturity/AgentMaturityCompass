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

  test("NOT_EVALUATED and UNKNOWN earn 0 and stay in the denominator", () => {
    expect(coverageScore([row("SATISFIED"), row("NOT_EVALUATED")]).score).toBe(0.5);
    expect(coverageScore([row("SATISFIED"), row("UNKNOWN")]).score).toBe(0.5);
    const coverage = coverageScore([row("SATISFIED"), row("PARTIAL"), row("MISSING"), row("NOT_EVALUATED")]);
    expect(coverage).toEqual({ satisfied: 1, partial: 1, missing: 1, unknown: 0, notEvaluated: 1, evaluated: 3, score: 0.375 });
  });
});
