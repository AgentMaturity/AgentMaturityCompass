import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreFailSecureGovernance } from "../../src/score/failSecureGovernance.js";
import { scoreReasoningEfficiency } from "../../src/score/reasoningEfficiency.js";
import { scoreOutputIntegrityMaturity } from "../../src/score/outputIntegrityMaturity.js";
import { markAsAmcCheckout } from "../helpers/amcCheckout.js";

/**
 * Criteria whose only evidence is AMC's own source tree cannot be judged
 * against a real agent. Counting them as failures silently capped what any
 * customer could score — ISO 42001 sat at 5 of 8 controls no matter what the
 * operator had in place.
 *
 * They are now excluded from the denominator and reported instead, so a score
 * always states what it was computed over. The risk of that trade is a score
 * over a shrunken base looking better than it is, so these tests pin both
 * halves: the exclusion, and its disclosure.
 */
const withTemp = <T>(fn: (dir: string) => T): T => {
  const dir = mkdtempSync(join(tmpdir(), "amc-denominator-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("assessable-criteria denominator", () => {
  it("scores over assessable criteria only, and says how many", () => {
    withTemp((dir) => {
      const result = scoreFailSecureGovernance(dir);
      expect(result.totalCriteria).toBe(7);
      expect(result.assessedCriteria).toBeLessThan(result.totalCriteria!);
      expect(result.assessedCriteria! + result.notAssessableCriteria!).toBe(result.totalCriteria);
    });
  });

  it("never reports a skipped criterion as a gap", () => {
    withTemp((dir) => {
      const result = scoreOutputIntegrityMaturity(dir);
      // Every criterion is either judged (and possibly a gap) or skipped.
      expect(result.gaps.length).toBeLessThanOrEqual(result.assessedCriteria!);
      expect(result.gaps.length + result.notAssessableCriteria!).toBeLessThanOrEqual(
        result.totalCriteria!
      );
    });
  });

  it("discloses skipped criteria instead of hiding them", () => {
    withTemp((dir) => {
      const result = scoreOutputIntegrityMaturity(dir);
      expect(result.notAssessableCriteria).toBeGreaterThan(0);
      expect(result.recommendations.join(" ")).toMatch(/could not be assessed/);
    });
  });

  it("judges every criterion inside an AMC checkout", () => {
    withTemp((dir) => {
      markAsAmcCheckout(dir);
      const result = scoreFailSecureGovernance(dir);
      expect(result.notAssessableCriteria).toBe(0);
      expect(result.assessedCriteria).toBe(result.totalCriteria);
      expect(result.recommendations.join(" ")).not.toMatch(/could not be assessed/);
    });
  });

  it("lets real workspace evidence move the score", () => {
    withTemp((dir) => {
      const before = scoreReasoningEfficiency(dir);
      mkdirSync(join(dir, ".amc"), { recursive: true });
      writeFileSync(join(dir, ".amc/reasoning_budget.json"), "{}");
      const after = scoreReasoningEfficiency(dir);
      expect(after.score).toBeGreaterThan(before.score);
      // The denominator is unchanged: adding evidence must not shrink the base.
      expect(after.assessedCriteria).toBe(before.assessedCriteria);
    });
  });
});
