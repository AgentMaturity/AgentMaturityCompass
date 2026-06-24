import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0790-library-learning-replay-corpus.md";
const ACL = "https://aclanthology.org/2026.eacl-long.163/";
const DOI = "10.18653/v1/2026.eacl-long.163";
const OPENALEX = "W7140121850";
const TITLE = "Is This LLM Library Learning? Evaluation Must Account For Compute and Behaviour";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0790 library learning replay-corpus boundary", () => {
  it("documents live ACL metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0790");
    expect(doc).toContain(ACL);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Ian Berlot-Attwell");
    expect(doc).toContain("Tobias Sesterhenn");
    expect(doc).toContain("Frank Rudzicz");
    expect(doc).toContain("Xujie Si");
    expect(doc).toContain("EACL");
    expect(doc).toContain("March");
    expect(doc).toContain("2026");
    expect(doc).toContain("Rabat, Morocco");
    expect(doc).toContain("Association for Computational Linguistics");
    expect(doc).toContain("pages 3534-3568");
    expect(doc).toContain("2026.eacl-long.163");
    expect(doc).toContain("in-context learning");
    expect(doc).toContain("library learning");
    expect(doc).toContain("computational cost");
    expect(doc).toContain("equal computational budget");
    expect(doc).toContain("behavioural analysis");
    expect(doc).toContain("LEGO-Prover");
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

  it("accepts library-learning context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0790-library-learning-context",
      corpusId: "gap-0790-amc-owned-library-learning-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0790-baseline",
      candidateRunId: "gap-0790-candidate",
      sourceRefs: [ACL, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T19:15:00.000Z"),
      rows: [
        {
          rowId: "gap-0790-owned-library-learning-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned library-learning replay fixture with equal compute budget and no copied upstream task data",
            inputHash: hash("j"),
            expectedHash: hash("k"),
            fixtureHash: hash("l"),
            seed: 790,
            metadata: { sourceReview: "GAP-0790", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["ev-gap0790-baseline"],
            signedEvidenceRefs: ["ledger-gap0790-baseline", "ledger-gap0790-baseline-ci"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["ev-gap0790-candidate"],
            signedEvidenceRefs: ["ledger-gap0790-candidate", "ledger-gap0790-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ACL, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.04);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0790-metadata-only-agent",
      corpusId: "gap-0790-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0790-baseline",
      candidateRunId: "gap-0790-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T19:15:00.000Z"),
      rows: [
        {
          rowId: "gap-0790-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "ACL title, DOI, and library-learning claims without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [ACL, `https://doi.org/${DOI}`],
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

  it("does not add library-learning identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("library_learning_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
