import { describe, expect, test } from "vitest";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";

function buildBaseScores(value: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let index = 1; index <= 42; index += 1) {
    out[`AMC-${index}`] = value;
  }
  return out;
}

function buildDomainScores(domain: Parameters<typeof getDomainPackQuestions>[0], value: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const question of getDomainPackQuestions(domain)) {
    out[question.id] = value;
  }
  return out;
}

describe("domain assessment engine", () => {
  test("computes composite score with 60/40 weighting", () => {
    const result = assessDomain({
      agentId: "agent-hc",
      domain: "health",
      baseScores: buildBaseScores(80),
      domainQuestionScores: buildDomainScores("health", 90)
    });

    expect(result.baseScore).toBe(80);
    expect(result.domainScore).toBe(90);
    expect(result.compositeScore).toBe(84); // (80*0.6) + (90*0.4)
    expect(result.level).toBe("L4");
    expect(result.activeModules.length).toBe(161);
    expect(result.roadmap.length).toBe(3);
  });

  test("identifies compliance gaps and blocks readiness when controls are weak", () => {
    const result = assessDomain({
      agentId: "agent-gov",
      domain: "governance",
      baseScores: buildBaseScores(45),
      domainQuestionScores: buildDomainScores("governance", 20)
    });

    expect(result.level).toBe("L1");
    expect(result.certificationReadiness).toBe(false);
    expect(result.complianceGaps.length).toBeGreaterThan(0);
    expect(result.regulatoryWarnings.length).toBeGreaterThan(0);
  });

  test("can reach certification readiness for high-maturity evidence", () => {
    const result = assessDomain({
      agentId: "agent-tech",
      domain: "technology",
      baseScores: buildBaseScores(90),
      domainQuestionScores: buildDomainScores("technology", 95)
    });

    expect(result.compositeScore).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("L5");
    expect(result.certificationReadiness).toBe(true);
    expect(result.complianceGaps.length).toBe(0);
  });
});
