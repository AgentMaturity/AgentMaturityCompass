import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0799-msadm-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2406.08305";
const ARXIV_DOI = "10.48550/arXiv.2406.08305";
const RELATED_DOI = "10.1109/TMC.2026.3668817";
const OPENALEX = "W4399657688";
const TITLE = "MSADM: Large Language Model (LLM) Assisted End-to-End Network Health Management Based on Multi-Scale Semanticization";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0799 MSADM replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0799");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(RELATED_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `12 Jun 2024`");
    expect(doc).toContain("last revised `23 Mar 2026`");
    expect(doc).toContain("Fengxiao Tang");
    expect(doc).toContain("Xiaonan Wang");
    expect(doc).toContain("Xun Yuan");
    expect(doc).toContain("Linfeng Luo");
    expect(doc).toContain("Ming Zhao");
    expect(doc).toContain("Tianchi Huang");
    expect(doc).toContain("Nei Kato");
    expect(doc).toContain("Networking and Internet Architecture");
    expect(doc).toContain("Signal Processing");
    expect(doc).toContain("heterogeneous networks");
    expect(doc).toContain("Multi-Scale Semanticized Anomaly Detection Model");
    expect(doc).toContain("chain-of-thought-based");
    expect(doc).toContain("fault diagnosis");
    expect(doc).toContain("optimization strategies");
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

  it("accepts network-health context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0799-network-health-context",
      corpusId: "gap-0799-amc-owned-network-health-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0799-baseline",
      candidateRunId: "gap-0799-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${ARXIV_DOI}`, `https://doi.org/${RELATED_DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T20:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0799-owned-network-health-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned network-health replay fixture with no copied upstream MSADM data, network telemetry, or diagnosis labels",
            inputHash: hash("m"),
            expectedHash: hash("n"),
            fixtureHash: hash("o"),
            seed: 799,
            metadata: { sourceReview: "GAP-0799", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.64,
            evidenceRefs: ["ev-gap0799-baseline"],
            signedEvidenceRefs: ["ledger-gap0799-baseline", "ledger-gap0799-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0799-candidate"],
            signedEvidenceRefs: ["ledger-gap0799-candidate", "ledger-gap0799-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([
      ARXIV,
      `https://doi.org/${ARXIV_DOI}`,
      `https://doi.org/${RELATED_DOI}`,
      `https://openalex.org/${OPENALEX}`,
    ]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.14);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0799-metadata-only-agent",
      corpusId: "gap-0799-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0799-baseline",
      candidateRunId: "gap-0799-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T20:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0799-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "arXiv title, DOI, OpenAlex id, and MSADM claims without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [ARXIV, `https://doi.org/${RELATED_DOI}`],
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

  it("does not add MSADM identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(RELATED_DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("msadm_replay_corpus");
      expect(source).not.toContain("Multi-Scale Semanticized Anomaly Detection Model");
    }
  });
});
