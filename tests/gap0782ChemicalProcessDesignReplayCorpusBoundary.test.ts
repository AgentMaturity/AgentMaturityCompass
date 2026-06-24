import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0782-chemical-process-design-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2601.06776";
const DOI = "10.48550/arXiv.2601.06776";
const OPENALEX = "W7123693393";
const TITLE = "From Text to Simulation: A Multi-Agent LLM Workflow for Automated Chemical Process Design";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0782 chemical process design replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0782");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `2026-01-11`");
    expect(doc).toContain("Xufei Tian");
    expect(doc).toContain("Wenli Du");
    expect(doc).toContain("Ke Ye");
    expect(doc).toContain("four specialized agents");
    expect(doc).toContain("Enhanced Monte Carlo Tree Search");
    expect(doc).toContain("Simona");
    expect(doc).toContain("31.1% improvement");
    expect(doc).toContain("89.0% compared to expert manual design");
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

  it("accepts chemical-process context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0782-chemical-process-context",
      corpusId: "gap-0782-amc-owned-process-design-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0782-baseline",
      candidateRunId: "gap-0782-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T18:35:00.000Z"),
      rows: [
        {
          rowId: "gap-0782-owned-process-design-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned process-design replay fixture with no copied upstream Simona rows or simulation configs",
            inputHash: hash("d"),
            expectedHash: hash("e"),
            fixtureHash: hash("f"),
            seed: 782,
            metadata: { sourceReview: "GAP-0782", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.61,
            evidenceRefs: ["ev-gap0782-baseline"],
            signedEvidenceRefs: ["ledger-gap0782-baseline", "ledger-gap0782-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0782-candidate"],
            signedEvidenceRefs: ["ledger-gap0782-candidate", "ledger-gap0782-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.17);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0782-metadata-only-agent",
      corpusId: "gap-0782-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0782-baseline",
      candidateRunId: "gap-0782-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T18:35:00.000Z"),
      rows: [
        {
          rowId: "gap-0782-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Source title, arXiv id, and claimed improvement without an AMC-owned replay fixture",
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

  it("does not add chemical-process identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("chemical_process_design_replay_corpus");
      expect(source).not.toContain("Simona");
    }
  });
});
