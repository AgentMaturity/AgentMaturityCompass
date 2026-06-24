import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1003-single-cell-omics-replay-corpus.md";
const OPENALEX = "https://openalex.org/W4414991266";
const OPENALEX_API = "https://api.openalex.org/works/W4414991266";
const DOI = "https://doi.org/10.1186/s13059-026-03998-z";
const CROSSREF = "https://api.crossref.org/works/10.1186/s13059-026-03998-z";
const SPRINGER = "https://link.springer.com/article/10.1186/s13059-026-03998-z";
const REPO = "https://github.com/lyyang01/bioagent-benchmark";
const API = "https://api.github.com/repos/lyyang01/bioagent-benchmark";
const README = "https://raw.githubusercontent.com/lyyang01/bioagent-benchmark/main/README.md";
const ZENODO_DATA = "https://doi.org/10.5281/zenodo.17291196";
const ZENODO_SOFTWARE = "https://doi.org/10.5281/zenodo.18437898";
const ZENODO_RESULTS = "https://doi.org/10.5281/zenodo.18447519";
const HEAD = "1605e6e38bd69307e2f7b68a4367de21043c89b6";
const IDENTIFIER = "single_cell_omics_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1003 single-cell omics replay-corpus boundary", () => {
  it("documents live paper, code, and data metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1003");
    expect(doc).toContain("Benchmarking LLM-based agents for single-cell omics analysis");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(ZENODO_DATA);
    expect(doc).toContain(ZENODO_SOFTWARE);
    expect(doc).toContain(ZENODO_RESULTS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("Genome Biology");
    expect(doc).toContain("Springer Science and Business Media LLC");
    expect(doc).toContain("BioMed Central");
    expect(doc).toContain("publication_date `2026-02-25`");
    expect(doc).toContain("version of record `2026-04-09`");
    expect(doc).toContain("CC BY-NC-ND 4.0");
    expect(doc).toContain("reference count 95");
    expect(doc).toContain("is-referenced-by count 3");
    expect(doc).toContain("OpenAlex type `preprint`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("50 diverse real-world single-cell omics analysis tasks");
    expect(doc).toContain("multidimensional metrics");
    expect(doc).toContain("cognitive program synthesis");
    expect(doc).toContain("collaboration");
    expect(doc).toContain("execution efficiency");
    expect(doc).toContain("bioinformatics knowledge integration");
    expect(doc).toContain("task completion quality");
    expect(doc).toContain("Grok3-beta");
    expect(doc).toContain("multi-agent frameworks");
    expect(doc).toContain("self-reflection");
    expect(doc).toContain("RAG");
    expect(doc).toContain("planning");
    expect(doc).toContain("code generation");
    expect(doc).toContain("long-context handling");
    expect(doc).toContain("context-aware knowledge retrieval");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("14 stars");
    expect(doc).toContain("2 forks");
    expect(doc).toContain("0 open issues");
    expect(doc).toContain("pushed_at `2026-03-18T13:54:48Z`");
    expect(doc).toContain("README.md` SHA `de52cef0f31dde081114909e7405fbbd6e4c599e`");
    expect(doc).toContain("run_workflow");
    expect(doc).toContain("run_eval");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("database");
    expect(doc).toContain("datasets_for_bioagent_benchmark.zip");
    expect(doc).toContain("24,437,249,791 bytes");
    expect(doc).toContain("md5:7176bab7d813011970da733af80dbcca");
    expect(doc).toContain("bioagent-benchmark-v1.0.zip");
    expect(doc).toContain("19,245,990 bytes");
    expect(doc).toContain("md5:501697afadcdec419b59278effd8a1a5");
    expect(doc).toContain("supplementary_json_results.zip");
    expect(doc).toContain("34,277,528 bytes");
    expect(doc).toContain("md5:2cd0c1d0228fd1fbbbf3885d43bb1456");
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

  it("accepts single-cell omics context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1003-single-cell-omics-reviewed-agent",
      corpusId: "gap-1003-amc-owned-single-cell-omics-style-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-1003-baseline",
      candidateRunId: "gap-1003-candidate",
      sourceRefs: [DOI, SPRINGER, REPO, ZENODO_DATA, ZENODO_RESULTS],
      now: new Date("2026-06-24T14:28:00.000Z"),
      rows: [
        {
          rowId: "gap-1003-owned-single-cell-omics-style-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for single-cell omics style agent evaluation with no copied paper content, code, prompts, datasets, benchmark rows, metrics, workflow outputs, figures, results, or implementation details",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 1003,
            metadata: {
              sourceReview: "GAP-1003",
              domainContext: "single-cell-omics-agent-benchmark",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.53,
            evidenceRefs: ["ev-gap1003-baseline"],
            signedEvidenceRefs: ["ledger-gap1003-baseline", "ledger-gap1003-baseline-ci"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["ev-gap1003-candidate"],
            signedEvidenceRefs: ["ledger-gap1003-candidate", "ledger-gap1003-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, SPRINGER, REPO, ZENODO_DATA, ZENODO_RESULTS]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.23);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper, repository, or Zenodo metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1003-single-cell-omics-metadata-only-agent",
      corpusId: "gap-1003-single-cell-omics-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-1003-baseline",
      candidateRunId: "gap-1003-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T14:28:00.000Z"),
      rows: [
        {
          rowId: "gap-1003-single-cell-omics-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Single-cell omics paper title, DOI, OpenAlex metadata, Crossref metadata, Springer abstract, GitHub repo metadata, Zenodo file records, and local backlog metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: [DOI, OPENALEX],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.71,
            evidenceRefs: [REPO, ZENODO_DATA],
            signedEvidenceRefs: [],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.issues).toEqual(
      expect.arrayContaining([
        "eval replay corpus must cover Score, Shield, and Watch surfaces",
        "eval replay corpus source refs missing",
        "eval replay corpus signed evidence missing",
      ]),
    );
    expect(receipt.recommendation).toContain("Fail closed");
  });

  it("does not add single-cell omics identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("lyyang01/bioagent-benchmark");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
