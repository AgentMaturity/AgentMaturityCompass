import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0812-perceptui-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2606.05697";
const OPENALEX = "W7163778420";
const TITLE = "PerceptUI: LLM Agents as Human-Aligned Synthetic Users for UI/UX Evaluation";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0812 PerceptUI replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0812");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Thu Jun  4 04:35:16 2026");
    expect(doc).toContain("Nicolas Bougie");
    expect(doc).toContain("Xiaotong Ye");
    expect(doc).toContain("Gian Maria Marconi");
    expect(doc).toContain("Narimasa Watanabe");
    expect(doc).toContain("persona-conditioned UI/UX evaluation");
    expect(doc).toContain("interface-related questions");
    expect(doc).toContain("natural-language rationales");
    expect(doc).toContain("contrastive reflection fine-tuning");
    expect(doc).toContain("teacher-generated rationales");
    expect(doc).toContain("human decisions");
    expect(doc).toContain("reflective prompt-evolution");
    expect(doc).toContain("failure traces");
    expect(doc).toContain("unseen questions and personas");
    expect(doc).toContain("population-level response distributions");
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

  it("accepts PerceptUI context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0812-perceptui-context",
      corpusId: "gap-0812-amc-owned-uiux-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0812-baseline",
      candidateRunId: "gap-0812-candidate",
      sourceRefs: [ARXIV, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T23:12:00.000Z"),
      rows: [
        {
          rowId: "gap-0812-owned-uiux-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned UI/UX replay fixture with no copied PerceptUI personas, rationales, prompts, or response distributions",
            inputHash: hash("2"),
            expectedHash: hash("3"),
            fixtureHash: hash("4"),
            seed: 812,
            metadata: {
              sourceReview: "GAP-0812",
              syntheticUserContext: true,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.57,
            evidenceRefs: ["ev-gap0812-baseline"],
            signedEvidenceRefs: ["ledger-gap0812-baseline", "ledger-gap0812-baseline-ci"],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: ["ev-gap0812-candidate"],
            signedEvidenceRefs: ["ledger-gap0812-candidate", "ledger-gap0812-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.13);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when PerceptUI metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0812-metadata-only-agent",
      corpusId: "gap-0812-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0812-baseline",
      candidateRunId: "gap-0812-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:12:00.000Z"),
      rows: [
        {
          rowId: "gap-0812-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "arXiv title, PerceptUI personas, rationale, and synthetic-user metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [ARXIV],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [`https://openalex.org/${OPENALEX}`],
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

  it("does not add PerceptUI identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("perceptui_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
