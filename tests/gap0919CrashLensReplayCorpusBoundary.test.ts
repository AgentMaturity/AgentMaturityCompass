import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0919-crashlens-replay-corpus.md";
const REPO = "Crashlens/crashlens";
const URL = "https://github.com/Crashlens/crashlens";
const TITLE = "CrashLens: AI Token Waste Detective";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0919 CrashLens replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0919");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 8");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("328 Commits");
    expect(doc).toContain(".crashlens");
    expect(doc).toContain("bench");
    expect(doc).toContain("dashboards");
    expect(doc).toContain("sample-logs");
    expect(doc).toContain("policies");
    expect(doc).toContain("policy-violations");
    expect(doc).toContain("PROMETHEUS_INTEGRATION.md");
    expect(doc).toContain("crashlens-report.json");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("Production LLM observability CLI");
    expect(doc).toContain("token waste");
    expect(doc).toContain("retry loops");
    expect(doc).toContain("model overkill");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("Prometheus metrics");
    expect(doc).toContain("Grafana Dashboard");
    expect(doc).toContain("PyPI shipped");
    expect(doc).toContain("40-60% potential savings");
    expect(doc).toContain("Privacy First");
    expect(doc).toContain("CI/CD Integration");
    expect(doc).toContain("PII Removal");
    expect(doc).toContain("Schema Contract Validation");
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

  it("accepts CrashLens context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0919-crashlens-reviewed-agent",
      corpusId: "gap-0919-amc-owned-crashlens-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0919-baseline",
      candidateRunId: "gap-0919-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-22T22:19:00.000Z"),
      rows: [
        {
          rowId: "gap-0919-owned-token-waste-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned token-waste replay fixture with no copied CrashLens logs, policies, reports, dashboards, Prometheus metrics, Grafana panels, PII data, or CLI output",
            inputHash: hash("l"),
            expectedHash: hash("m"),
            fixtureHash: hash("n"),
            seed: 919,
            metadata: { sourceReview: "GAP-0919", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.49,
            evidenceRefs: ["ev-gap0919-baseline"],
            signedEvidenceRefs: ["ledger-gap0919-baseline", "ledger-gap0919-baseline-ci"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["ev-gap0919-candidate"],
            signedEvidenceRefs: ["ledger-gap0919-candidate", "ledger-gap0919-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.27);
  });

  it("fails closed when CrashLens metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0919-metadata-only-agent",
      corpusId: "gap-0919-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0919-baseline",
      candidateRunId: "gap-0919-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T22:19:00.000Z"),
      rows: [
        {
          rowId: "gap-0919-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "CrashLens, OpenAI, Anthropic, Gemini, Prometheus, Grafana, token waste, retry loops, model overkill, policies, PII removal, and schema validation metadata without an AMC-owned replay fixture",
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
  });

  it("does not add CrashLens identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("crashlens_replay_corpus");
    }
  });
});
