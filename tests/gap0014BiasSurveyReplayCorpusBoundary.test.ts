import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0014-bias-survey-replay-corpus.md";
const DOI = "https://doi.org/10.3390/electronics15091824";
const ARXIV = "https://arxiv.org/abs/2411.10915";
const MDPI = "https://www.mdpi.com/2079-9292/15/9/1824";
const OPENALEX = "https://openalex.org/W4404570405";
const OPENALEX_API = "https://api.openalex.org/works/W4404570405";
const TITLE = "Bias in Large Language Models: Origin, Evaluation, and Mitigation";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0014 bias survey replay-corpus boundary", () => {
  it("documents live bias-survey metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0014");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain("Electronics");
    expect(doc).toContain("Publication date: 2026-04-24");
    expect(doc).toContain("Submitted on 16 Nov 2024");
    expect(doc).toContain("last revised 1 May 2026");
    expect(doc).toContain("Computation and Language");
    expect(doc).toContain("Machine Learning");
    expect(doc).toContain("intrinsic and extrinsic");
    expect(doc).toContain("data-level, model-level, and output-level");
    expect(doc).toContain("pre-model, intra-model, and post-model");
    expect(doc).toContain("healthcare and criminal justice");
    expect(doc).toContain("gold");
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

  it("accepts bias-survey context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0014-bias-survey-reviewed-agent",
      corpusId: "gap-0014-amc-owned-bias-survey-replay-corpus",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0014-baseline",
      candidateRunId: "gap-0014-candidate",
      sourceRefs: [DOI, ARXIV, MDPI, OPENALEX],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0014-owned-bias-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for bias-evaluation evidence with no copied paper benchmark rows, datasets, prompts, examples, tables, figures, or model outputs",
            inputHash: hash("bias-input"),
            expectedHash: hash("bias-expected"),
            fixtureHash: hash("bias-fixture"),
            seed: 14,
            metadata: {
              sourceReview: "GAP-0014",
              paperContext: "llm-bias-origin-evaluation-mitigation",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0014-baseline"],
            signedEvidenceRefs: ["ledger-gap0014-baseline", "ledger-gap0014-baseline-ci"],
          },
          candidate: {
            score0to1: 0.77,
            evidenceRefs: ["ev-gap0014-candidate"],
            signedEvidenceRefs: ["ledger-gap0014-candidate", "ledger-gap0014-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, ARXIV, MDPI, OPENALEX]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.ciReceiptPresent).toBe(true);
    expect(receipt.scoreDeltaPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.19);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when bias paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0014-bias-metadata-only-agent",
      corpusId: "gap-0014-bias-metadata-only",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0014-baseline",
      candidateRunId: "gap-0014-candidate",
      sourceRefs: [],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0014-bias-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Bias paper title, DOI, arXiv, MDPI, OpenAlex, intrinsic/extrinsic bias labels, evaluation method labels, mitigation labels, healthcare/legal harm labels, and benchmark references without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: [DOI, ARXIV],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: [MDPI, OPENALEX],
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

  it("does not add bias-survey identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W4404570405");
      expect(source).not.toContain("bias_survey_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
