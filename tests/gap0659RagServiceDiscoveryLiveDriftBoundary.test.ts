import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const doi = "https://doi.org/10.1109/tsc.2026.3665441";
const openAlex = "https://openalex.org/W7129177026";

function rows(prefix: "baseline" | "live", score0to1: number, strategy: "metadata_replacement_sentence_window" | "custom"): LiveDriftSampleRow[] {
  return [0, 1, 2].map((index) => ({
    traceId: `gap0659-${prefix}-trace-${index}`,
    scenarioId: "rag-service-discovery-chunking",
    timestamp: `2026-06-21T0${index}:00:00.000Z`,
    score0to1,
    behaviorSignature: `${prefix}-${strategy}-service-discovery:${index}`,
    taskCategory: "rag-service-discovery",
    agentEvaluationDimension: "behavioral_regression",
    interactionTurnCount: prefix === "live" ? 13 + index : 7 + index,
    solutionPathCount: prefix === "live" ? 5 : 3,
    offPathAttemptCount: prefix === "live" ? 4 : 1,
    divergenceMomentum0to1: prefix === "live" ? 0.35 : 0.06,
    actionFixationRate0to1: prefix === "live" ? 0.21 : 0.04,
    ragEvaluationMode: "hybrid",
    ragPipelineStrategy: strategy,
    ragStrategyComparisonId: "gap0659-amc-owned-chunking-comparison",
    ragStrategyRunId: `gap0659-${prefix}-run`,
    ragStrategyManifestHash: `${prefix}-strategy-manifest-hash-gap0659`,
    ragIndexManifestHash: `${prefix}-index-manifest-hash-gap0659`,
    ragQuerySetHash: "amc-owned-service-discovery-query-set-hash",
    ragEvaluatorConfigHash: "amc-owned-rag-evaluator-config-hash",
    ragStrategyResultHash: `${prefix}-strategy-result-hash-gap0659`,
    ragCorpusId: "amc-owned-service-discovery-corpus",
    ragCorpusHash: "amc-owned-service-discovery-corpus-hash",
    ragChunkSize: prefix === "live" ? 256 : 512,
    ragChunkOverlap: prefix === "live" ? 32 : 64,
    ragRetrievalTopK: prefix === "live" ? 8 : 5,
    ragJudgeType: "hybrid",
    ragHallucinationEvaluatorEnabled: true,
    ragAccuracy0to1: prefix === "live" ? 0.68 : 0.91,
    ragCompleteness0to1: prefix === "live" ? 0.7 : 0.88,
    ragUtilization0to1: prefix === "live" ? 0.61 : 0.84,
    ragHallucinationRate0to1: prefix === "live" ? 0.19 : 0.03,
    ragPassageGroundingCoverage0to1: prefix === "live" ? 0.66 : 0.94,
    ragCitationCoverage0to1: prefix === "live" ? 0.7 : 0.96,
    ragAnswerSupportCoverage0to1: prefix === "live" ? 0.63 : 0.93,
    latencyMs: prefix === "live" ? 2100 : 980,
    costUsd: prefix === "live" ? 0.021 : 0.011,
    evidenceRefs: [`ev-gap0659-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0659-${prefix}-${index}`],
  }));
}

describe("GAP-0659 RAG service-discovery live-drift source-review boundary", () => {
  it("documents live metadata while rejecting paper-specific product bloat", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0659-rag-service-discovery-live-drift.md", "utf8");

    expect(doc).toContain("GAP-0659");
    expect(doc).toContain("10.1109/tsc.2026.3665441");
    expect(doc).toContain("W7129177026");
    expect(doc).toContain("Retrieval-Augmented Generation for Service Discovery");
    expect(doc).toContain("d8676fe022ae2ee7dfad51994f987e9400fcfa4c36b5d489af17e827aac25afa");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("No RAG service-discovery subsystem");
    expect(doc).toContain("No paper prose");
  });

  it("uses existing Watch live-drift receipts for AMC-owned RAG chunking behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0659-rag-service-discovery-agent",
      baselineWindow: {
        windowId: "gap0659-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T03:00:00.000Z",
        rows: rows("baseline", 0.91, "metadata_replacement_sentence_window"),
      },
      liveWindow: {
        windowId: "gap0659-live",
        startedAt: "2026-06-21T00:00:00.000Z",
        endedAt: "2026-06-21T03:00:00.000Z",
        rows: rows("live", 0.68, "custom"),
      },
      sourceRefs: [doi, openAlex],
      now: new Date("2026-06-21T04:00:00.000Z"),
    });

    expect(receipt.sourceRefs).toEqual([doi, openAlex]);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "ragAccuracyMean0to1",
      "ragHallucinationRate0to1",
      "ragStrategyDistribution",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).length).toBeGreaterThan(0);
  });
});
