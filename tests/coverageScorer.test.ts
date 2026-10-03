import { describe, expect, test } from "vitest";
import { coverageScore } from "../src/compliance/coverageScorer.js";
import type { ComplianceCategoryResult, ComplianceCategoryStatus } from "../src/compliance/mappingSchema.js";

function row(id: string, status: ComplianceCategoryStatus): ComplianceCategoryResult {
  return { id, framework: "DORA", category: "Art. 9 Protection and prevention", description: "d", status, reasons: [], evidenceRefs: [], neededToSatisfy: [] };
}

describe("coverageScore", () => {
  test("weights satisfied 1, partial 0.5, missing 0", () => {
    expect(coverageScore([row("a", "SATISFIED"), row("b", "PARTIAL"), row("c", "MISSING")])).toEqual({
      satisfied: 1, partial: 1, missing: 1, unknown: 0, score: 0.5
    });
  });

  test("an UNKNOWN control earns no credit", () => {
    expect(coverageScore([row("a", "UNKNOWN")]).score).toBe(0);
    expect(coverageScore([row("a", "SATISFIED"), row("b", "UNKNOWN")]).score).toBe(0.5);
  });

  test("an empty result scores zero", () => {
    expect(coverageScore([]).score).toBe(0);
  });

  test.each(["", "   "])("refuses a row whose control id is %j", (id) => {
    expect(() => coverageScore([row("a", "SATISFIED"), row(id, "SATISFIED")])).toThrow(/control id/);
  });
});
