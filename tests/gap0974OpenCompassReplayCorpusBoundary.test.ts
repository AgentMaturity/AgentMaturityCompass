import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0974-opencompass-replay-corpus.md";
const HOME = "https://opencompass.org.cn/";
const GITHUB = "https://github.com/open-compass/opencompass";
const QUICK_START = "https://opencompass.readthedocs.io/en/latest/get_started/quick_start.html";
const ARXIV = "https://arxiv.org/abs/2605.19276";
const TITLE = "OpenCompass";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0974 OpenCompass replay-corpus boundary", () => {
  it("documents live OpenCompass metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0974");
    expect(doc).toContain(HOME);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(QUICK_START);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live OpenCompass website");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("live OpenCompass quick-start docs");
    expect(doc).toContain("live arXiv record");
    expect(doc).toContain("one-stop platform for large model evaluation");
    expect(doc).toContain("fair, open, and reproducible benchmark");
    expect(doc).toContain("7.1k stars");
    expect(doc).toContain("793 forks");
    expect(doc).toContain("377 issues");
    expect(doc).toContain("87 pull requests");
    expect(doc).toContain("1,134 commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Configure -> Inference -> Evaluation -> Visualization");
    expect(doc).toContain("model(s) and dataset(s)");
    expect(doc).toContain("CSV and TXT files");
    expect(doc).toContain("configuration files");
    expect(doc).toContain("Task Partitioning Module");
    expect(doc).toContain("Execution and Scheduling Module");
    expect(doc).toContain("Task Execution Unit");
    expect(doc).toContain("rule-based, LLM-as-a-Judge, and cascaded evaluators");
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

  it("accepts OpenCompass context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0974-opencompass-reviewed-agent",
      corpusId: "gap-0974-amc-owned-opencompass-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0974-baseline",
      candidateRunId: "gap-0974-candidate",
      sourceRefs: [HOME, GITHUB, QUICK_START, ARXIV],
      now: new Date("2026-06-24T10:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0974-owned-opencompass-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for OpenCompass-style configured model, dataset, inference, evaluation, visualization, evaluator, and result-artifact context with no copied OpenCompass docs, code, configs, datasets, leaderboard rows, prompts, outputs, or benchmark examples",
            inputHash: hash("d"),
            expectedHash: hash("e"),
            fixtureHash: hash("f"),
            seed: 974,
            metadata: { sourceReview: "GAP-0974", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.48,
            evidenceRefs: ["ev-gap0974-baseline"],
            signedEvidenceRefs: ["ledger-gap0974-baseline", "ledger-gap0974-baseline-ci"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["ev-gap0974-candidate"],
            signedEvidenceRefs: ["ledger-gap0974-candidate", "ledger-gap0974-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([HOME, GITHUB, QUICK_START, ARXIV]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.36);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when OpenCompass metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0974-metadata-only-agent",
      corpusId: "gap-0974-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0974-baseline",
      candidateRunId: "gap-0974-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T10:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0974-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "OpenCompass website, GitHub metadata, quick-start workflow labels, model and dataset labels, evaluator labels, leaderboard labels, arXiv architecture labels, and result-export labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: [HOME],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: [QUICK_START],
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

  it("does not add OpenCompass replay identifiers to generic replay corpus modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain("opencompass_replay_corpus");
      expect(source).not.toContain("OpenCompass replay");
    }
  });
});
