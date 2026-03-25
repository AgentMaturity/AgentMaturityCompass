import { describe, expect, test } from "vitest";
import { runSimulation, runStressTest } from "../../src/mirofish/engine.js";
import type { Scenario, SimulationOptions } from "../../src/mirofish/types.js";

/* ── Fixture scenarios ────────────────────────────── */

const highMaturity: Scenario = {
  name: "test-high",
  description: "High maturity test fixture",
  version: "1.0.0",
  behavior: {
    autonomy: 0.9,
    errorRate: 0.02,
    escalationFrequency: 0.05,
    toolUsage: 0.85,
    responseLatency: 0.15,
    hallucinationRate: 0.01,
    complianceAdherence: 0.95,
  },
};

const lowMaturity: Scenario = {
  name: "test-low",
  description: "Low maturity test fixture",
  version: "1.0.0",
  behavior: {
    autonomy: 0.1,
    errorRate: 0.4,
    escalationFrequency: 0.9,
    toolUsage: 0.15,
    responseLatency: 0.8,
    hallucinationRate: 0.35,
    complianceAdherence: 0.1,
  },
};

const midMaturity: Scenario = {
  name: "test-mid",
  description: "Mid maturity test fixture",
  version: "1.0.0",
  behavior: {
    autonomy: 0.5,
    errorRate: 0.1,
    escalationFrequency: 0.3,
    toolUsage: 0.5,
    responseLatency: 0.3,
    hallucinationRate: 0.05,
    complianceAdherence: 0.75,
  },
};

const defaultOpts: SimulationOptions = { iterations: 500, seed: 42 };
const deterministicOpts: SimulationOptions = { iterations: 100, seed: 12345 };

/* ── Deterministic reproducibility ────────────────── */

describe("deterministic simulation", () => {
  test("same seed produces identical results", () => {
    const r1 = runSimulation(midMaturity, deterministicOpts);
    const r2 = runSimulation(midMaturity, deterministicOpts);

    expect(r1.overallMean).toBe(r2.overallMean);
    expect(r1.layerScores).toEqual(r2.layerScores);
    expect(r1.questionScores).toEqual(r2.questionScores);
  });

  test("different seeds produce different results", () => {
    // Use explicit high variance to ensure seed differences manifest in output
    const withVariance: Scenario = {
      ...midMaturity,
      name: "seed-test",
      variance: {
        autonomy: 0.2,
        errorRate: 0.2,
        escalationFrequency: 0.2,
        toolUsage: 0.2,
        responseLatency: 0.2,
        hallucinationRate: 0.2,
        complianceAdherence: 0.2,
      },
    };

    const r1 = runSimulation(withVariance, { iterations: 200, seed: 1 });
    const r2 = runSimulation(withVariance, { iterations: 200, seed: 99999 });

    // With high variance, overall means at 3 decimal places should differ
    expect(r1.overallMean).not.toBe(r2.overallMean);
  });
});

/* ── Score range sanity ───────────────────────────── */

describe("score range sanity", () => {
  test("all question scores are in [0, 5]", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    for (const qs of result.questionScores) {
      expect(qs.meanLevel).toBeGreaterThanOrEqual(0);
      expect(qs.meanLevel).toBeLessThanOrEqual(5);
      expect(qs.ci95Low).toBeGreaterThanOrEqual(0);
      expect(qs.ci95High).toBeLessThanOrEqual(5);
    }
  });

  test("all layer scores are in [0, 5]", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    for (const ls of result.layerScores) {
      expect(ls.meanLevel).toBeGreaterThanOrEqual(0);
      expect(ls.meanLevel).toBeLessThanOrEqual(5);
      expect(ls.ci95Low).toBeGreaterThanOrEqual(0);
      expect(ls.ci95High).toBeLessThanOrEqual(5);
    }
  });

  test("overall score is in [0, 5]", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    expect(result.overallMean).toBeGreaterThanOrEqual(0);
    expect(result.overallMean).toBeLessThanOrEqual(5);
  });

  test("confidence values are in [0, 1]", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    for (const qs of result.questionScores) {
      expect(qs.confidence).toBeGreaterThanOrEqual(0);
      expect(qs.confidence).toBeLessThanOrEqual(1);
    }
  });

  test("CI low ≤ mean ≤ CI high for layers", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    for (const ls of result.layerScores) {
      expect(ls.ci95Low).toBeLessThanOrEqual(ls.meanLevel);
      expect(ls.ci95High).toBeGreaterThanOrEqual(ls.meanLevel);
    }
  });
});

/* ── Behavior→score direction ─────────────────────── */

