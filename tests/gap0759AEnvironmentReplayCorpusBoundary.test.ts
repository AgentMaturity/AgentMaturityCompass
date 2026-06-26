import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0759-aenvironment-replay-corpus.md";
const SOURCE = "https://github.com/inclusionAI/AEnvironment";
const README = "https://github.com/inclusionAI/AEnvironment/blob/main/README.md";
const DOCS = "https://inclusionai.github.io/AEnvironment/";
const REPO = "inclusionAI/AEnvironment";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0759 AEnvironment replay-corpus boundary", () => {
  it("documents live AEnvironment metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0759");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(REPO);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("Everything as Environment");
    expect(doc).toContain("Agentic RL");
    expect(doc).toContain("standardized MCP protocol");
    expect(doc).toContain("AReaL reinforcement learning");
    expect(doc).toContain("unified Environment interface");
    expect(doc).toContain("benchmark integration");
    expect(doc).toContain("TAU2-Bench");
    expect(doc).toContain("SWE-Bench");
    expect(doc).toContain("Terminal-Bench");
    expect(doc).toContain("OpenAI Agents SDK");
    expect(doc).toContain("Agent as Environment");
    expect(doc).toContain("multi-agent orchestration");
    expect(doc).toContain("hierarchical systems");
    expect(doc).toContain("Mini Program IDE");
    expect(doc).toContain("file operations");
    expect(doc).toContain("code execution");
    expect(doc).toContain("validation tools");
    expect(doc).toContain("live preview");
    expect(doc).toContain("reward functions");
    expect(doc).toContain("episode runner");
    expect(doc).toContain("MCP Inspector");
    expect(doc).toContain("Apache License 2.0");
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

  it("accepts AEnvironment context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0759-aenvironment-reviewed-agent",
      corpusId: "gap-0759-amc-owned-environment-backed-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0759-environment-baseline",
      candidateRunId: "gap-0759-environment-candidate",
      sourceRefs: [SOURCE, README, DOCS],
      now: new Date("2026-06-21T22:59:00.000Z"),
      rows: [
        {
          rowId: "gap-0759-owned-environment-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned environment-backed agent replay fixture with no copied AEnvironment configs, tools, rewards, benchmark rows, or runtime artifacts",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 759,
            metadata: {
              sourceReview: "GAP-0759",
              workloadClass: "environment-backed-agent-benchmark",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.57,
            evidenceRefs: ["ev-gap0759-baseline"],
            signedEvidenceRefs: ["ledger-gap0759-baseline", "ledger-gap0759-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0759-candidate"],
            signedEvidenceRefs: ["ledger-gap0759-candidate", "ledger-gap0759-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([SOURCE, README, DOCS]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0.2);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when AEnvironment metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0759-metadata-only-agent",
      corpusId: "gap-0759-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0759-baseline",
      candidateRunId: "gap-0759-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T22:59:00.000Z"),
      rows: [
        {
          rowId: "gap-0759-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "AEnvironment README and docs labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.70,
            evidenceRefs: [SOURCE, README],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.84,
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

  it("does not add AEnvironment identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("AEnvironment");
      expect(source).not.toContain("aenvironment_replay_corpus");
      expect(source).not.toContain("Everything as Environment");
    }
  });
});
