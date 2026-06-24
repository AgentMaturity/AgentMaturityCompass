import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0814-frfp-trading-replay-corpus.md";
const DOI = "10.5281/zenodo.20481444";
const ZENODO_RECORD = "20481444";
const OPENALEX = "W7162953700";
const TITLE = "FRFP Governance Improves LLM Trading Agents: A Lean-Formalized, Shared-Window Evaluation";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0814 FRFP trading replay-corpus boundary", () => {
  it("documents live header retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0814");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source header verified");
    expect(doc).toContain("HTTP 302");
    expect(doc).toContain("https://zenodo.org/doi/10.5281/zenodo.20481444");
    expect(doc).toContain("HTTP/1.1 200 OK");
    expect(doc).toContain("frfp_trading_paper.pdf");
    expect(doc).toContain("creativecommons.org/licenses/by/4.0");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP 200");
    expect(doc).toContain("FRFP-based Human-AI protocol");
    expect(doc).toContain("multi-agent trading workflow");
    expect(doc).toContain("matched infrastructure and scoring");
    expect(doc).toContain("shared-window evaluation");
    expect(doc).toContain("Lean-Formalized");
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

  it("accepts FRFP trading context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0814-frfp-trading-context",
      corpusId: "gap-0814-amc-owned-trading-governance-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0814-baseline",
      candidateRunId: "gap-0814-candidate",
      sourceRefs: [
        `https://doi.org/${DOI}`,
        `https://zenodo.org/records/${ZENODO_RECORD}`,
        `https://openalex.org/${OPENALEX}`,
      ],
      now: new Date("2026-06-21T23:14:00.000Z"),
      rows: [
        {
          rowId: "gap-0814-owned-frfp-trading-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned trading-governance replay fixture with no copied FRFP paper, Lean proof, trading traces, or benchmark rows",
            inputHash: hash("5"),
            expectedHash: hash("6"),
            fixtureHash: hash("7"),
            seed: 814,
            metadata: {
              sourceReview: "GAP-0814",
              tradingGovernanceContext: true,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.6,
            evidenceRefs: ["ev-gap0814-baseline"],
            signedEvidenceRefs: ["ledger-gap0814-baseline", "ledger-gap0814-baseline-ci"],
          },
          candidate: {
            score0to1: 0.71,
            evidenceRefs: ["ev-gap0814-candidate"],
            signedEvidenceRefs: ["ledger-gap0814-candidate", "ledger-gap0814-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.11);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when FRFP/trading metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0814-metadata-only-agent",
      corpusId: "gap-0814-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0814-baseline",
      candidateRunId: "gap-0814-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:14:00.000Z"),
      rows: [
        {
          rowId: "gap-0814-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "DOI, Zenodo, FRFP, Lean, shared-window, and trading-agent metadata without an AMC-owned replay fixture",
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

  it("does not add FRFP trading identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("frfp_trading_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