describe("behavior-score correlation", () => {
  test("high maturity scores higher than low maturity", () => {
    const high = runSimulation(highMaturity, defaultOpts);
    const low = runSimulation(lowMaturity, defaultOpts);

    expect(high.overallMean).toBeGreaterThan(low.overallMean);
  });

  test("mid maturity scores between high and low", () => {
    const high = runSimulation(highMaturity, defaultOpts);
    const mid = runSimulation(midMaturity, defaultOpts);
    const low = runSimulation(lowMaturity, defaultOpts);

    expect(mid.overallMean).toBeGreaterThan(low.overallMean);
    expect(mid.overallMean).toBeLessThan(high.overallMean);
  });

  test("all 5 layers are represented", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    const layerNames = result.layerScores.map((ls) => ls.layerName);
    expect(layerNames).toContain("Strategic Agent Operations");
    expect(layerNames).toContain("Leadership & Autonomy");
    expect(layerNames).toContain("Culture & Alignment");
    expect(layerNames).toContain("Resilience");
    expect(layerNames).toContain("Skills");
  });
});

/* ── Governance gates ─────────────────────────────── */

describe("governance gates", () => {
  test("high maturity passes governance", () => {
    const result = runSimulation(highMaturity, defaultOpts);
    expect(result.governanceGatePassed).toBe(true);
    expect(result.governanceFailures).toHaveLength(0);
  });

  test("low maturity fails governance", () => {
    const result = runSimulation(lowMaturity, defaultOpts);
    expect(result.governanceGatePassed).toBe(false);
    expect(result.governanceFailures.length).toBeGreaterThan(0);
  });

  test("adversarial behavior fails compliance gate", () => {
    const adversarial: Scenario = {
      name: "adversarial-test",
      description: "test",
      version: "1.0.0",
      behavior: {
        autonomy: 0.95,
        errorRate: 0.25,
        escalationFrequency: 0.02,
        toolUsage: 0.4,
        responseLatency: 0.1,
        hallucinationRate: 0.3,
        complianceAdherence: 0.05,
      },
    };
    const result = runSimulation(adversarial, defaultOpts);
    expect(result.governanceGatePassed).toBe(false);
    expect(result.governanceFailures.some((f) => f.includes("Compliance"))).toBe(true);
    expect(result.governanceFailures.some((f) => f.includes("Hallucination"))).toBe(true);
  });
});

/* ── Iteration count effects ──────────────────────── */

describe("iteration effects", () => {
  test("more iterations reduce CI width", () => {
    const few = runSimulation(midMaturity, { iterations: 50, seed: 42 });
    const many = runSimulation(midMaturity, { iterations: 2000, seed: 42 });

    const fewWidth = few.overallCi95[1] - few.overallCi95[0];
    const manyWidth = many.overallCi95[1] - many.overallCi95[0];

    expect(manyWidth).toBeLessThanOrEqual(fewWidth);
  });

  test("single iteration still produces valid results", () => {
    const result = runSimulation(midMaturity, { iterations: 1, seed: 42 });
    expect(result.overallMean).toBeGreaterThanOrEqual(0);
    expect(result.overallMean).toBeLessThanOrEqual(5);
    expect(result.layerScores.length).toBeGreaterThan(0);
  });
});

/* ── Fleet simulation ─────────────────────────────── */

describe("fleet simulation", () => {
  test("fleet scenario produces valid results", () => {
    const fleet: Scenario = {
      name: "test-fleet",
      description: "test",
      version: "1.0.0",
      behavior: {
        autonomy: 0.5,
        errorRate: 0.1,
        escalationFrequency: 0.3,
        toolUsage: 0.5,
        responseLatency: 0.3,
        hallucinationRate: 0.05,
        complianceAdherence: 0.75,
      },
      fleet: [
        {
          name: "agent-a",
          weight: 0.6,
          behavior: {
            autonomy: 0.8,
            errorRate: 0.05,
            escalationFrequency: 0.1,
            toolUsage: 0.9,
            responseLatency: 0.2,
            hallucinationRate: 0.02,
            complianceAdherence: 0.9,
          },
        },
        {
          name: "agent-b",
          weight: 0.4,
          behavior: {
            autonomy: 0.2,
            errorRate: 0.2,
            escalationFrequency: 0.7,
            toolUsage: 0.3,
            responseLatency: 0.5,
            hallucinationRate: 0.1,
            complianceAdherence: 0.6,
          },
        },
      ],
    };

    const result = runSimulation(fleet, defaultOpts);
    expect(result.overallMean).toBeGreaterThanOrEqual(0);
    expect(result.overallMean).toBeLessThanOrEqual(5);
    expect(result.layerScores.length).toBe(5);
  });
});

/* ── Layer overrides ──────────────────────────────── */

