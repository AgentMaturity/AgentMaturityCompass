import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0909-langsmithgo-replay-corpus.md";
const REPO = "devalexandre/langsmithgo";
const URL = "https://github.com/devalexandre/langsmithgo";
const TITLE = "langsmithgo";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0909 langsmithgo replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0909");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("GPL-3.0 license");
    expect(doc).toContain("Star 16");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("20 Commits");
    expect(doc).toContain("Releases 5");
    expect(doc).toContain("v1.0.1");
    expect(doc).toContain("Jun 20, 2024");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Go 100.0%");
    expect(doc).toContain(".idea");
    expect(doc).toContain("docs");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("client_test.go");
    expect(doc).toContain("cliente.go");
    expect(doc).toContain("contracts.go");
    expect(doc).toContain("go.mod");
    expect(doc).toContain("go.sum");
    expect(doc).toContain("Golang-based client library");
    expect(doc).toContain("LangSmith API");
    expect(doc).toContain("tracking and monitoring");
    expect(doc).toContain("large language model");
    expect(doc).toContain("Go developers");
    expect(doc).toContain("LangSmith's tracing capabilities");
    expect(doc).toContain("production systems");
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

  it("accepts LangSmithGo context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0909-langsmithgo-reviewed-agent",
      corpusId: "gap-0909-amc-owned-langsmithgo-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0909-baseline",
      candidateRunId: "gap-0909-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-22T22:09:00.000Z"),
      rows: [
        {
          rowId: "gap-0909-owned-trace-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned trace replay fixture with no copied LangSmithGo client code, LangSmith API calls, Go contracts, tracing payloads, docs, tests, credentials, or production traces",
            inputHash: hash("l"),
            expectedHash: hash("m"),
            fixtureHash: hash("n"),
            seed: 909,
            metadata: { sourceReview: "GAP-0909", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.53,
            evidenceRefs: ["ev-gap0909-baseline"],
            signedEvidenceRefs: ["ledger-gap0909-baseline", "ledger-gap0909-baseline-ci"],
          },
          candidate: {
            score0to1: 0.73,
            evidenceRefs: ["ev-gap0909-candidate"],
            signedEvidenceRefs: ["ledger-gap0909-candidate", "ledger-gap0909-candidate-ci"],
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
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.2);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when LangSmithGo metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0909-metadata-only-agent",
      corpusId: "gap-0909-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0909-baseline",
      candidateRunId: "gap-0909-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T22:09:00.000Z"),
      rows: [
        {
          rowId: "gap-0909-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "LangSmithGo, LangSmith API, Go tracing client, production monitoring, contracts, client tests, and release metadata without an AMC-owned replay fixture",
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

  it("does not add LangSmithGo identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("langsmithgo_replay_corpus");
      expect(source).not.toContain("langsmithgo");
    }
  });
});
