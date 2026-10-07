import { describe, expect, test } from "vitest";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";
import { level, likert, type Level0to5, type Likert1to5 } from "../src/score/units.js";

// P0-21: base scores are levels 0-5 and domain answers are Likert 1-5; percentages are no longer accepted.
function buildBaseScores(value: number): Record<string, Level0to5> {
  const out: Record<string, Level0to5> = {};
  for (let index = 1; index <= 42; index += 1) {
    out[`AMC-${index}`] = level(value);
  }
  return out;
}

function buildDomainScores(domain: Parameters<typeof getDomainPackQuestions>[0], value: number): Record<string, Likert1to5> {
  const out: Record<string, Likert1to5> = {};
  for (const question of getDomainPackQuestions(domain)) {
    out[question.id] = likert(value);
  }
  return out;
}

describe("domain assessment engine", () => {
  test("computes composite score with 60/40 weighting", () => {
    const result = assessDomain({
      agentId: "agent-hc",
      domain: "health",
      baseScores: buildBaseScores(4),
      domainQuestionScores: buildDomainScores("health", 5)
    });

    expect(result.baseScore).toBe(80); // L4
    expect(result.domainScore).toBe(100); // Likert 5
    expect(result.compositeScore).toBe(88); // (80*0.6) + (100*0.4)
    expect(result.level).toBe("L4");
    expect(result.activeModules.length).toBe(161);
    expect(result.roadmap.length).toBe(3);
  });

  test("identifies compliance gaps when controls are weak", () => {
    const result = assessDomain({
      agentId: "agent-gov",
      domain: "governance",
      baseScores: buildBaseScores(2),
      domainQuestionScores: buildDomainScores("governance", 1)
    });

    expect(result.level).toBe("L1");
    expect(result.complianceGaps.length).toBeGreaterThan(0);
    expect(result.regulatoryWarnings.length).toBeGreaterThan(0);
  });

  // P0-21: certificationReadiness is gone; high answers reach L5 with no gaps and certify nothing.
  test("reaches L5 with no gaps for high-maturity answers", () => {
    const result = assessDomain({
      agentId: "agent-tech",
      domain: "technology",
      baseScores: buildBaseScores(5),
      domainQuestionScores: buildDomainScores("technology", 5)
    });

    expect(result.compositeScore).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("L5");
    expect("certificationReadiness" in result).toBe(false);
    expect(result.complianceGaps.length).toBe(0);
  });
});
