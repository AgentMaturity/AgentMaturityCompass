import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0669-industrialized-deception-replay-corpus.md";
const DOI = "10.1145/3774905.3795471";
const OPENALEX = "W7128718048";
const ARXIV = "https://arxiv.org/abs/2601.21963";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const implementationFiles = [
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

describe("GAP-0669 industrialized deception replay-corpus boundary", () => {
  it("documents live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0669");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("Industrialized Deception");
    expect(doc).toContain("Companion Proceedings of the ACM Web Conference 2026");
    expect(doc).toContain("JudgeGPT");
    expect(doc).toContain("RogueGPT");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts misinformation-risk replay claims only through AMC-owned signed replay rows", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0669-misinformation-risk-agent",
      corpusId: "gap-0669-amc-owned-misinformation-risk-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0669-baseline",
      candidateRunId: "gap-0669-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`, ARXIV],
      now: new Date("2026-06-21T08:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0669-owned-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned misinformation-risk replay fixture with no upstream stimulus copy",
            inputHash: hash("d"),
            expectedHash: hash("e"),
            fixtureHash: hash("f"),
            seed: 669,
            metadata: {
              sourceReview: "GAP-0669",
              copiedUpstreamArtifacts: false,
              upstreamStimulusCopied: false,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["ev-gap0669-baseline"],
            signedEvidenceRefs: ["ledger-gap0669-baseline", "ledger-gap0669-baseline-ci"],
          },
          candidate: {
            score0to1: 0.88,
            evidenceRefs: ["ev-gap0669-candidate"],
            signedEvidenceRefs: ["ledger-gap0669-candidate", "ledger-gap0669-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`, ARXIV]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.16);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata or upstream tool labels replace replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0669-metadata-only-agent",
      corpusId: "gap-0669-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0669-baseline",
      candidateRunId: "gap-0669-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T08:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0669-metadata-only-row",
          surfaces: ["Shield"],
          fixture: {
            task: "Industrialized Deception source title plus JudgeGPT and RogueGPT labels only",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [`https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [ARXIV],
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

  it("does not add industrialized-deception identifiers to replay implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("2601.21963");
      expect(source).not.toContain("JudgeGPT");
      expect(source).not.toContain("RogueGPT");
      expect(source).not.toContain("industrialized_deception_replay_corpus");
    }
  });
});
