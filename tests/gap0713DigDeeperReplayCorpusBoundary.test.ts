import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0713-dig-deeper-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2509.23327";
const DOI = "10.1145/3772318.3790551";
const ARXIV_DOI = "10.48550/arXiv.2509.23327";
const OPENALEX = "W4415332356";
const TITLE = "\"Shall We Dig Deeper?\": Designing and Evaluating Strategies for LLM Agents to Advance Knowledge Co-Construction in Asynchronous Online Discussions";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0713 Dig Deeper replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0713");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `2025-09-27`");
    expect(doc).toContain("last revised `2026-02-01`");
    expect(doc).toContain("Human-Computer Interaction");
    expect(doc).toContain("Yuanhao Zhang");
    expect(doc).toContain("Wenbo Li");
    expect(doc).toContain("Xiaojuan Ma");
    expect(doc).toContain("task-oriented");
    expect(doc).toContain("relationship-oriented");
    expect(doc).toContain("within-subject study with `N=60`");
    expect(doc).toContain("five consecutive asynchronous discussions");
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

  it("accepts discussion-agent context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0713-discussion-agent-context",
      corpusId: "gap-0713-amc-owned-discussion-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0713-baseline",
      candidateRunId: "gap-0713-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T18:20:00.000Z"),
      rows: [
        {
          rowId: "gap-0713-owned-discussion-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned asynchronous discussion facilitation replay fixture with no copied upstream study data",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 713,
            metadata: { sourceReview: "GAP-0713", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["ev-gap0713-baseline"],
            signedEvidenceRefs: ["ledger-gap0713-baseline", "ledger-gap0713-baseline-ci"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["ev-gap0713-candidate"],
            signedEvidenceRefs: ["ledger-gap0713-candidate", "ledger-gap0713-candidate-ci"],
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
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0713-metadata-only-agent",
      corpusId: "gap-0713-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0713-baseline",
      candidateRunId: "gap-0713-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T18:20:00.000Z"),
      rows: [
        {
          rowId: "gap-0713-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Source title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: [ARXIV, `https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.8,
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

  it("does not add Dig Deeper identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("dig_deeper_replay_corpus");
      expect(source).not.toContain("Knowledge Co-Construction");
    }
  });
});
