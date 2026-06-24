import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0739-maritime-autonomous-ships-replay-corpus-unavailable.md";
const DOI = "10.3390/info17030284";
const OPENALEX = "W7135056321";
const TITLE = "Deploying Efficient LLM Agents on Maritime Autonomous Surface Ships: Fine-Tuning, RAG, and Function Calling in a Mid-Size Model";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0739 maritime autonomous ships replay-corpus unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0739");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, MDPI publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("replayable benchmark corpus");
    expect(doc).toContain("Maritime Autonomous Surface Ships");
    expect(doc).toContain("Fine-Tuning");
    expect(doc).toContain("RAG");
    expect(doc).toContain("Function Calling");
    expect(doc).toContain("semantic reasoner");
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

  it("accepts maritime autonomy context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0739-maritime-context-agent",
      corpusId: "gap-0739-amc-owned-maritime-autonomy-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0739-baseline",
      candidateRunId: "gap-0739-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T21:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0739-owned-maritime-autonomy-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned maritime autonomy replay fixture with no copied vessel data, RAG corpus, or function-call traces",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 739,
            metadata: { sourceReview: "GAP-0739", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.63,
            evidenceRefs: ["ev-gap0739-baseline"],
            signedEvidenceRefs: ["ledger-gap0739-baseline", "ledger-gap0739-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0739-candidate"],
            signedEvidenceRefs: ["ledger-gap0739-candidate", "ledger-gap0739-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when maritime paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0739-metadata-only-agent",
      corpusId: "gap-0739-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0739-baseline",
      candidateRunId: "gap-0739-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T21:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0739-metadata-only-row",
          surfaces: ["Watch"],
          fixture: {
            task: "Source title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: [`https://doi.org/${DOI}`],
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

  it("does not add maritime identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("maritime_autonomous_ships_replay_corpus");
      expect(source).not.toContain("Maritime Autonomous Surface Ships");
    }
  });
});
