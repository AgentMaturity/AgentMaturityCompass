import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0753-impress-replay-corpus-unavailable.md";
const DOI = "10.1145/3742413.3789151";
const OPENALEX = "W7133312535";
const TITLE = "ImpReSS: Designing and Evaluating a Lightweight Implicit Recommender System in Conversational Support Agents";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0753 ImpReSS replay-corpus unavailable-source boundary", () => {
  it("documents unavailable ACM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0753");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches returned no primary result");
    expect(doc).toContain("returned `403`");
    expect(doc).toContain("replayable benchmark corpus");
    expect(doc).toContain("recommender system");
    expect(doc).toContain("personalization");
    expect(doc).toContain("human-computer interaction");
    expect(doc).toContain("product");
    expect(doc).toContain("purchasing");
    expect(doc).toContain("customer support");
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

  it("accepts support-agent recommender context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0753-impress-context-agent",
      corpusId: "gap-0753-amc-owned-support-recommender-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0753-baseline",
      candidateRunId: "gap-0753-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T21:53:00.000Z"),
      rows: [
        {
          rowId: "gap-0753-owned-support-recommender-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned conversational support recommender replay fixture with no copied ImpReSS product data, transcripts, prompts, or outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 753,
            metadata: {
              sourceReview: "GAP-0753",
              workloadClass: "support-agent-implicit-recommendation",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0753-baseline"],
            signedEvidenceRefs: ["ledger-gap0753-baseline", "ledger-gap0753-baseline-ci"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["ev-gap0753-candidate"],
            signedEvidenceRefs: ["ledger-gap0753-candidate", "ledger-gap0753-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0.1);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when ImpReSS metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0753-metadata-only-agent",
      corpusId: "gap-0753-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0753-baseline",
      candidateRunId: "gap-0753-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T21:53:00.000Z"),
      rows: [
        {
          rowId: "gap-0753-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "ImpReSS title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.70,
            evidenceRefs: [`https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.82,
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

  it("does not add ImpReSS identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("impress_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
