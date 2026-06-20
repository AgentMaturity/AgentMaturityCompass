import { describe, expect, test } from "vitest";
import {
  runPromptLayerProviderDrift,
  type PromptLayerProviderDriftMetadata,
} from "../src/benchmarks/promptLayerProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4o-mini",
  version: "2026-06-01+prompt-v7",
  canaryId: "promptlayer-support-triage",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "prompt-versioned-agent-canary",
  sampleSize: 30,
  scoreMean0to1: 0.88,
  refusalRate0to1: 0.04,
  latencyMsP95: 1100,
  costUsdMean: 0.003,
  evidenceRefs: ["trace:promptlayer-baseline", "dataset:support-canary-v1"],
  signedEvidenceRefs: ["ledger:promptlayer-baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-14+prompt-v8",
  scoreMean0to1: 0.87,
  refusalRate0to1: 0.045,
  latencyMsP95: 1130,
  costUsdMean: 0.0031,
  evidenceRefs: ["trace:promptlayer-candidate", "dataset:support-canary-v1"],
  signedEvidenceRefs: ["ledger:promptlayer-candidate"],
};

const promptLayerProof = (
  side: "baseline" | "candidate",
  overrides: Partial<PromptLayerProviderDriftMetadata> = {},
): PromptLayerProviderDriftMetadata => ({
  provider: "openai",
  model: "gpt-4o-mini",
  canaryId: "promptlayer-support-triage",
  providerVersion: side === "baseline" ? "2026-06-01+prompt-v7" : "2026-06-14+prompt-v8",
  promptVersionId: side === "baseline" ? "prompt-v7" : "prompt-v8",
  sourceRefHash: hash("a"),
  websiteSnapshotHash: hash("b"),
  docsIndexHash: hash("c"),
  promptRegistryHash: hash("d"),
  promptTemplateSetHash: hash("e"),
  evaluationDatasetHash: hash("f"),
  traceExportHash: hash("1"),
  metricReportHash: hash("2"),
  providerRouteId: side === "baseline" ? "openai:gpt-4o-mini:prompt-v7" : "openai:gpt-4o-mini:prompt-v8",
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

describe("runPromptLayerProviderDrift", () => {
  test("binds provider versions, canary results, drift statistics, and alert/waiver metadata without alerts", () => {
    const result = runPromptLayerProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptLayer: {
        baseline: [promptLayerProof("baseline")],
        candidate: [promptLayerProof("candidate", { canaryResultHash: hash("9"), driftStatisticHash: hash("0") })],
      },
      evalPack: {
        packId: "promptlayer-provider-drift-v1",
        datasetHash: hash("9"),
        sourceRefs: ["https://promptlayer.com"],
      },
    });

    expect(result.report.providerVersions).toEqual([
      "openai/gpt-4o-mini@2026-06-01+prompt-v7",
      "openai/gpt-4o-mini@2026-06-14+prompt-v8",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts).toEqual([]);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.promptLayerEvidence).toHaveLength(2);
    expect(result.promptLayerEvidence.map((proof) => proof.missingReasons)).toEqual([[], []]);
    expect(result.promptLayerEvidence[1]?.canaryResultHash).toBe(hash("9"));
    expect(result.promptLayerEvidence[1]?.driftStatisticHash).toBe(hash("0"));
    expect(result.promptLayerEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evalPack.replayable).toBe(true);
    expect(result.watchAlerts).toEqual([]);
    expect(result.ciGate.passed).toBe(true);
  });

  test("fails closed when PromptLayer relevance metadata omits canary result, drift statistic, or alert proof", () => {
    const result = runPromptLayerProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptLayer: {
        baseline: [promptLayerProof("baseline")],
        candidate: [promptLayerProof("candidate", {
          canaryResultHash: undefined,
          driftStatisticHash: "not-a-hash",
          alertOrWaiverHash: undefined,
        })],
      },
    });

    expect(result.report.recommendation).toBe("alert");
    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts.map((alert) => alert.metricId)).toEqual(["observabilityPipelineEvidence"]);
    expect(result.report.alerts[0]?.alertId).toContain("promptLayerMetadataEvidence");
    expect(result.report.alerts[0]?.message).toContain("candidate:canaryResultHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:driftStatisticHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:alertOrWaiverHash");
    expect(result.watchAlerts).toHaveLength(1);
    expect(result.ciGate.failClosed).toBe(true);
  });

  test("honors active waivers while preserving explicit alert evidence", () => {
    const result = runPromptLayerProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptLayer: {
        baseline: [promptLayerProof("baseline")],
        candidate: [promptLayerProof("candidate", { alertOrWaiverHash: undefined })],
      },
      waivers: [{
        waiverId: "waive-promptlayer-maintenance",
        provider: "openai",
        model: "gpt-4o-mini",
        canaryId: "promptlayer-support-triage",
        metricIds: ["observabilityPipelineEvidence"],
        reason: "Prompt version rollout maintenance window",
        approvedBy: "ops-review",
        expiresAt: "2099-01-01T00:00:00.000Z",
        evidenceRefs: ["ticket:ops-123"],
      }],
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({
      waived: true,
      waiverId: "waive-promptlayer-maintenance",
    });
    expect(result.watchAlerts).toEqual([]);
    expect(result.ciGate.waivedAlertIds).toEqual([
      "pdrift:openai:gpt-4o-mini:promptlayer-support-triage:promptLayerMetadataEvidence",
    ]);
  });

  test("rejects copied prompt or trace content and keeps the proof metadata-only", () => {
    const result = runPromptLayerProviderDrift({
      agentId: "support-agent",
      baseline: [baseline],
      candidate: [candidate],
      promptLayer: {
        baseline: [promptLayerProof("baseline")],
        candidate: [{
          ...promptLayerProof("candidate"),
          promptText: "do not store raw prompt text in AMC drift evidence",
        } as PromptLayerProviderDriftMetadata],
      },
    });

    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts[0]?.message).toContain("candidate:metadataOnly:promptText");
  });
});
