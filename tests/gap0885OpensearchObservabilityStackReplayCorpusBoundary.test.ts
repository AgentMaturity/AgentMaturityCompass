import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0885-opensearch-observability-stack-replay-corpus.md";
const REPO = "opensearch-project/observability-stack";
const URL = "https://github.com/opensearch-project/observability-stack";
const TITLE = "OpenSearch Observability Stack";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0885 OpenSearch Observability Stack replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0885");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 25");
    expect(doc).toContain("Fork 28");
    expect(doc).toContain("Issues 18");
    expect(doc).toContain("Pull requests 17");
    expect(doc).toContain("169 Commits");
    expect(doc).toContain("Releases 3");
    expect(doc).toContain("cli-installer-v0.1.2");
    expect(doc).toContain("JavaScript 50.3%");
    expect(doc).toContain("Python 33.2%");
    expect(doc).toContain("TypeScript 7.7%");
    expect(doc).toContain("Shell 5.8%");
    expect(doc).toContain("HCL 2.7%");
    expect(doc).toContain(".claude-plugin");
    expect(doc).toContain("charts/ observability-stack");
    expect(doc).toContain("claude-code-observability-plugin");
    expect(doc).toContain("docker-compose");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("load-testing");
    expect(doc).toContain("terraform/ aws");
    expect(doc).toContain("docker-compose.agent-eval-llm.yml");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("OpenSearch");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("Alertmanager");
    expect(doc).toContain("AI agents");
    expect(doc).toContain("OpenTelemetry Gen-AI Semantic Conventions");
    expect(doc).toContain("multi-agent travel planner");
    expect(doc).toContain("weather-agent");
    expect(doc).toContain("events-agent");
    expect(doc).toContain("canary");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts OpenSearch observability context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0885-opensearch-observability-context",
      corpusId: "gap-0885-amc-owned-observability-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0885-baseline",
      candidateRunId: "gap-0885-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-22T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0885-owned-observability-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned observability replay fixture with no copied OpenSearch stack configs, telemetry samples, compose files, Helm charts, Terraform, or agent examples",
            inputHash: hash("s"),
            expectedHash: hash("t"),
            fixtureHash: hash("u"),
            seed: 885,
            metadata: { sourceReview: "GAP-0885", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["ev-gap0885-baseline"],
            signedEvidenceRefs: ["ledger-gap0885-baseline", "ledger-gap0885-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0885-candidate"],
            signedEvidenceRefs: ["ledger-gap0885-candidate", "ledger-gap0885-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.16);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when OpenSearch observability metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0885-metadata-only-agent",
      corpusId: "gap-0885-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0885-baseline",
      candidateRunId: "gap-0885-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0885-metadata-only-row",
          surfaces: ["Watch"],
          fixture: {
            task: "OpenSearch, OpenTelemetry, Prometheus, AI agent observability, docker-compose, Helm, AWS, and README metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.issues).toEqual(expect.arrayContaining([
      "eval replay corpus must cover Score, Shield, and Watch surfaces",
      "eval replay corpus source refs missing",
      "eval replay corpus signed evidence missing",
    ]));
    expect(receipt.recommendation).toContain("Fail closed");
  });

  it("does not add OpenSearch observability identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("opensearch_observability_stack_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