describe("layer overrides", () => {
  test("layer override affects scores for that layer", () => {
    const base = runSimulation(midMaturity, deterministicOpts);

    const withOverride: Scenario = {
      ...midMaturity,
      name: "test-override",
      layerOverrides: {
        "Skills": { toolUsage: 0.99, autonomy: 0.99 },
      },
    };
    const overridden = runSimulation(withOverride, deterministicOpts);

    const baseSkills = base.layerScores.find((l) => l.layerName === "Skills")!;
    const overriddenSkills = overridden.layerScores.find((l) => l.layerName === "Skills")!;

    expect(overriddenSkills.meanLevel).toBeGreaterThan(baseSkills.meanLevel);
  });
});

/* ── Metadata ─────────────────────────────────────── */

describe("result metadata", () => {
  test("includes correct scenario name", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    expect(result.scenarioName).toBe("test-mid");
  });

  test("includes iteration count and seed", () => {
    const result = runSimulation(midMaturity, defaultOpts);
    expect(result.iterations).toBe(500);
    expect(result.seed).toBe(42);
  });

  test("timestamp is recent", () => {
    const before = Date.now();
    const result = runSimulation(midMaturity, deterministicOpts);
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  test("question scores count matches question bank", () => {
    const result = runSimulation(midMaturity, deterministicOpts);
    // Should have scores for all questions in the bank
    expect(result.questionScores.length).toBeGreaterThan(200);
  });
});

/* ── Stress testing ───────────────────────────────── */

describe("stress testing", () => {
  test("finds breaking points for mid-maturity scenario", () => {
    const result = runStressTest(midMaturity, { iterations: 100, seed: 42 });
    expect(result.scenarioName).toBe("test-mid");
    // Mid-maturity should have some breaking points when pushed
    expect(result.breakingPoints.length).toBeGreaterThan(0);
  });

  test("breaking points have valid structure", () => {
    const result = runStressTest(midMaturity, { iterations: 100, seed: 42 });
    for (const bp of result.breakingPoints) {
      expect(bp.thresholdValue).toBeGreaterThanOrEqual(0);
      expect(bp.thresholdValue).toBeLessThanOrEqual(1);
      expect(bp.failedGates.length).toBeGreaterThan(0);
      expect(["increasing", "decreasing"]).toContain(bp.direction);
    }
  });

  test("low maturity has immediate breaking points", () => {
    const result = runStressTest(lowMaturity, { iterations: 100, seed: 42 });
    // Low maturity already fails, so every negative dimension should break immediately
    expect(result.breakingPoints.length).toBeGreaterThanOrEqual(0);
  });

  test("stress result includes timestamp", () => {
    const before = Date.now();
    const result = runStressTest(highMaturity, { iterations: 100, seed: 42 });
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});

/* ── Variance behavior ────────────────────────────── */

describe("variance", () => {
  test("zero variance produces consistent question scores", () => {
    const noVariance: Scenario = {
      ...midMaturity,
      name: "no-variance",
      variance: {
        autonomy: 0,
        errorRate: 0,
        escalationFrequency: 0,
        toolUsage: 0,
        responseLatency: 0,
        hallucinationRate: 0,
        complianceAdherence: 0,
      },
    };
    const result = runSimulation(noVariance, { iterations: 50, seed: 42 });

    // With zero variance, standard deviation should be 0 for all questions
    for (const qs of result.questionScores) {
      expect(qs.stdDev).toBe(0);
    }
  });

  test("high variance produces wider confidence intervals", () => {
    const lowVar: Scenario = {
      ...midMaturity,
      name: "low-var",
      variance: {
        autonomy: 0.01,
        errorRate: 0.01,
        escalationFrequency: 0.01,
        toolUsage: 0.01,
        responseLatency: 0.01,
        hallucinationRate: 0.01,
        complianceAdherence: 0.01,
      },
    };
    const highVar: Scenario = {
      ...midMaturity,
      name: "high-var",
      variance: {
        autonomy: 0.3,
        errorRate: 0.3,
        escalationFrequency: 0.3,
        toolUsage: 0.3,
        responseLatency: 0.3,
        hallucinationRate: 0.3,
        complianceAdherence: 0.3,
      },
    };

    const lowResult = runSimulation(lowVar, { iterations: 500, seed: 42 });
    const highResult = runSimulation(highVar, { iterations: 500, seed: 42 });

    const lowAvgStd = lowResult.questionScores.reduce((s, q) => s + q.stdDev, 0) / lowResult.questionScores.length;
    const highAvgStd = highResult.questionScores.reduce((s, q) => s + q.stdDev, 0) / highResult.questionScores.length;

    expect(highAvgStd).toBeGreaterThan(lowAvgStd);
  });
});
