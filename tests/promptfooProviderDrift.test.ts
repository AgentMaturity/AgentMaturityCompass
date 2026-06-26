import { describe, expect, test } from "vitest";
import {
  runPromptfooProviderDrift,
  type PromptfooProviderDriftMetadata,
} from "../src/benchmarks/promptfooProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  version: "2026-06-01",
  canaryId: "promptfoo-agent-regression",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "promptfoo-provider-canary",
  sampleSize: 24,
  scoreMean0to1: 0.91,
  refusalRate0to1: 0.03,
  latencyMsP95: 1200,
  costUsdMean: 0.004,
  evidenceRefs: ["promptfoo:baseline-canary", "dataset:agent-regression-v1"],
  signedEvidenceRefs: ["ledger:promptfoo-baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-14",
  scoreMean0to1: 0.90,
  refusalRate0to1: 0.035,
  latencyMsP95: 1210,
  costUsdMean: 0.0041,
  evidenceRefs: ["promptfoo:candidate-canary", "dataset:agent-regression-v1"],
  signedEvidenceRefs: ["ledger:promptfoo-candidate"],
};

const promptfooProof = (
  side: "baseline" | "candidate",
  overrides: Partial<PromptfooProviderDriftMetadata> = {},
): PromptfooProviderDriftMetadata => ({
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  canaryId: "promptfoo-agent-regression",
  providerVersion: side === "baseline" ? "2026-06-01" : "2026-06-14",
  promptfooVersion: "promptfoo-v0.119.13",
  sourceRefHash: hash("a"),
  repositorySnapshotHash: hash("b"),
  packageManifestHash: hash("c"),
  benchmarksModuleHash: hash("d"),
  watchModuleHash: hash("e"),
  apiModuleHash: hash("f"),
  providerRouteHash: hash("1"),
  evalConfigHash: hash("2"),
  canaryResultHash: hash("3"),
  driftStatisticHash: hash("4"),
  alertOrWaiverHash: hash("5"),
  replayCommandHash: hash("6"),
  signedEvidenceBundleHash: hash("7"),
  noSourceCopyProofHash: hash("8"),
  metricIds: ["score", "refusal_rate", "latency", "cost"],
  metricCount: 4,
  ...overrides,
});

describe("runPromptfooProviderDrift", () => {
  test("binds provider version, promptfoo canary result, drift statistic, and alert/waiver proof", () => {
    const result = runPromptfooProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptfoo: {
        baseline: [promptfooProof("baseline")],
        candidate: [promptfooProof("candidate", { canaryResultHash: hash("9"), driftStatisticHash: hash("0") })],
      },
      evalPack: {
        packId: "promptfoo-provider-drift-v1",
        datasetHash: hash("9"),
        sourceRefs: ["https://github.com/promptfoo/promptfoo"],
      },
    });

    expect(result.report.providerVersions).toEqual([
      "anthropic/claude-sonnet-4-5@2026-06-01",
      "anthropic/claude-sonnet-4-5@2026-06-14",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts).toEqual([]);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.promptfooEvidence).toHaveLength(2);
    expect(result.promptfooEvidence.map((proof) => proof.missingReasons)).toEqual([[], []]);
    expect(result.promptfooEvidence[1]?.promptfooVersion).toBe("promptfoo-v0.119.13");
    expect(result.promptfooEvidence[1]?.canaryResultHash).toBe(hash("9"));
    expect(result.promptfooEvidence[1]?.driftStatisticHash).toBe(hash("0"));
    expect(result.promptfooEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evalPack.replayable).toBe(true);
    expect(result.watchAlerts).toEqual([]);
    expect(result.ciGate.passed).toBe(true);
  });

  test("fails closed when promptfoo proof omits canary result, drift statistic, or alert/waiver evidence", () => {
    const result = runPromptfooProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptfoo: {
        baseline: [promptfooProof("baseline")],
        candidate: [promptfooProof("candidate", {
          canaryResultHash: undefined,
          driftStatisticHash: "not-a-hash",
          alertOrWaiverHash: undefined,
        })],
      },
    });

    expect(result.report.recommendation).toBe("alert");
    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts.map((alert) => alert.metricId)).toContain("evaluationFrameworkEvidence");
    expect(result.report.alerts[0]?.alertId).toContain("promptfooMetadataEvidence");
    expect(result.report.alerts[0]?.message).toContain("candidate:canaryResultHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:driftStatisticHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:alertOrWaiverHash");
    expect(result.watchAlerts).toHaveLength(1);
    expect(result.ciGate.failClosed).toBe(true);
  });

  test("honors waivers without losing explicit alert evidence", () => {
    const result = runPromptfooProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptfoo: {
        baseline: [promptfooProof("baseline")],
        candidate: [promptfooProof("candidate", { alertOrWaiverHash: undefined })],
      },
      waivers: [{
        waiverId: "waive-promptfoo-maintenance",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        canaryId: "promptfoo-agent-regression",
        metricIds: ["evaluationFrameworkEvidence"],
        reason: "Provider route canary migration window",
        approvedBy: "ops-review",
        expiresAt: "2099-01-01T00:00:00.000Z",
        evidenceRefs: ["ticket:ops-456"],
      }],
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({
      waived: true,
      waiverId: "waive-promptfoo-maintenance",
    });
    expect(result.watchAlerts).toEqual([]);
    expect(result.ciGate.waivedAlertIds).toEqual([
      "pdrift:anthropic:claude-sonnet-4-5:promptfoo-agent-regression:promptfooMetadataEvidence",
    ]);
  });

  test("rejects copied promptfoo config/prose content and keeps source review metadata-only", () => {
    const result = runPromptfooProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptfoo: {
        baseline: [promptfooProof("baseline")],
        candidate: [{
          ...promptfooProof("candidate"),
          configYaml: "do not store upstream promptfoo config in AMC drift evidence",
        } as PromptfooProviderDriftMetadata],
      },
    });

    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts[0]?.message).toContain("candidate:metadataOnly:configYaml");
  });
});
