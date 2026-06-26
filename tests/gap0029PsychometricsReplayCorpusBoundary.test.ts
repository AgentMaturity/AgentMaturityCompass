import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0029-psychometrics-replay-corpus.md";
const DOI = "https://doi.org/10.1145/3769688";
const ARXIV = "https://arxiv.org/abs/2310.16379";
const ACM = "https://dl.acm.org/doi/10.1145/3769688";
const OPENALEX = "https://openalex.org/W4387963810";
const OPENALEX_API = "https://api.openalex.org/works/W4387963810";
const TITLE = "Evaluating General-Purpose AI with Psychometrics";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0029 psychometrics replay-corpus boundary", () => {
  it("documents live psychometrics metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0029");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ACM);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain("Communications of the ACM");
    expect(doc).toContain("Publication date: 2026-04-14");
    expect(doc).toContain("Submitted on 25 Oct 2023");
    expect(doc).toContain("last revised 29 Dec 2023");
    expect(doc).toContain("Artificial Intelligence");
    expect(doc).toContain("Computers and Society");
    expect(doc).toContain("task-oriented evaluation");
    expect(doc).toContain("construct-oriented evaluation");
    expect(doc).toContain("reliability and validity");
    expect(doc).toContain("latent constructs");
    expect(doc).toContain("hybrid");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("signed evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts psychometrics context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0029-psychometrics-reviewed-agent",
      corpusId: "gap-0029-amc-owned-psychometrics-replay-corpus",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0029-baseline",
      candidateRunId: "gap-0029-candidate",
      sourceRefs: [DOI, ARXIV, ACM, OPENALEX],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0029-owned-psychometrics-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for construct-oriented psychometric evaluation context with no copied paper items, test forms, examples, figures, tables, or benchmark data",
            inputHash: hash("psych-input"),
            expectedHash: hash("psych-expected"),
            fixtureHash: hash("psych-fixture"),
            seed: 29,
            metadata: {
              sourceReview: "GAP-0029",
              paperContext: "psychometrics-gpai-evaluation",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.6,
            evidenceRefs: ["ev-gap0029-baseline"],
            signedEvidenceRefs: ["ledger-gap0029-baseline", "ledger-gap0029-baseline-ci"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["ev-gap0029-candidate"],
            signedEvidenceRefs: ["ledger-gap0029-candidate", "ledger-gap0029-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, ARXIV, ACM, OPENALEX]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.ciReceiptPresent).toBe(true);
    expect(receipt.scoreDeltaPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.22);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when psychometrics paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0029-psychometrics-metadata-only-agent",
      corpusId: "gap-0029-psychometrics-metadata-only",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0029-baseline",
      candidateRunId: "gap-0029-candidate",
      sourceRefs: [],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0029-psychometrics-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Psychometrics title, DOI, arXiv, ACM, OpenAlex, construct-validity labels, reliability labels, task-oriented evaluation labels, and latent-construct labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: [DOI, ARXIV],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: [ACM, OPENALEX],
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

  it("does not add psychometrics identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W4387963810");
      expect(source).not.toContain("psychometrics_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
