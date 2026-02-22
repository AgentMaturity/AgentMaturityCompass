import { describe, expect, test } from "vitest";
import {
  analyzeFailureModes,
  detectErrorAmplification,
  evaluateArchitectureTaskAlignment,
  scoreArchitectureTaskFit,
  scoreComplexityTax,
  scoreRedundancy,
  type ArchitectureProfile,
  type PipelineStageProfile,
  type TaskComplexityProfile
} from "../src/score/architectureTaskAlignment.js";

const baseTask: TaskComplexityProfile = {
  complexity: 6,
  stepCount: 7,
  integrationCount: 4,
  riskTier: "medium",
  requiresDeterminism: true,
  requiresHumanApproval: false,
  parallelismRequired: false
};

const baseArchitecture: ArchitectureProfile = {
  layerCount: 3,
  agentCount: 2,
  orchestrationDepth: 3,
  toolingSurface: 5,
  hasHumanCheckpoint: true,
  validationCoverage: 0.85,
  retryCoverage: 0.7,
  fallbackCoverage: 0.75,
  circuitBreakerCoverage: 0.7,
  observabilityCoverage: 0.8,
  criticalPathRedundancy: 1.2,
  singlePointOfFailureCount: 0
};

function makeTask(overrides: Partial<TaskComplexityProfile> = {}): TaskComplexityProfile {
  return { ...baseTask, ...overrides };
}

function makeArchitecture(overrides: Partial<ArchitectureProfile> = {}): ArchitectureProfile {
  return { ...baseArchitecture, ...overrides };
}

describe("scoreArchitectureTaskFit", () => {
  test("classifies proportional architecture as aligned", () => {
    const fit = scoreArchitectureTaskFit(makeTask(), makeArchitecture());
    expect(fit.classification).toBe("aligned");
    expect(fit.score).toBeGreaterThanOrEqual(60);
  });

  test("flags under-architected systems for complex critical tasks", () => {
    const fit = scoreArchitectureTaskFit(
      makeTask({
        complexity: 9,
        stepCount: 14,
        integrationCount: 8,
        riskTier: "critical",
        requiresHumanApproval: true,
        parallelismRequired: true
      }),
      makeArchitecture({
        layerCount: 1,
        agentCount: 1,
        orchestrationDepth: 1,
        toolingSurface: 2,
        hasHumanCheckpoint: false,
        validationCoverage: 0.3
      })
    );
    expect(fit.classification).toBe("under-architected");
    expect(fit.score).toBeLessThan(50);
  });

  test("flags over-architected systems for simple tasks", () => {
    const fit = scoreArchitectureTaskFit(
      makeTask({
        complexity: 2,
        stepCount: 2,
        integrationCount: 1,
        riskTier: "low"
      }),
      makeArchitecture({
        layerCount: 7,
        agentCount: 6,
        orchestrationDepth: 9,
        toolingSurface: 28
      })
    );
    expect(fit.classification).toBe("over-architected");
    expect(fit.score).toBeLessThan(60);
  });
});

describe("detectErrorAmplification", () => {
  test("detects compounding errors in multi-step pipeline", () => {
    const stages: PipelineStageProfile[] = [
      { stageId: "ingest", errorRate: 0.08, propagationFactor: 1.3, detectionCoverage: 0.2, rollbackCoverage: 0.1 },
      { stageId: "transform", errorRate: 0.11, propagationFactor: 1.9, detectionCoverage: 0.1, rollbackCoverage: 0.1 },
      { stageId: "act", errorRate: 0.06, propagationFactor: 1.7, detectionCoverage: 0.15, rollbackCoverage: 0.1 }
    ];
    const result = detectErrorAmplification(stages);
    expect(result.amplificationDetected).toBe(true);
    expect(result.amplificationRatio).toBeGreaterThan(1.2);
    expect(result.hotspotStages.length).toBeGreaterThan(0);
  });

  test("does not flag amplification when containment controls are strong", () => {
    const stages: PipelineStageProfile[] = [
      { stageId: "ingest", errorRate: 0.05, propagationFactor: 1.05, detectionCoverage: 0.9, rollbackCoverage: 0.8 },
      { stageId: "transform", errorRate: 0.05, propagationFactor: 1.1, detectionCoverage: 0.9, rollbackCoverage: 0.85 },
      { stageId: "act", errorRate: 0.04, propagationFactor: 1.05, detectionCoverage: 0.92, rollbackCoverage: 0.85 }
    ];
    const result = detectErrorAmplification(stages);
    expect(result.amplificationDetected).toBe(false);
    expect(result.score).toBeGreaterThan(70);
  });
});

