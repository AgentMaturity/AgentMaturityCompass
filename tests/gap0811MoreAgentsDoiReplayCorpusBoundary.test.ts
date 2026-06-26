import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0811-more-agents-doi-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2606.05670";
const DOI = "10.48550/arxiv.2606.05670";
const OPENALEX = "W7163668543";
const TITLE = "Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0811 more-agents DOI replay-corpus boundary", () => {
  it("documents the DOI alias and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0811");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("same live source reviewed for GAP-0810");
    expect(doc).toContain("DOI returned HTTP 302");
    expect(doc).toContain("https://arxiv.org/abs/2606.05670");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP 200");
    expect(doc).toContain("Thu Jun  4 03:50:47 2026");
    expect(doc).toContain("BenchAgent");
    expect(doc).toContain("Protocol-Aligned External");
    expect(doc).toContain("benchmark loader");
    expect(doc).toContain("trajectory logging");
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

  it("accepts DOI-linked protocol context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0811-protocol-aligned-workflow-context",
      corpusId: "gap-0811-amc-owned-protocol-aligned-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0811-baseline",
      candidateRunId: "gap-0811-candidate",
      sourceRefs: [ARXIV, `doi:${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T23:11:00.000Z"),
      rows: [
        {
          rowId: "gap-0811-owned-protocol-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned DOI-linked protocol replay fixture with no copied BenchAgent rows or trajectories",
            inputHash: hash("y"),
            expectedHash: hash("z"),
            fixtureHash: hash("1"),
            seed: 811,
            metadata: {
              sourceReview: "GAP-0811",
              duplicateSourceOf: "GAP-0810",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.64,
            evidenceRefs: ["ev-gap0811-baseline"],
            signedEvidenceRefs: ["ledger-gap0811-baseline", "ledger-gap0811-baseline-ci"],
          },
          candidate: {
            score0to1: 0.75,
            evidenceRefs: ["ev-gap0811-candidate"],
            signedEvidenceRefs: ["ledger-gap0811-candidate", "ledger-gap0811-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `doi:${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.11);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when DOI/OpenAlex metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0811-metadata-only-agent",
      corpusId: "gap-0811-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0811-baseline",
      candidateRunId: "gap-0811-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:11:00.000Z"),
      rows: [
        {
          rowId: "gap-0811-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "DOI, OpenAlex id, BenchAgent, and workflow comparison metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [`doi:${DOI}`],
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

  it("does not add DOI-specific BenchAgent identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("benchagent_doi_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
