import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0784-timem-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2601.02845";
const DOI = "10.48550/arXiv.2601.02845";
const OPENALEX = "W7118272298";
const TITLE = "TiMem: Temporal-Hierarchical Memory Consolidation for Long-Horizon Conversational Agents";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0784 TiMem replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0784");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `2026-01-06`");
    expect(doc).toContain("last revised `2026-04-30`");
    expect(doc).toContain("ACL 2026 Findings");
    expect(doc).toContain("Kai Li");
    expect(doc).toContain("Xuanqing Yu");
    expect(doc).toContain("Temporal Memory Tree");
    expect(doc).toContain("semantic-guided consolidation");
    expect(doc).toContain("complexity-aware memory recall");
    expect(doc).toContain("LoCoMo");
    expect(doc).toContain("LongMemEval-S");
    expect(doc).toContain("75.30%");
    expect(doc).toContain("76.88%");
    expect(doc).toContain("52.20%");
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

  it("accepts long-horizon memory context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0784-timem-context",
      corpusId: "gap-0784-amc-owned-memory-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0784-baseline",
      candidateRunId: "gap-0784-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T18:50:00.000Z"),
      rows: [
        {
          rowId: "gap-0784-owned-memory-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned long-horizon conversation memory replay fixture with no copied TiMem benchmarks or conversation logs",
            inputHash: hash("g"),
            expectedHash: hash("h"),
            fixtureHash: hash("i"),
            seed: 784,
            metadata: { sourceReview: "GAP-0784", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.66,
            evidenceRefs: ["ev-gap0784-baseline"],
            signedEvidenceRefs: ["ledger-gap0784-baseline", "ledger-gap0784-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap0784-candidate"],
            signedEvidenceRefs: ["ledger-gap0784-candidate", "ledger-gap0784-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.15);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0784-metadata-only-agent",
      corpusId: "gap-0784-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0784-baseline",
      candidateRunId: "gap-0784-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T18:50:00.000Z"),
      rows: [
        {
          rowId: "gap-0784-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Source title, TiMem claims, and benchmark names without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [ARXIV, `https://doi.org/${DOI}`],
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

  it("does not add TiMem identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("timem_replay_corpus");
      expect(source).not.toContain("Temporal Memory Tree");
    }
  });
});
