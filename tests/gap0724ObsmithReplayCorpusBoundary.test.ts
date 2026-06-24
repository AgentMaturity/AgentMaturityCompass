import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0724-obsmith-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2510.10066";
const DOI = "10.1145/3798204";
const OPENALEX = "W7133296620";
const TITLE = "OBsmith: LLM-Powered JavaScript Obfuscator Testing";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0724 OBsmith replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0724");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("JavaScript obfuscator");
    expect(doc).toContain("correctness testing");
    expect(doc).toContain("executable programs");
    expect(doc).toContain("generated tests");
    expect(doc).toContain("tool-evaluation context");
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

  it("accepts JavaScript-obfuscator context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0724-obsmith-context-agent",
      corpusId: "gap-0724-amc-owned-js-obfuscator-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0724-baseline",
      candidateRunId: "gap-0724-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T20:15:00.000Z"),
      rows: [
        {
          rowId: "gap-0724-owned-js-obfuscator-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned JavaScript obfuscator replay fixture with no copied upstream programs or outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 724,
            metadata: { sourceReview: "GAP-0724", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.66,
            evidenceRefs: ["ev-gap0724-baseline"],
            signedEvidenceRefs: ["ledger-gap0724-baseline", "ledger-gap0724-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap0724-candidate"],
            signedEvidenceRefs: ["ledger-gap0724-candidate", "ledger-gap0724-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0724-metadata-only-agent",
      corpusId: "gap-0724-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0724-baseline",
      candidateRunId: "gap-0724-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T20:15:00.000Z"),
      rows: [
        {
          rowId: "gap-0724-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "OBsmith title and DOI without an AMC-owned replay fixture",
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

  it("does not add OBsmith identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("obsmith_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
