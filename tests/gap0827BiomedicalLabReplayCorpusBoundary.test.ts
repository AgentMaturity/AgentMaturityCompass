import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0827-biomedical-lab-replay-corpus.md";
const DOI = "10.64898/2026.05.13.724985";
const DOI_URL = `https://doi.org/${DOI}`;
const BIORXIV_LOOKUP = `http://biorxiv.org/lookup/doi/${DOI}`;
const BIORXIV_HTTPS = `https://www.biorxiv.org/lookup/doi/${DOI}`;
const OPENALEX = "W7161577328";
const TITLE = "Evaluating open LLMs for agentic analysis orchestration in a typical biomedical lab";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0827 biomedical lab replay-corpus boundary", () => {
  it("documents live DOI/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0827");
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_URL);
    expect(doc).toContain(BIORXIV_LOOKUP);
    expect(doc).toContain(BIORXIV_HTTPS);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("bioRxiv lookup returned HTTP/1.1 302");
    expect(doc).toContain("HTTPS bioRxiv returned HTTP/2 403");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("biomedical lab");
    expect(doc).toContain("agentic tools");
    expect(doc).toContain("plans");
    expect(doc).toContain("external tools");
    expect(doc).toContain("executes code");
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

  it("accepts biomedical lab context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0827-biomedical-lab-context",
      corpusId: "gap-0827-amc-owned-biomedical-lab-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0827-baseline",
      candidateRunId: "gap-0827-candidate",
      sourceRefs: [DOI_URL, BIORXIV_LOOKUP, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0827-owned-biomedical-lab-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned biomedical lab replay fixture with no copied upstream workflows, prompts, datasets, or analysis scripts",
            inputHash: hash("s"),
            expectedHash: hash("t"),
            fixtureHash: hash("u"),
            seed: 827,
            metadata: { sourceReview: "GAP-0827", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.61,
            evidenceRefs: ["ev-gap0827-baseline"],
            signedEvidenceRefs: ["ledger-gap0827-baseline", "ledger-gap0827-baseline-ci"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["ev-gap0827-candidate"],
            signedEvidenceRefs: ["ledger-gap0827-candidate", "ledger-gap0827-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI_URL, BIORXIV_LOOKUP, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.15);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0827-metadata-only-agent",
      corpusId: "gap-0827-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0827-baseline",
      candidateRunId: "gap-0827-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0827-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "DOI, OpenAlex, biomedical lab title, and agentic-tools metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [DOI_URL],
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

  it("does not add biomedical lab identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("biomedical_lab_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
