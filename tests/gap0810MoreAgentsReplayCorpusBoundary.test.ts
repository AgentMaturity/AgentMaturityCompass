import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0810-more-agents-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2606.05670";
const OPENALEX = "W7163778003";
const TITLE = "Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0810 more-agents replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0810");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Thu Jun  4 03:50:47 2026");
    expect(doc).toContain("Yuhang Fu");
    expect(doc).toContain("Ruishan Fang");
    expect(doc).toContain("Tao Lin");
    expect(doc).toContain("BenchAgent");
    expect(doc).toContain("benchmark loader");
    expect(doc).toContain("tool access");
    expect(doc).toContain("answer contract");
    expect(doc).toContain("usage accounting");
    expect(doc).toContain("trajectory logging");
    expect(doc).toContain("ten reasoning, coding, and tool-use benchmarks");
    expect(doc).toContain("GPT-4.1");
    expect(doc).toContain("Protocol-Aligned External");
    expect(doc).toContain("at most one of six tested MAS");
    expect(doc).toContain("2.56-11.29 points");
    expect(doc).toContain("66.72% overall");
    expect(doc).toContain("69.23% on Level 3");
    expect(doc).toContain("Wilson 95% binomial confidence interval");
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

  it("accepts protocol-aligned multi-agent context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0810-protocol-aligned-workflow-context",
      corpusId: "gap-0810-amc-owned-protocol-aligned-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0810-baseline",
      candidateRunId: "gap-0810-candidate",
      sourceRefs: [ARXIV, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T23:10:00.000Z"),
      rows: [
        {
          rowId: "gap-0810-owned-protocol-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned protocol-aligned workflow replay fixture with no copied BenchAgent benchmark rows or trajectories",
            inputHash: hash("m"),
            expectedHash: hash("n"),
            fixtureHash: hash("o"),
            seed: 810,
            metadata: {
              sourceReview: "GAP-0810",
              protocolAligned: true,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.63,
            evidenceRefs: ["ev-gap0810-baseline"],
            signedEvidenceRefs: ["ledger-gap0810-baseline", "ledger-gap0810-baseline-ci"],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: ["ev-gap0810-candidate"],
            signedEvidenceRefs: ["ledger-gap0810-candidate", "ledger-gap0810-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.09);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper metadata replaces AMC-owned protocol replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0810-metadata-only-agent",
      corpusId: "gap-0810-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0810-baseline",
      candidateRunId: "gap-0810-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:10:00.000Z"),
      rows: [
        {
          rowId: "gap-0810-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "arXiv title, BenchAgent, workflow-lift, and multi-agent comparison metadata without an AMC-owned replay fixture",
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

  it("does not add BenchAgent identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("benchagent_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
