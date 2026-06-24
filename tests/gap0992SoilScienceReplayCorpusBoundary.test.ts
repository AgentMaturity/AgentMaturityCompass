import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0992-soil-science-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7161986360";
const OPENALEX_API = "https://api.openalex.org/works/W7161986360";
const DOI = "https://doi.org/10.3389/fsci.2026.1721295";
const FRONTIERS_ARTICLE = "https://www.frontiersin.org/journals/science/articles/10.3389/fsci.2026.1721295/full";
const FRONTIERS_PDF = "https://www.frontiersin.org/journals/science/articles/10.3389/fsci.2026.1721295/pdf";
const CROSSREF = "https://api.crossref.org/works/10.3389/fsci.2026.1721295";
const TITLE = "Enhancing soil science research with multi-agent artificial intelligence systems";
const IDENTIFIER = "soil_science_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0992 soil science replay-corpus boundary", () => {
  it("documents live soil-science source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0992");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(FRONTIERS_ARTICLE);
    expect(doc).toContain(FRONTIERS_PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Frontiers in Science");
    expect(doc).toContain("publication_date `2026-05-21`");
    expect(doc).toContain("published-online `2026-05-21`");
    expect(doc).toContain("Frontiers Media SA");
    expect(doc).toContain("Budiman Minasny");
    expect(doc).toContain("Alex McBratney");
    expect(doc).toContain("Pete Smith");
    expect(doc).toContain("Soil Geostatistics and Mapping");
    expect(doc).toContain("Scientific Computing and Data Management");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("open_access status `diamond`");
    expect(doc).toContain("referenced_works_count `72`");
    expect(doc).toContain("reference-count `74`");
    expect(doc).toContain("CC BY");
    expect(doc).toContain("PDF endpoint returned `application/pdf`");
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

  it("accepts soil-science multi-agent context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0992-soil-science-reviewed-agent",
      corpusId: "gap-0992-amc-owned-soil-science-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0992-baseline",
      candidateRunId: "gap-0992-candidate",
      sourceRefs: [OPENALEX, DOI, FRONTIERS_ARTICLE],
      now: new Date("2026-06-24T13:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0992-owned-soil-science-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for scientific multi-agent research evaluation context with no copied soil-science article text, datasets, hypotheses, review outputs, prompts, tables, figures, PDF content, or implementation details",
            inputHash: hash("m"),
            expectedHash: hash("n"),
            fixtureHash: hash("o"),
            seed: 992,
            metadata: {
              sourceReview: "GAP-0992",
              domainContext: "soil-science-multi-agent-research",
              scientificDiscoveryClaim: false,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.5,
            evidenceRefs: ["ev-gap0992-baseline"],
            signedEvidenceRefs: ["ledger-gap0992-baseline", "ledger-gap0992-baseline-ci"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["ev-gap0992-candidate"],
            signedEvidenceRefs: ["ledger-gap0992-candidate", "ledger-gap0992-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([OPENALEX, DOI, FRONTIERS_ARTICLE]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.29);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when soil-science paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0992-metadata-only-agent",
      corpusId: "gap-0992-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0992-baseline",
      candidateRunId: "gap-0992-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T13:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0992-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Soil-science title, DOI, OpenAlex metadata, Crossref metadata, Frontiers article labels, PDF endpoint labels, multi-agent research labels, hypothesis-generation labels, expert-review labels, source concepts, and local backlog metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.66,
            evidenceRefs: [OPENALEX, CROSSREF],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.66,
            evidenceRefs: [DOI, FRONTIERS_ARTICLE],
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

  it("does not add soil-science replay identifiers to generic replay corpus modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.3389/fsci.2026.1721295");
      expect(source).not.toContain("W7161986360");
      expect(source).not.toContain("Frontiers in Science");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
