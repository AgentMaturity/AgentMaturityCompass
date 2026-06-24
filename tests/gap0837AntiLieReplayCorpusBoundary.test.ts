import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0837-anti-lie-replay-corpus.md";
const REPO = "lc198707/anti-lie";
const URL = "https://github.com/lc198707/anti-lie";
const TITLE = "Don't make LLMs honest. Make every factual claim auditable.";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0837 Anti-Lie replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0837");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("api.github.com DNS lookup failed");
    expect(doc).toContain("GitHub HTML follow-up lookup failed");
    expect(doc).toContain("T1-T7 truth gradients");
    expect(doc).toContain("LiarBench");
    expect(doc).toContain("98.1% business effectiveness");
    expect(doc).toContain("claim auditing");
    expect(doc).toContain("factual claim");
    expect(doc).toContain("Python");
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

  it("accepts Anti-Lie context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0837-anti-lie-context",
      corpusId: "gap-0837-amc-owned-claim-audit-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0837-baseline",
      candidateRunId: "gap-0837-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-21T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0837-owned-claim-audit-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned claim-auditing replay fixture with no copied upstream claims, labels, prompts, datasets, or benchmark rows",
            inputHash: hash("s"),
            expectedHash: hash("t"),
            fixtureHash: hash("u"),
            seed: 837,
            metadata: { sourceReview: "GAP-0837", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.64,
            evidenceRefs: ["ev-gap0837-baseline"],
            signedEvidenceRefs: ["ledger-gap0837-baseline", "ledger-gap0837-baseline-ci"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["ev-gap0837-candidate"],
            signedEvidenceRefs: ["ledger-gap0837-candidate", "ledger-gap0837-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.16);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when repo metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0837-metadata-only-agent",
      corpusId: "gap-0837-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0837-baseline",
      candidateRunId: "gap-0837-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T23:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0837-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "GitHub, README, T1-T7, LiarBench, and claim-auditing metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [URL],
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

  it("does not add Anti-Lie identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("anti_lie_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
