import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0808-evaluation-testing-production-replay-corpus.md";
const DOI = "10.5281/zenodo.20583927";
const ZENODO_RECORD = "20583928";
const OPENALEX = "W7163803520";
const TITLE = "Replication package for \"Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review\"";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0808 evaluation/testing production replication-package replay-corpus boundary", () => {
  it("documents live header retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0808");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source header verified");
    expect(doc).toContain("HTTP 302");
    expect(doc).toContain("https://zenodo.org/doi/10.5281/zenodo.20583927");
    expect(doc).toContain("/records/20583928");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP 200");
    expect(doc).toContain("Replication package");
    expect(doc).toContain("systematic literature review");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Information retrieval");
    expect(doc).toContain("Data extraction");
    expect(doc).toContain("Audit");
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

  it("accepts replication-package context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0808-production-eval-context",
      corpusId: "gap-0808-amc-owned-production-agent-eval-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0808-baseline",
      candidateRunId: "gap-0808-candidate",
      sourceRefs: [
        `https://doi.org/${DOI}`,
        `https://zenodo.org/records/${ZENODO_RECORD}`,
        `https://openalex.org/${OPENALEX}`,
      ],
      now: new Date("2026-06-21T23:08:00.000Z"),
      rows: [
        {
          rowId: "gap-0808-owned-production-eval-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned production-agent evaluation replay fixture with no copied upstream replication-package files",
            inputHash: hash("v"),
            expectedHash: hash("w"),
            fixtureHash: hash("x"),
            seed: 808,
            metadata: {
              sourceReview: "GAP-0808",
              sourceHeaderVerified: true,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.61,
            evidenceRefs: ["ev-gap0808-baseline"],
            signedEvidenceRefs: ["ledger-gap0808-baseline", "ledger-gap0808-baseline-ci"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["ev-gap0808-candidate"],
            signedEvidenceRefs: ["ledger-gap0808-candidate", "ledger-gap0808-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([
      `https://doi.org/${DOI}`,
      `https://zenodo.org/records/${ZENODO_RECORD}`,
      `https://openalex.org/${OPENALEX}`,
    ]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.13);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when replication-package metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0808-metadata-only-agent",
      corpusId: "gap-0808-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0808-baseline",
      candidateRunId: "gap-0808-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:08:00.000Z"),
      rows: [
        {
          rowId: "gap-0808-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "DOI, Zenodo redirect, OpenAlex id, and production-evaluation title without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [`https://doi.org/${DOI}`],
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

  it("does not add replication-package identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("evaluation_testing_production_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
