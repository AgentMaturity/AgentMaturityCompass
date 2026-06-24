import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0989-rheumatology-diagnostic-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7119716229";
const OPENALEX_API = "https://api.openalex.org/works/W7119716229";
const DOI = "https://doi.org/10.1007/s00296-025-06068-y";
const SPRINGER_ARTICLE = "https://link.springer.com/article/10.1007/s00296-025-06068-y";
const SPRINGER_PDF = "https://link.springer.com/content/pdf/10.1007/s00296-025-06068-y.pdf";
const CROSSREF = "https://api.crossref.org/works/10.1007/s00296-025-06068-y";
const TITLE =
  "Diagnostic performance of Prof. Valmed, ChatGPT-5 Thinking, and OpenEvidence in rheumatology: A comparative evaluation";
const IDENTIFIER = "rheumatology_diagnostic_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0989 rheumatology diagnostic replay-corpus boundary", () => {
  it("documents live rheumatology diagnostic-evaluation metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0989");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SPRINGER_ARTICLE);
    expect(doc).toContain(SPRINGER_PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Rheumatology International");
    expect(doc).toContain("publication_date `2026-01-10`");
    expect(doc).toContain("published-online `2026-01-10`");
    expect(doc).toContain("Springer Science and Business Media LLC");
    expect(doc).toContain("Phillip Kremer");
    expect(doc).toContain("Emily Langballe");
    expect(doc).toContain("Johannes Knitza");
    expect(doc).toContain("Medical diagnosis");
    expect(doc).toContain("McNemar's test");
    expect(doc).toContain("Diagnostic accuracy");
    expect(doc).toContain("Benchmarking");
    expect(doc).toContain("open_access status `hybrid`");
    expect(doc).toContain("referenced_works_count `28`");
    expect(doc).toContain("reference-count `33`");
    expect(doc).toContain("CC BY");
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

  it("accepts rheumatology diagnostic context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0989-rheumatology-diagnostic-reviewed-agent",
      corpusId: "gap-0989-amc-owned-rheumatology-diagnostic-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0989-baseline",
      candidateRunId: "gap-0989-candidate",
      sourceRefs: [OPENALEX, DOI, SPRINGER_ARTICLE],
      now: new Date("2026-06-24T12:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0989-owned-rheumatology-diagnostic-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for diagnostic-evaluation evidence with medical-domain labels and no copied patient cases, article prompts, diagnostic rows, answer keys, model outputs, tables, figures, benchmark data, or implementation details",
            inputHash: hash("j"),
            expectedHash: hash("k"),
            fixtureHash: hash("l"),
            seed: 989,
            metadata: {
              sourceReview: "GAP-0989",
              domainContext: "rheumatology-diagnostic-evaluation",
              medicalDecisionSupportClaim: false,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.52,
            evidenceRefs: ["ev-gap0989-baseline"],
            signedEvidenceRefs: ["ledger-gap0989-baseline", "ledger-gap0989-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap0989-candidate"],
            signedEvidenceRefs: ["ledger-gap0989-candidate", "ledger-gap0989-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([OPENALEX, DOI, SPRINGER_ARTICLE]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.29);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when rheumatology paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0989-metadata-only-agent",
      corpusId: "gap-0989-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0989-baseline",
      candidateRunId: "gap-0989-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T12:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0989-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Rheumatology diagnostic-performance title, DOI, OpenAlex metadata, Crossref metadata, Springer labels, medical-diagnosis concepts, McNemar test labels, diagnostic-accuracy labels, model-name labels, and local backlog metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: [OPENALEX, CROSSREF],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: [DOI, SPRINGER_ARTICLE],
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

  it("does not add rheumatology diagnostic identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.1007/s00296-025-06068-y");
      expect(source).not.toContain("W7119716229");
      expect(source).not.toContain("Rheumatology International");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
