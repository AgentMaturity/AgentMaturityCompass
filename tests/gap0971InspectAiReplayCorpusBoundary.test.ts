import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0971-inspect-ai-replay-corpus.md";
const HOME = "https://inspect.aisi.org.uk/";
const GITHUB = "https://github.com/UKGovernmentBEIS/inspect_ai";
const EVAL_SETS = "https://inspect.aisi.org.uk/eval-sets.html";
const LOG_VIEWER = "https://inspect.aisi.org.uk/log-viewer.html";
const LOG_FILES = "https://inspect.aisi.org.uk/eval-logs.html";
const EVALS = "https://inspect.aisi.org.uk/evals/index.html";
const TITLE = "Inspect AI";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0971 Inspect AI replay-corpus boundary", () => {
  it("documents live Inspect AI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0971");
    expect(doc).toContain(HOME);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(EVAL_SETS);
    expect(doc).toContain(LOG_VIEWER);
    expect(doc).toContain(LOG_FILES);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Inspect docs");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("open-source framework for large language model evaluations");
    expect(doc).toContain("UK AI Security Institute");
    expect(doc).toContain("Meridian Labs");
    expect(doc).toContain("over 200 pre-built evaluations");
    expect(doc).toContain("datasets, agents, tools, and scorers");
    expect(doc).toContain("agent evaluations");
    expect(doc).toContain("multi-agent primitives");
    expect(doc).toContain("external agents like Claude Code, Codex CLI, and Gemini CLI");
    expect(doc).toContain("Docker, Kubernetes, Modal, Proxmox");
    expect(doc).toContain("Task");
    expect(doc).toContain("Dataset");
    expect(doc).toContain("Solver");
    expect(doc).toContain("Scorer");
    expect(doc).toContain("inspect eval");
    expect(doc).toContain("Inspect View");
    expect(doc).toContain("eval-set");
    expect(doc).toContain("dedicated log directory");
    expect(doc).toContain("re-run");
    expect(doc).toContain("Sample Preservation");
    expect(doc).toContain("stable unique identifiers");
    expect(doc).toContain("Log File API");
    expect(doc).toContain("Log Dataframes");
    expect(doc).toContain("Inspect Scout");
    expect(doc).toContain("Sample Details");
    expect(doc).toContain("Scores and Answers");
    expect(doc).toContain("2.2k stars");
    expect(doc).toContain("567 forks");
    expect(doc).toContain("133 issues");
    expect(doc).toContain("97 pull requests");
    expect(doc).toContain("6,199 commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Python 99.9%");
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

  it("accepts Inspect AI context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0971-inspect-ai-reviewed-agent",
      corpusId: "gap-0971-amc-owned-inspect-ai-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0971-baseline",
      candidateRunId: "gap-0971-candidate",
      sourceRefs: [HOME, GITHUB, EVAL_SETS, LOG_VIEWER, LOG_FILES, EVALS],
      now: new Date("2026-06-22T05:30:00.000Z"),
      rows: [
        {
          rowId: "gap-0971-owned-inspect-ai-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for Inspect-style task, dataset, solver, scorer, eval-set, log, and sample-preservation context with no copied Inspect docs, code, evals, task definitions, samples, logs, transcripts, or configs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 971,
            metadata: { sourceReview: "GAP-0971", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.52,
            evidenceRefs: ["ev-gap0971-baseline"],
            signedEvidenceRefs: ["ledger-gap0971-baseline", "ledger-gap0971-baseline-ci"],
          },
          candidate: {
            score0to1: 0.88,
            evidenceRefs: ["ev-gap0971-candidate"],
            signedEvidenceRefs: ["ledger-gap0971-candidate", "ledger-gap0971-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([HOME, GITHUB, EVAL_SETS, LOG_VIEWER, LOG_FILES, EVALS]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.36);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Inspect AI metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0971-metadata-only-agent",
      corpusId: "gap-0971-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0971-baseline",
      candidateRunId: "gap-0971-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T05:30:00.000Z"),
      rows: [
        {
          rowId: "gap-0971-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Inspect AI homepage, docs, eval-set, log viewer, over 200 eval labels, task/dataset/solver/scorer labels, sample preservation labels, and GitHub metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [HOME],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [EVAL_SETS],
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

  it("does not add Inspect AI identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain("inspect_ai_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
