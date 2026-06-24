import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0968-patronus-replay-corpus.md";
const HOME = "https://www.patronus.ai";
const DOCS = "https://docs.patronus.ai/docs";
const TITLE = "Patronus AI";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0968 Patronus AI replay-corpus boundary", () => {
  it("documents live Patronus AI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0968");
    expect(doc).toContain(HOME);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Patronus AI homepage");
    expect(doc).toContain("live Patronus docs");
    expect(doc).toContain("Digital World Models");
    expect(doc).toContain("long-horizon tasks");
    expect(doc).toContain("world data artifacts");
    expect(doc).toContain("Simulation Domains");
    expect(doc).toContain("Deep Research");
    expect(doc).toContain("Multi-Turn Dialogue");
    expect(doc).toContain("Long Horizon");
    expect(doc).toContain("Memory");
    expect(doc).toContain("Lynx");
    expect(doc).toContain("FinanceBench");
    expect(doc).toContain("BLUR");
    expect(doc).toContain("GLIDER");
    expect(doc).toContain("Evaluators");
    expect(doc).toContain("Evaluations");
    expect(doc).toContain("Experiments");
    expect(doc).toContain("Datasets");
    expect(doc).toContain("Comparisons");
    expect(doc).toContain("Traces");
    expect(doc).toContain("real time alerts");
    expect(doc).toContain("Dataset Generation");
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

  it("accepts Patronus context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0968-patronus-reviewed-agent",
      corpusId: "gap-0968-amc-owned-patronus-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0968-baseline",
      candidateRunId: "gap-0968-candidate",
      sourceRefs: [HOME, DOCS],
      now: new Date("2026-06-22T23:59:00.000Z"),
      rows: [
        {
          rowId: "gap-0968-owned-patronus-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for Patronus-style simulation, evaluation, monitoring, and dataset-generation context with no copied Patronus datasets, research rows, prompts, docs, traces, or generated outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 968,
            metadata: { sourceReview: "GAP-0968", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.5,
            evidenceRefs: ["ev-gap0968-baseline"],
            signedEvidenceRefs: ["ledger-gap0968-baseline", "ledger-gap0968-baseline-ci"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["ev-gap0968-candidate"],
            signedEvidenceRefs: ["ledger-gap0968-candidate", "ledger-gap0968-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([HOME, DOCS]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.36);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Patronus metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0968-metadata-only-agent",
      corpusId: "gap-0968-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0968-baseline",
      candidateRunId: "gap-0968-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:59:00.000Z"),
      rows: [
        {
          rowId: "gap-0968-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Patronus homepage, Digital World Models, FinanceBench, Lynx, GLIDER, evaluation docs, monitoring docs, dataset generation, and simulation labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [HOME],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [DOCS],
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

  it("does not add Patronus identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("patronus_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
