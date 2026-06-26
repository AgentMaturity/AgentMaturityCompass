import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0733-openllmetry-js-replay-corpus.md";
const SOURCE = "https://github.com/traceloop/openllmetry-js";
const REPO = "traceloop/openllmetry-js";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0733 OpenLLMetry-JS replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0733");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("OpenLLMetry");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("0.27.0");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Bedrock");
    expect(doc).toContain("Vertex AI");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("Pinecone");
    expect(doc).toContain("Datadog");
    expect(doc).toContain("Honeycomb");
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

  it("accepts OpenLLMetry-JS context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0733-openllmetry-js-context-agent",
      corpusId: "gap-0733-amc-owned-trace-backed-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0733-baseline",
      candidateRunId: "gap-0733-candidate",
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T20:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0733-owned-observability-trace-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned trace-backed replay fixture with no copied OpenLLMetry-JS code, configs, or traces",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 733,
            metadata: { sourceReview: "GAP-0733", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.67,
            evidenceRefs: ["ev-gap0733-baseline"],
            signedEvidenceRefs: ["ledger-gap0733-baseline", "ledger-gap0733-baseline-ci"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["ev-gap0733-candidate"],
            signedEvidenceRefs: ["ledger-gap0733-candidate", "ledger-gap0733-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([SOURCE]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when GitHub metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0733-metadata-only-agent",
      corpusId: "gap-0733-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0733-baseline",
      candidateRunId: "gap-0733-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T20:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0733-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "OpenLLMetry-JS repository labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.78,
            evidenceRefs: [SOURCE],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: [SOURCE],
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

  it("does not add OpenLLMetry-JS identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("OpenLLMetry-JS");
      expect(source).not.toContain("openllmetry_js_replay_corpus");
      expect(source).not.toContain("traceloop/openllmetry-js");
    }
  });
});
