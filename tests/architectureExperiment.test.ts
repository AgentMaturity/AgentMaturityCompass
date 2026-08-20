import { describe, expect, test } from "vitest";
import {
  createArchitectureSpec,
  createProbe,
  createStandardProbeSet,
  createArchitectureExperiment,
  simulateProbeOutcomes,
  runArchitectureExperiment,
  analyzeArchitectureExperiment,
  renderArchitectureComparisonMarkdown,
  quickArchitectureComparison,
  type ArchitectureSpec,
  type ArchitectureProbe,
} from "../src/experiments/architectureExperiment.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSpec(overrides: Partial<ArchitectureSpec> = {}): ArchitectureSpec {
  return {
    specId: `spec_test_${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Spec",
    kind: "POLICY_FRAME",
    modelId: "claude-3",
    artifactSha256: "a".repeat(64),
    description: "A test spec",
    metadata: {},
    createdTs: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Spec creation
// ---------------------------------------------------------------------------
describe("createArchitectureSpec", () => {
  test("creates spec with SHA256 of content", () => {
    const spec = createArchitectureSpec({
      name: "Policy V1",
      kind: "POLICY_FRAME",
      modelId: "claude-3",
      artifactContent: '{"rules": ["no-deploy-friday"]}',
      description: "Conservative policy",
    });

    expect(spec.specId).toMatch(/^spec_/);
    expect(spec.artifactSha256).toHaveLength(64);
    expect(spec.name).toBe("Policy V1");
    expect(spec.modelId).toBe("claude-3");
  });

  test("different content produces different SHA256", () => {
    const spec1 = createArchitectureSpec({
      name: "V1",
      kind: "POLICY_FRAME",
      modelId: "claude-3",
      artifactContent: "content-A",
      description: "A",
    });
    const spec2 = createArchitectureSpec({
      name: "V2",
      kind: "POLICY_FRAME",
      modelId: "claude-3",
      artifactContent: "content-B",
      description: "B",
    });

    expect(spec1.artifactSha256).not.toBe(spec2.artifactSha256);
  });
});

// ---------------------------------------------------------------------------
// Probe creation
// ---------------------------------------------------------------------------
describe("createProbe", () => {
  test("creates a probe with all fields", () => {
    const probe = createProbe({
      category: "tool_usage",
      promptText: "List all tools",
      measureDimension: "tool_awareness",
      tags: ["standard"],
    });

    expect(probe.probeId).toMatch(/^probe_/);
    expect(probe.category).toBe("tool_usage");
    expect(probe.measureDimension).toBe("tool_awareness");
  });
});

describe("createStandardProbeSet", () => {
  test("creates a non-empty standard set", () => {
    const probes = createStandardProbeSet();
    expect(probes.length).toBeGreaterThanOrEqual(8);

    // Check expected categories
    const categories = new Set(probes.map((p) => p.category));
    expect(categories.has("tool_usage")).toBe(true);
    expect(categories.has("choice_awareness")).toBe(true);
    expect(categories.has("boundary_respect")).toBe(true);
    expect(categories.has("evidence_quality")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Experiment creation
// ---------------------------------------------------------------------------
describe("createArchitectureExperiment", () => {
  test("creates experiment with matching model IDs", () => {
    const baseline = makeSpec({ modelId: "claude-3" });
    const candidate = makeSpec({ modelId: "claude-3", artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Policy comparison",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    expect(experiment.experimentId).toMatch(/^archexp_/);
    expect(experiment.status).toBe("CREATED");
    expect(experiment.probes.length).toBeGreaterThan(0);
  });

  test("throws on model mismatch", () => {
    const baseline = makeSpec({ modelId: "claude-3" });
    const candidate = makeSpec({ modelId: "gpt-4" });

    expect(() =>
      createArchitectureExperiment({
        name: "Mismatched",
        baselineSpec: baseline,
        candidateSpec: candidate,
      }),
    ).toThrow(/Model mismatch/);
  });

  test("accepts custom probes", () => {
    const baseline = makeSpec();
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });
    const customProbes = [
      createProbe({ category: "custom", promptText: "test", measureDimension: "custom_dim" }),
    ];

    const experiment = createArchitectureExperiment({
      name: "Custom probes",
      baselineSpec: baseline,
      candidateSpec: candidate,
      probes: customProbes,
    });

    expect(experiment.probes.length).toBe(1);
    expect(experiment.probes[0]!.category).toBe("custom");
  });
});

// ---------------------------------------------------------------------------
// Probe simulation
// ---------------------------------------------------------------------------
describe("simulateProbeOutcomes", () => {
  test("produces one outcome per probe", () => {
    const spec = makeSpec();
    const probes = createStandardProbeSet();
    const outcomes = simulateProbeOutcomes(spec, probes, 42);

    expect(outcomes.length).toBe(probes.length);
    for (const o of outcomes) {
      expect(o.specId).toBe(spec.specId);
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(1);
      expect(["PASS", "FAIL", "PARTIAL", "SKIPPED"]).toContain(o.verdict);
    }
  });

  test("is deterministic with same seed", () => {
    const spec = makeSpec();
    const probes = createStandardProbeSet();
    const outcomes1 = simulateProbeOutcomes(spec, probes, 42);
    const outcomes2 = simulateProbeOutcomes(spec, probes, 42);

    for (let i = 0; i < outcomes1.length; i++) {
      expect(outcomes1[i]!.score).toBe(outcomes2[i]!.score);
      expect(outcomes1[i]!.verdict).toBe(outcomes2[i]!.verdict);
    }
  });

  test("produces different outcomes with different seeds", () => {
    const spec = makeSpec();
    const probes = createStandardProbeSet();
    const outcomes1 = simulateProbeOutcomes(spec, probes, 42);
    const outcomes2 = simulateProbeOutcomes(spec, probes, 999);

    const scores1 = outcomes1.map((o) => o.score);
    const scores2 = outcomes2.map((o) => o.score);

    // At least some scores should differ
    const diffs = scores1.filter((s, i) => s !== scores2[i]!);
    expect(diffs.length).toBeGreaterThan(0);
  });

  test("different specs produce different outcome patterns", () => {
    const spec1 = makeSpec({ artifactSha256: "a".repeat(64) });
    const spec2 = makeSpec({ artifactSha256: "b".repeat(64) });
    const probes = createStandardProbeSet();

    const outcomes1 = simulateProbeOutcomes(spec1, probes, 42);
    const outcomes2 = simulateProbeOutcomes(spec2, probes, 42);

    // Different specs should produce at least some different scores
    const diffs = outcomes1.filter((o, i) => o.score !== outcomes2[i]!.score);
    expect(diffs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Running experiments
// ---------------------------------------------------------------------------
describe("runArchitectureExperiment", () => {
  test("runs experiment and produces outcomes", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Run test",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    const result = runArchitectureExperiment(experiment, { probeRunner: simulateProbeOutcomes });
    expect(result.experiment.status).toBe("COMPLETED");
    expect(result.baselineOutcomes.length).toBeGreaterThan(0);
    expect(result.candidateOutcomes.length).toBeGreaterThan(0);
    expect(result.baselineOutcomes.length).toBe(result.candidateOutcomes.length);
  });

  test("supports custom probe runner", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Custom runner",
      baselineSpec: baseline,
      candidateSpec: candidate,
      probes: [createProbe({ category: "test", promptText: "test", measureDimension: "test" })],
    });

    const customRunner = (spec: any, probes: any[], seed: number) => {
      return probes.map((p: any) => ({
        probeId: p.probeId,
        specId: spec.specId,
        verdict: "PASS" as const,
        score: 1.0,
        toolCallCount: 0,
        tokenCount: 100,
        latencyMs: 50,
        choiceAwareness: true,
        observations: ["custom"],
        ts: Date.now(),
      }));
    };

    const result = runArchitectureExperiment(experiment, { probeRunner: customRunner });
    expect(result.baselineOutcomes[0]!.score).toBe(1.0);
    expect(result.candidateOutcomes[0]!.score).toBe(1.0);
  });

  test("sets status to FAILED on error", () => {
    const baseline = makeSpec();
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Failing",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    const failingRunner = () => {
      throw new Error("probe execution failed");
    };

    expect(() => runArchitectureExperiment(experiment, { probeRunner: failingRunner })).toThrow();
    expect(experiment.status).toBe("FAILED");
  });
});

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
describe("analyzeArchitectureExperiment", () => {
  test("produces a complete comparison report", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Analysis test",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    const { baselineOutcomes, candidateOutcomes } = runArchitectureExperiment(experiment, { probeRunner: simulateProbeOutcomes });
    const report = analyzeArchitectureExperiment(experiment, baselineOutcomes, candidateOutcomes);

    expect(report.reportId).toMatch(/^acr_/);
    expect(report.experimentId).toBe(experiment.experimentId);
    expect(report.modelId).toBe("claude-3");
    expect(report.totalProbes).toBe(experiment.probes.length);
    expect(report.baselinePassRate).toBeGreaterThanOrEqual(0);
    expect(report.baselinePassRate).toBeLessThanOrEqual(1);
    expect(report.candidatePassRate).toBeGreaterThanOrEqual(0);
    expect(report.candidatePassRate).toBeLessThanOrEqual(1);
    expect(report.behavioralDiffs.length).toBe(experiment.probes.length);
    expect(report.dimensionComparisons.length).toBeGreaterThan(0);
    expect(report.reportSha256).toHaveLength(64);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  test("computes per-dimension comparisons", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });
    const probes = createStandardProbeSet();

    const experiment = createArchitectureExperiment({
      name: "Dim test",
      baselineSpec: baseline,
      candidateSpec: candidate,
      probes,
    });

    const { baselineOutcomes, candidateOutcomes } = runArchitectureExperiment(experiment, { probeRunner: simulateProbeOutcomes });
    const report = analyzeArchitectureExperiment(experiment, baselineOutcomes, candidateOutcomes);

    // Each probe has a unique dimension, so we should have multiple dimension comparisons
    const dimensions = new Set(probes.map((p) => p.measureDimension));
    expect(report.dimensionComparisons.length).toBe(dimensions.size);

    for (const d of report.dimensionComparisons) {
      expect(d.baselineAvg).toBeGreaterThanOrEqual(0);
      expect(d.baselineAvg).toBeLessThanOrEqual(1);
      expect(d.probeCount).toBeGreaterThan(0);
    }
  });

  test("handles empty probe list gracefully", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Empty",
      baselineSpec: baseline,
      candidateSpec: candidate,
      probes: [],
    });

    const report = analyzeArchitectureExperiment(experiment, [], []);
    expect(report.totalProbes).toBe(0);
    expect(report.baselinePassRate).toBe(0);
    expect(report.behavioralDiffs.length).toBe(0);
  });

  test("report has deterministic seed", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "Seed test",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    const { baselineOutcomes, candidateOutcomes } = runArchitectureExperiment(experiment, { probeRunner: simulateProbeOutcomes });
    const report = analyzeArchitectureExperiment(experiment, baselineOutcomes, candidateOutcomes);

    expect(typeof report.deterministicSeed).toBe("number");
    expect(report.deterministicSeed).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("renderArchitectureComparisonMarkdown", () => {
      probeRunner: simulateProbeOutcomes,
  test("renders all sections", () => {
    const baseline = makeSpec({ artifactSha256: "a".repeat(64) });
    const candidate = makeSpec({ artifactSha256: "b".repeat(64) });

    const experiment = createArchitectureExperiment({
      name: "MD test",
      baselineSpec: baseline,
      candidateSpec: candidate,
    });

    const { baselineOutcomes, candidateOutcomes } = runArchitectureExperiment(experiment, { probeRunner: simulateProbeOutcomes });
    const report = analyzeArchitectureExperiment(experiment, baselineOutcomes, candidateOutcomes);
    const md = renderArchitectureComparisonMarkdown(report);

    expect(md).toContain("# Architecture Comparison Report");
    expect(md).toContain("## Overall Results");
    expect(md).toContain("## Dimension Comparisons");
    expect(md).toContain("## Recommendations");
    expect(md).toContain("## Reproducibility");
    expect(md).toContain("Deterministic seed:");
    expect(md).toContain("Report SHA256:");
  });
});

// ---------------------------------------------------------------------------
// Quick comparison
// ---------------------------------------------------------------------------
describe("quickArchitectureComparison", () => {
  test("runs end-to-end comparison", () => {
    const result = quickArchitectureComparison({
      probeRunner: simulateProbeOutcomes,
      name: "Quick test",
      modelId: "claude-3",
      baselineName: "Conservative policy",
      baselineKind: "POLICY_FRAME",
      baselineContent: '{"rules": ["strict"]}',
      baselineDescription: "Strict rules",
      candidateName: "Relaxed policy",
      candidateKind: "POLICY_FRAME",
      candidateContent: '{"rules": ["relaxed"]}',
      candidateDescription: "Relaxed rules",
    });

    expect(result.experiment.status).toBe("COMPLETED");
    expect(result.report.totalProbes).toBeGreaterThan(0);
    expect(result.markdown).toContain("# Architecture Comparison Report");
  });

  test("accepts custom probes", () => {
    const customProbes = [
      createProbe({ category: "custom", promptText: "test", measureDimension: "dim1" }),
      createProbe({ category: "custom", promptText: "test2", measureDimension: "dim2" }),
    ];

    const result = quickArchitectureComparison({
      probeRunner: simulateProbeOutcomes,
      name: "Custom probes",
      modelId: "claude-3",
      baselineName: "A",
      baselineKind: "PROMPT_STRUCTURE",
      baselineContent: "prompt-A",
      baselineDescription: "A",
      candidateName: "B",
      candidateKind: "PROMPT_STRUCTURE",
      candidateContent: "prompt-B",
      candidateDescription: "B",
      probes: customProbes,
    });

    expect(result.report.totalProbes).toBe(2);
  });
});