describe("scoreComplexityTax", () => {
  test("returns punitive tax for heavily overbuilt architecture", () => {
    const tax = scoreComplexityTax(
      makeTask({ complexity: 2, stepCount: 2, integrationCount: 1, riskTier: "low" }),
      makeArchitecture({ layerCount: 8, agentCount: 7, orchestrationDepth: 10, toolingSurface: 30 })
    );
    expect(tax.classification).toBe("punitive");
    expect(tax.taxRate).toBeGreaterThan(0.6);
    expect(tax.score).toBeLessThan(40);
  });

  test("returns minimal or manageable tax for proportional architecture", () => {
    const tax = scoreComplexityTax(makeTask(), makeArchitecture());
    expect(["minimal", "manageable"]).toContain(tax.classification);
    expect(tax.score).toBeGreaterThan(60);
  });
});

describe("failure mode and redundancy scoring", () => {
  test("failure mode analysis includes single-point outage risk when fallbacks are weak", () => {
    const result = analyzeFailureModes({
      task: makeTask({ riskTier: "critical", requiresHumanApproval: true }),
      architecture: makeArchitecture({
        fallbackCoverage: 0.1,
        singlePointOfFailureCount: 4,
        validationCoverage: 0.9,
        observabilityCoverage: 0.9
      })
    });
    const spof = result.topFailureModes.find((mode) => mode.id === "single-point-outage");
    expect(spof).toBeDefined();
    expect((spof?.riskScore ?? 0)).toBeGreaterThan(25);
  });

  test("failure mode analysis surfaces retry storm patterns", () => {
    const error = detectErrorAmplification([
      { stageId: "stage-a", errorRate: 0.1, propagationFactor: 1.6, detectionCoverage: 0.2, rollbackCoverage: 0.1 },
      { stageId: "stage-b", errorRate: 0.08, propagationFactor: 1.5, detectionCoverage: 0.2, rollbackCoverage: 0.1 }
    ]);
    const result = analyzeFailureModes({
      task: makeTask({ riskTier: "high" }),
      architecture: makeArchitecture({
        retryCoverage: 0.95,
        circuitBreakerCoverage: 0.1
      }),
      errorAmplification: error
    });
    expect(result.topFailureModes.some((mode) => mode.id === "retry-storm")).toBe(true);
  });

  test("redundancy score reaches fault-tolerant with strong fallback controls", () => {
    const redundancy = scoreRedundancy(
      makeArchitecture({
        fallbackCoverage: 0.95,
        retryCoverage: 0.9,
        circuitBreakerCoverage: 0.9,
        criticalPathRedundancy: 2,
        singlePointOfFailureCount: 0,
        hasHumanCheckpoint: true
      })
    );
    expect(redundancy.level).toBe("fault-tolerant");
    expect(redundancy.score).toBeGreaterThan(85);
    expect(redundancy.gaps).toHaveLength(0);
  });
});

describe("evaluateArchitectureTaskAlignment", () => {
  test("returns aggregate report with bounded overall score", () => {
    const report = evaluateArchitectureTaskAlignment({
      task: makeTask(),
      architecture: makeArchitecture(),
      pipelineStages: [
        { stageId: "prep", errorRate: 0.03, propagationFactor: 1.1, detectionCoverage: 0.8, rollbackCoverage: 0.7 },
        { stageId: "execute", errorRate: 0.04, propagationFactor: 1.15, detectionCoverage: 0.8, rollbackCoverage: 0.7 }
      ]
    });
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.summary[0]).toMatch(/Task-fit/);
  });
});
