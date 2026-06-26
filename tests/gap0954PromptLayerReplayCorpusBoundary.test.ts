import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0954-promptlayer-replay-corpus.md";
const URL = "https://promptlayer.com";
const CANONICAL = "https://www.promptlayer.com/";
const DOCS = "https://docs.promptlayer.com/overview";
const GITHUB = "https://github.com/MagnivOrg/prompt-layer-library";
const TITLE = "PromptLayer";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0954 PromptLayer replay-corpus boundary", () => {
  it("documents live PromptLayer metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0954");
    expect(doc).toContain(URL);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live PromptLayer homepage");
    expect(doc).toContain("Version and test your agents");
    expect(doc).toContain("collaboration layer for AI engineering teams");
    expect(doc).toContain("prompt CMS, eval harness, and observability stack");
    expect(doc).toContain("domain experts collaborate");
    expect(doc).toContain("Observability and evaluations for AI teams");
    expect(doc).toContain("See what happened. Prove what improved.");
    expect(doc).toContain("trace production requests and understand quality, cost, and latency");
    expect(doc).toContain("Tables to monitor results and run evaluations");
    expect(doc).toContain("Prompt Registry");
    expect(doc).toContain("Trace, evaluate, release");
    expect(doc).toContain("Compare changes against real examples before they reach users");
    expect(doc).toContain("Eval score");
    expect(doc).toContain("Latency");
    expect(doc).toContain("A simple loop from signal to release");
    expect(doc).toContain("Capture requests, responses, metadata, cost, latency, and feedback in one timeline");
    expect(doc).toContain("Organize datasets, score experiments, and compare versions against real behavior");
    expect(doc).toContain("Ship approved prompt versions");
    expect(doc).toContain("Release Labels");
    expect(doc).toContain("AB Testing");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Self-hosting");
    expect(doc).toContain("MCP");
    expect(doc).toContain("Star 771");
    expect(doc).toContain("Fork 90");
    expect(doc).toContain("Issues 15");
    expect(doc).toContain("Pull requests 6");
    expect(doc).toContain("514 Commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Version, test, and monitor every prompt and agent with robust evals, tracing, and regression sets");
    expect(doc).toContain("Track, debug, and replay old completions");
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

  it("accepts PromptLayer context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0954-promptlayer-reviewed-agent",
      corpusId: "gap-0954-amc-owned-promptlayer-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0954-baseline",
      candidateRunId: "gap-0954-candidate",
      sourceRefs: [URL, CANONICAL, DOCS, GITHUB],
      now: new Date("2026-06-22T23:54:00.000Z"),
      rows: [
        {
          rowId: "gap-0954-owned-prompt-release-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned prompt release replay fixture with no copied PromptLayer prompts, datasets, traces, scores, examples, docs prose, SDK code, configs, or UI assets",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 954,
            metadata: { sourceReview: "GAP-0954", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.52,
            evidenceRefs: ["ev-gap0954-baseline"],
            signedEvidenceRefs: ["ledger-gap0954-baseline", "ledger-gap0954-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap0954-candidate"],
            signedEvidenceRefs: ["ledger-gap0954-candidate", "ledger-gap0954-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([URL, CANONICAL, DOCS, GITHUB]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.29);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when PromptLayer metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0954-metadata-only-agent",
      corpusId: "gap-0954-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0954-baseline",
      candidateRunId: "gap-0954-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:54:00.000Z"),
      rows: [
        {
          rowId: "gap-0954-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "PromptLayer prompt CMS, eval harness, observability stack, Tables, datasets, eval scores, Prompt Registry, releases, OpenTelemetry, MCP, and replay metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [URL],
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

  it("does not add PromptLayer identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain(CANONICAL);
      expect(source).not.toContain("promptlayer_replay_corpus");
    }
  });
});
