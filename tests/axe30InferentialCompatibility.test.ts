import { describe, expect, it, vi } from "vitest";
import { buildEvalReport, cohensD, createEvalConfig, type EvalTrial } from "../src/benchmarks/evalHarness.js";
import { analyzeParameterSensitivity } from "../src/steer/parameterMatrix.js";
import { simulateConvergence, SYNTHETIC_PROFILES } from "../src/steer/research/eval_feedback_convergence.js";
import { wilson95 } from "../src/assurance/judges/calibration.js";
import { computePaperStatistics } from "../src/benchmarks/academicPaper.js";
import { ContinuousRedTeam, type RedTeamTarget, type RegressionAlert } from "../src/shield/continuousRedTeam.js";
import { bootstrapMacroF1CI, type LabeledSample } from "../src/steer/research/eval_autotune_classification.js";
import { computePercentiles, evaluateTierDiscrimination } from "../src/steer/research/eval_scoring_calibration.js";

vi.mock("../src/enforce/evidenceEmitter.js", () => ({ emitGuardEvent: vi.fn() }));
vi.mock("../src/steer/microScore.js", () => ({
  microScore: (text: string) => ({ composite: Number(text) }),
}));

describe("AXE-30 inferential compatibility", () => {
  it("keeps matrix sensitivity as population variance of equally weighted group means", () => {
    const results = [
      { combinationId: "a", params: { temperature: 0 }, responseText: "", microScore: 0, latencyMs: 0 },
      { combinationId: "b", params: { temperature: 0 }, responseText: "", microScore: 2, latencyMs: 0 },
      { combinationId: "c", params: { temperature: 1 }, responseText: "", microScore: 3, latencyMs: 0 },
    ];
    expect(analyzeParameterSensitivity(results, [{ name: "temperature", values: [0, 1] }])).toEqual({ temperature: 1 });
  });

  it("does not classify an absent feedback trace as stable from empty descriptive variance", () => {
    expect(simulateConvergence(SYNTHETIC_PROFILES[0]!, 0)).toMatchObject({ trace: [], stable: false });
    expect(simulateConvergence(SYNTHETIC_PROFILES[0]!, 1).stable).toBe(true);
  });

  it("keeps Wilson calibration absent/invalid observations unknown", () => {
    expect(wilson95(0, 0)).toBeNull();
    expect(wilson95(1.5, 10)).toBeNull();
    expect(wilson95(11, 10)).toBeNull();
    expect(wilson95(0, 25)).toEqual([0, 0.13319649395317874]);
  });

  it("keeps the eval harness three-decimal rounding and singleton pooling policy", () => {
    expect(cohensD([1, 2, 4], [5, 9, 10, 11])).toBe(-2.846);
    expect(cohensD([5], [1, 3, 5])).toBe(1);
    expect(cohensD([1, 3, 5], [5])).toBe(-1);
    expect(cohensD([5], [2])).toBeNaN();
  });

  it("keeps paper normal-approximation intervals and variance-weighted effects", () => {
    const config = createEvalConfig({
      name: "Unequal groups", description: "Interval compatibility", hypotheses: [],
      independentVars: [{ name: "condition", values: ["A", "B"] }], dependentVars: ["score"],
    });
    const trials: EvalTrial[] = [[1, 3, 6], [2, 9]].flatMap((values, condition) =>
      values.map((score, index) => ({
        trialId: `${condition}-${index}`, conditionId: `cond-${condition}`, variables: {},
        metrics: { score }, startedAt: "", completedAt: "", durationMs: 0,
      })),
    );
    expect(computePaperStatistics(buildEvalReport(config, trials), "score")).toEqual({
      metric: "score", meanDifference: -2.167, effectSize: -0.616, standardError: 3.79,
      confidenceInterval95: { lower: -9.594, upper: 5.261 }, isSignificant: false,
    });
  });

  it("keeps the red-team normal tail and baseline variance for a singleton current round", async () => {
    const successfulAttacks = [0, 1, 0, 1, 2];
    let round = 0;
    let attackIndex = 0;
    const target: RedTeamTarget = {
      id: "trend-fixture", name: "Trend fixture", systemPurpose: "Pin trend statistics",
      evaluator: async (attack) => ({
        attackId: attack.id, succeeded: attackIndex++ < successfulAttacks[round]!, response: "fixture",
        latencyMs: 1, bypassedDefenses: [], detectedBy: [], bypassConfidence: 0,
      }),
    };
    const engine = new ContinuousRedTeam({
      intervalMs: 60000, attacksPerRound: 4, maxEvolutionDepth: 0, regressionAlertThreshold: 0.2,
      targetProfiles: [target], enableAutoEscalation: false, independentRatio: 1,
      mutationRate: 0, crossoverRate: 0, elitePoolSize: 5,
    });
    const alerts: RegressionAlert[] = [];
    engine.on("regression", (alert: RegressionAlert) => alerts.push(alert));
    for (; round < successfulAttacks.length; round++) {
      attackIndex = 0;
      await engine.runAllTargets();
    }
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      previousSuccessRate: 0.125, currentSuccessRate: 0.5, pValue: 0.0201, significant: true,
    });
  });

  it("keeps labeled-row macro-F1 resampling, its seed stream and floor endpoints", () => {
    const samples: LabeledSample[] = [
      { prompt: "code-1", expected: "code" }, { prompt: "analytical-1", expected: "code" },
      { prompt: "code-2", expected: "code" }, { prompt: "analytical-2", expected: "analytical" },
      { prompt: "code-3", expected: "analytical" }, { prompt: "code-4", expected: "analytical" },
    ];
    const classify = (prompt: string) => prompt.startsWith("code") ? "code" as const : "analytical" as const;
    expect(bootstrapMacroF1CI(samples, classify, 17, 17)).toEqual([0.0571, 0.3314]);
    expect(bootstrapMacroF1CI(samples, classify, 17, 17)).toEqual([0.0571, 0.3314]);
  });

  it("keeps calibration's equal-weight variances for unequal tier populations", () => {
    expect(evaluateTierDiscrimination([
      { tier: "excellent", text: "0.9" }, { tier: "excellent", text: "0.8" },
      { tier: "excellent", text: "0.7" }, { tier: "good", text: "0.6" },
      { tier: "mediocre", text: "0.5" }, { tier: "poor", text: "0.2" }, { tier: "poor", text: "0.4" },
    ]).effectSize).toBe(4.0825);
  });

  it("keeps calibration's floor(p*n) order statistics instead of interpolation", () => {
    expect(computePercentiles([
      { tier: "poor", text: "0.1" }, { tier: "mediocre", text: "0.3" },
      { tier: "good", text: "0.6" }, { tier: "excellent", text: "1" },
    ])).toEqual({ p5: 0.1, p25: 0.3, p50: 0.6, p75: 1, p95: 1 });
  });
});
