import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0999-vellum-replay-corpus.md";
const HOME = "https://www.vellum.ai";
const DOCS_OVERVIEW = "https://docs.vellum.ai/home/getting-started/overview";
const MODEL_PROFILES = "https://www.vellum.ai/docs/key-concepts/model-profiles";
const REPO = "https://github.com/vellum-ai/vellum-assistant";
const API = "https://api.github.com/repos/vellum-ai/vellum-assistant";
const README = "https://raw.githubusercontent.com/vellum-ai/vellum-assistant/main/README.md";
const EVALS_README = "https://raw.githubusercontent.com/vellum-ai/vellum-assistant/main/evals/README.md";
const LICENSE_API = "https://api.github.com/repos/vellum-ai/vellum-assistant/license";
const HEAD = "62a63081ba267deaf9adcd226b7cb4bd6f2d702d";
const RELEASE = "v0.10.1";
const IDENTIFIER = "vellum_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0999 Vellum replay-corpus boundary", () => {
  it("documents live Vellum metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0999");
    expect(doc).toContain(HOME);
    expect(doc).toContain(DOCS_OVERVIEW);
    expect(doc).toContain(MODEL_PROFILES);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(EVALS_README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("Personal Intelligence");
    expect(doc).toContain("Vellum Personal-Intelligence Benchmark");
    expect(doc).toContain("evals/benchmarks");
    expect(doc).toContain("compaction-thrash");
    expect(doc).toContain("longmemeval-v2");
    expect(doc).toContain("personal-intelligence");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("754 stars");
    expect(doc).toContain("114 forks");
    expect(doc).toContain("117 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-24T13:41:24Z`");
    expect(doc).toContain("release `v0.10.1` published `2026-06-24T01:04:54Z`");
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

  it("accepts Vellum eval context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0999-vellum-reviewed-agent",
      corpusId: "gap-0999-amc-owned-vellum-style-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0999-baseline",
      candidateRunId: "gap-0999-candidate",
      sourceRefs: [HOME, DOCS_OVERVIEW, REPO, EVALS_README],
      now: new Date("2026-06-24T13:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0999-owned-vellum-style-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for personal-intelligence assistant evaluation with no copied Vellum benchmark units, metrics, transcripts, run artifacts, report rows, prompts, workflows, code, docs prose, or implementation details",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 999,
            metadata: {
              sourceReview: "GAP-0999",
              competitorContext: "vellum-personal-intelligence-evals",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0999-baseline"],
            signedEvidenceRefs: ["ledger-gap0999-baseline", "ledger-gap0999-baseline-ci"],
          },
          candidate: {
            score0to1: 0.78,
            evidenceRefs: ["ev-gap0999-candidate"],
            signedEvidenceRefs: ["ledger-gap0999-candidate", "ledger-gap0999-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([HOME, DOCS_OVERVIEW, REPO, EVALS_README]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.2);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Vellum metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0999-vellum-metadata-only-agent",
      corpusId: "gap-0999-vellum-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0999-baseline",
      candidateRunId: "gap-0999-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T13:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0999-vellum-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Vellum Personal Intelligence title, docs overview, model-profile docs, repository metadata, evals README, eval benchmark directory names, release label, and local backlog metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.74,
            evidenceRefs: [HOME, REPO],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: [DOCS_OVERVIEW, EVALS_README],
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

  it("does not add Vellum identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("vellum-ai/vellum-assistant");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("Vellum Personal-Intelligence Benchmark");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
