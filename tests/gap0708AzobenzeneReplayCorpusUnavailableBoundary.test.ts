import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0708-azobenzene-agent-workflow-replay-corpus-unavailable.md";
const DOI = "10.1039/d5sc08794e";
const OPENALEX = "W7140292092";
const TITLE = "Unlocking azobenzene isomerization mechanisms via an LLM agent-driven workflow integrating simulation, experiment, and machine learning";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0708 azobenzene replay-corpus unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0708");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, Royal Society of Chemistry publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("replayable benchmark corpus");
    expect(doc).toContain("azobenzene");
    expect(doc).toContain("isomerization");
    expect(doc).toContain("molecular machine");
    expect(doc).toContain("nanotechnology");
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

  it("accepts azobenzene workflow context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0708-azobenzene-context-agent",
      corpusId: "gap-0708-amc-owned-chemistry-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0708-baseline",
      candidateRunId: "gap-0708-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T17:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0708-owned-chemistry-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned chemistry workflow replay fixture with no copied upstream molecule or experiment data",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 708,
            metadata: { sourceReview: "GAP-0708", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.77,
            evidenceRefs: ["ev-gap0708-baseline"],
            signedEvidenceRefs: ["ledger-gap0708-baseline", "ledger-gap0708-baseline-ci"],
          },
          candidate: {
            score0to1: 0.9,
            evidenceRefs: ["ev-gap0708-candidate"],
            signedEvidenceRefs: ["ledger-gap0708-candidate", "ledger-gap0708-candidate-ci"],
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

  it("fails closed when chemistry paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0708-metadata-only-agent",
      corpusId: "gap-0708-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0708-baseline",
      candidateRunId: "gap-0708-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T17:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0708-metadata-only-row",
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

  it("does not add azobenzene identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("azobenzene_replay_corpus");
      expect(source).not.toContain("isomerization mechanisms");
    }
  });
});
