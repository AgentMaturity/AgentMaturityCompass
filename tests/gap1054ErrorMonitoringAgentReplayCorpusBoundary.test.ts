import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1054-error-monitoring-agent-replay-corpus.md";
const REPO_NAME = "airweave-ai/error-monitoring-agent";
const REPO = "https://github.com/airweave-ai/error-monitoring-agent";
const API = "https://api.github.com/repos/airweave-ai/error-monitoring-agent";
const README_API = "https://api.github.com/repos/airweave-ai/error-monitoring-agent/readme";
const README = "https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/README.md";
const CONFIGURATION = "https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/CONFIGURATION.md";
const ARCHITECTURE = "https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/docs/ARCHITECTURE.md";
const ENV_EXAMPLE = "https://raw.githubusercontent.com/airweave-ai/error-monitoring-agent/main/.env.example";
const HEAD = "ec358d1148f9a4e5a46988afaff13fa078d3f726";
const IDENTIFIER = "error-monitoring-agent-replay-corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1054 error-monitoring-agent replay-corpus boundary", () => {
  it("documents live error-monitoring-agent repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1054");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONFIGURATION);
    expect(doc).toContain(ARCHITECTURE);
    expect(doc).toContain(ENV_EXAMPLE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("Intelligent error monitoring agent");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `366`");
    expect(doc).toContain("Forks `51`");
    expect(doc).toContain("Watchers API total `3`");
    expect(doc).toContain("watchers_count `366`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("main branch protected `false`");
    expect(doc).toContain("commit date `2026-01-29T12:38:23Z`");
    expect(doc).toContain("verification reason `unsigned`");
    expect(doc).toContain("README sha `3437cc3a4838850314f263346cf9885daedaf320`");
    expect(doc).toContain(".env.example sha `4e3fe4e198f50aebf44c5122710cc61d7f477c8b`");
    expect(doc).toContain("CONFIGURATION.md sha `5af93b542c239dfd5fa8867cf8cb2612d54081d8`");
    expect(doc).toContain("ARCHITECTURE.md sha `d8d133f42dfb599f587afb3daa1f84ba49313a6b`");
    expect(doc).toContain("licenseInfo `null`");
    expect(doc).toContain("README states `MIT License`");
    expect(doc).toContain("no GitHub releases");
    expect(doc).toContain("no Git tags");
    expect(doc).toContain("Python, TypeScript, CSS, JavaScript, and HTML");
    expect(doc).toContain("GitHub repo returned HTTP/2 200");
    expect(doc).toContain("raw README returned HTTP/2 200");
    expect(doc).toContain("content-length: 10618");
    expect(doc).toContain("CONFIGURATION.md returned HTTP/2 200");
    expect(doc).toContain("content-length: 6479");
    expect(doc).toContain("ARCHITECTURE.md returned HTTP/2 200");
    expect(doc).toContain("content-length: 7881");
    expect(doc).toContain("sample data");
    expect(doc).toContain("semantic clustering");
    expect(doc).toContain("context search");
    expect(doc).toContain("severity analysis");
    expect(doc).toContain("Linear and Slack preview");
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

  it("accepts error-monitoring-agent context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1054-error-monitoring-reviewed-agent",
      corpusId: "gap-1054-amc-owned-error-monitoring-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1054-baseline",
      candidateRunId: "gap-1054-candidate",
      sourceRefs: [REPO, API, README, CONFIGURATION, ARCHITECTURE, ENV_EXAMPLE],
      now: new Date("2026-06-25T04:10:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1054-owned-error-monitoring-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned error-monitoring replay fixture with no copied Airweave repository code, sample errors, mock search results, Slack threads, Linear tickets, configs, prompts, UI assets, pipeline traces, or alert payloads",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 1054,
            metadata: { sourceReview: "GAP-1054", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.54,
            evidenceRefs: ["ev-gap1054-baseline"],
            signedEvidenceRefs: ["ledger-gap1054-baseline", "ledger-gap1054-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap1054-candidate"],
            signedEvidenceRefs: ["ledger-gap1054-candidate", "ledger-gap1054-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([REPO, API, README, CONFIGURATION, ARCHITECTURE, ENV_EXAMPLE]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.27);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when error-monitoring-agent metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1054-metadata-only-agent",
      corpusId: "gap-1054-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1054-baseline",
      candidateRunId: "gap-1054-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T04:10:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1054-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "error-monitoring-agent GitHub metadata, Airweave labels, semantic clustering labels, sample data labels, Linear labels, Slack labels, README snippets, docs/config links, and release absence without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [REPO, API],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [README, CONFIGURATION, ARCHITECTURE],
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

  it("does not add error-monitoring-agent identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain("error-monitoring-agent");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
