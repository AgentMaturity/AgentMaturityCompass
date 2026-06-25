import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0007-arize-phoenix-replay-corpus.md";
const HOME = "https://phoenix.arize.com";
const CANONICAL = "https://arize.com/phoenix/";
const DOCS = "https://arize.com/docs/phoenix";
const EVALS = "https://arize.com/docs/phoenix/evaluation/llm-evals";
const EXPERIMENTS = "https://arize.com/docs/phoenix/datasets-and-experiments/how-to-experiments";
const REPO = "https://github.com/Arize-ai/phoenix/";
const TITLE = "Arize Phoenix";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0007 Arize Phoenix replay-corpus boundary", () => {
  it("documents live Phoenix metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0007");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(EXPERIMENTS);
    expect(doc).toContain(REPO);
    expect(doc).toContain("Trace the Exponential");
    expect(doc).toContain("open-source platform for agent development and evaluation");
    expect(doc).toContain("Talk with your traces");
    expect(doc).toContain("Investigate issues, add annotations, run experiments");
    expect(doc).toContain("Get visibility into your agents");
    expect(doc).toContain("Measure and improve agent quality");
    expect(doc).toContain("Build evals that score outputs and catch issues before they reach your users");
    expect(doc).toContain("Test changes with evidence");
    expect(doc).toContain("Create datasets from traces");
    expect(doc).toContain("A systematic way to improve AI quality");
    expect(doc).toContain("OBSERVE");
    expect(doc).toContain("ANNOTATE");
    expect(doc).toContain("HYPOTHESIZE");
    expect(doc).toContain("EXPERIMENT");
    expect(doc).toContain("MEASURE");
    expect(doc).toContain("prompts, retrievals, tool calls, outputs");
    expect(doc).toContain("human review or LLM-as-judge");
    expect(doc).toContain("benchmark performance");
    expect(doc).toContain("Score output across cost, latency, and performance");
    expect(doc).toContain("ELv2 licensed");
    expect(doc).toContain("Native OpenTelemetry support");
    expect(doc).toContain("Vendor Agnostic");
    expect(doc).toContain("OpenInference");
    expect(doc).toContain("AI Observability and Evaluation");
    expect(doc).toContain("LLM-based evaluators");
    expect(doc).toContain("code-based checks");
    expect(doc).toContain("human labels");
    expect(doc).toContain("Ragas");
    expect(doc).toContain("Deepeval");
    expect(doc).toContain("Cleanlab");
    expect(doc).toContain("same inputs");
    expect(doc).toContain("repetitions");
    expect(doc).toContain("variance and consistency");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("signed evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Phoenix context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0007-phoenix-reviewed-agent",
      corpusId: "gap-0007-amc-owned-phoenix-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-0007-baseline",
      candidateRunId: "gap-0007-candidate",
      sourceRefs: [HOME, CANONICAL, DOCS, EVALS, EXPERIMENTS, REPO],
      now: new Date("2026-06-25T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0007-owned-phoenix-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for Phoenix-style traces, datasets, experiments, evaluators, same-input comparisons, and repetitions with no copied Phoenix traces, datasets, prompts, examples, evaluator configs, docs prose, code, screenshots, or generated outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 7,
            metadata: {
              sourceReview: "GAP-0007",
              competitorContext: "phoenix-agent-evaluation-and-observability",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["ev-gap0007-baseline"],
            signedEvidenceRefs: ["ledger-gap0007-baseline", "ledger-gap0007-baseline-ci"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["ev-gap0007-candidate"],
            signedEvidenceRefs: ["ledger-gap0007-candidate", "ledger-gap0007-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([HOME, CANONICAL, DOCS, EVALS, EXPERIMENTS, REPO]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.ciReceiptPresent).toBe(true);
    expect(receipt.scoreDeltaPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.21);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Phoenix metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0007-phoenix-metadata-only-agent",
      corpusId: "gap-0007-phoenix-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-0007-baseline",
      candidateRunId: "gap-0007-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0007-phoenix-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Phoenix homepage, docs labels, traces, datasets, experiments, evaluators, same-input comparisons, OpenTelemetry, OpenInference, LLM-as-judge, and repetition metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: [HOME, CANONICAL],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: [DOCS, EXPERIMENTS],
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

  it("does not add Phoenix identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("arize_phoenix_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
