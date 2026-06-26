import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0946-galileo-replay-corpus.md";
const URL = "https://www.galileo.ai";
const CANONICAL = "https://galileo.ai/";
const DOCS = "https://docs.galileo.ai/what-is-galileo";
const TITLE = "Galileo";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0946 Galileo replay-corpus boundary", () => {
  it("documents live Galileo metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0946");
    expect(doc).toContain(URL);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Galileo homepage");
    expect(doc).toContain("Don't just monitor AI failures. Stop them.");
    expect(doc).toContain("offline evals become production guardrails");
    expect(doc).toContain("Capture your groundtruth");
    expect(doc).toContain("Build your datasets from synthetic, development, and live production data");
    expect(doc).toContain("subject matter expert annotations");
    expect(doc).toContain("Build accurate evals");
    expect(doc).toContain("auto-tunes metrics from live feedback");
    expect(doc).toContain("Go from evals to guardrails");
    expect(doc).toContain("RAG Evals");
    expect(doc).toContain("Agent Evals");
    expect(doc).toContain("Safety Evals");
    expect(doc).toContain("Security Evals");
    expect(doc).toContain("Custom Evals");
    expect(doc).toContain("Millions of signals");
    expect(doc).toContain("models");
    expect(doc).toContain("prompts");
    expect(doc).toContain("functions");
    expect(doc).toContain("context");
    expect(doc).toContain("datasets");
    expect(doc).toContain("traces");
    expect(doc).toContain("MCP server");
    expect(doc).toContain("Turn complexity into confidence");
    expect(doc).toContain("unit testing and CI/CD rigor");
    expect(doc).toContain("eval-to-guardrail lifecycle");
    expect(doc).toContain("Create guardrail policies");
    expect(doc).toContain("SaaS");
    expect(doc).toContain("Virtual Private Cloud");
    expect(doc).toContain("On-Premises");
    expect(doc).toContain("What Is Galileo?");
    expect(doc).toContain("leading observability, evaluation, and production guardrail platform");
    expect(doc).toContain("Log Your First Trace");
    expect(doc).toContain("Evaluate Your Traces");
    expect(doc).toContain("Run an Experiment");
    expect(doc).toContain("Galileo MCP Server");
    expect(doc).toContain("Evaluation Metrics");
    expect(doc).toContain("Experiment Metrics");
    expect(doc).toContain("Datasets");
    expect(doc).toContain("Run Experiments in Unit Tests");
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

  it("accepts Galileo context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0946-galileo-reviewed-agent",
      corpusId: "gap-0946-amc-owned-galileo-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0946-baseline",
      candidateRunId: "gap-0946-candidate",
      sourceRefs: [URL, CANONICAL, DOCS],
      now: new Date("2026-06-22T23:46:00.000Z"),
      rows: [
        {
          rowId: "gap-0946-owned-eval-to-guardrail-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned eval-to-guardrail replay fixture with no copied Galileo datasets, traces, prompts, metrics, annotations, guardrails, examples, docs prose, or UI assets",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 946,
            metadata: { sourceReview: "GAP-0946", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.5,
            evidenceRefs: ["ev-gap0946-baseline"],
            signedEvidenceRefs: ["ledger-gap0946-baseline", "ledger-gap0946-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0946-candidate"],
            signedEvidenceRefs: ["ledger-gap0946-candidate", "ledger-gap0946-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([URL, CANONICAL, DOCS]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.28);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Galileo metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0946-metadata-only-agent",
      corpusId: "gap-0946-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0946-baseline",
      candidateRunId: "gap-0946-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:46:00.000Z"),
      rows: [
        {
          rowId: "gap-0946-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Galileo evals, guardrails, datasets, annotations, traces, MCP server, unit tests, CI/CD, Luna, and production monitoring metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [CANONICAL],
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

  it("does not add Galileo identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain(CANONICAL);
      expect(source).not.toContain("galileo_replay_corpus");
    }
  });
});
