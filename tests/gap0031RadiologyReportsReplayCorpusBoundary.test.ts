import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0031-radiology-reports-replay-corpus.md";
const DOI = "https://doi.org/10.1016/j.landig.2025.100960";
const OPENALEX = "https://openalex.org/W7128949215";
const OPENALEX_API = "https://api.openalex.org/works/W7128949215";
const LANCET = "https://www.thelancet.com/journals/landig/article/PIIS2589-7500(25)00142-6/fulltext";
const PUBMED = "https://pubmed.ncbi.nlm.nih.gov/41698858/";
const PMC = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12992207/";
const TITLE =
  "Large language models for simplifying radiology reports: a systematic review and meta-analysis of patient, public, and clinician evaluations";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0031 radiology reports replay-corpus boundary", () => {
  it("documents live radiology report metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0031");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(LANCET);
    expect(doc).toContain(PUBMED);
    expect(doc).toContain(PMC);
    expect(doc).toContain("The Lancet Digital Health");
    expect(doc).toContain("PubMed ID `41698858`");
    expect(doc).toContain("PMCID `PMC12992207`");
    expect(doc).toContain("Publication date: 2026-02-01");
    expect(doc).toContain("E-publication date: 2026 Feb 16");
    expect(doc).toContain("Systematic Review");
    expect(doc).toContain("Meta-Analysis");
    expect(doc).toContain("CENTRAL");
    expect(doc).toContain("MEDLINE");
    expect(doc).toContain("Embase");
    expect(doc).toContain("Nov 11, 2025");
    expect(doc).toContain("38 studies");
    expect(doc).toContain("12,922 simplified reports");
    expect(doc).toContain("508 evaluators");
    expect(doc).toContain("clinically significant errors");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("signed evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts radiology simplification context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0031-radiology-reviewed-agent",
      corpusId: "gap-0031-amc-owned-radiology-report-replay-corpus",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0031-baseline",
      candidateRunId: "gap-0031-candidate",
      sourceRefs: [DOI, OPENALEX, PUBMED, PMC],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0031-owned-radiology-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for radiology report simplification safety context with no copied reports, cases, prompts, examples, tables, or clinical outputs",
            inputHash: hash("radiology-input"),
            expectedHash: hash("radiology-expected"),
            fixtureHash: hash("radiology-fixture"),
            seed: 31,
            metadata: {
              sourceReview: "GAP-0031",
              paperContext: "radiology-report-simplification",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0031-baseline"],
            signedEvidenceRefs: ["ledger-gap0031-baseline", "ledger-gap0031-baseline-ci"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["ev-gap0031-candidate"],
            signedEvidenceRefs: ["ledger-gap0031-candidate", "ledger-gap0031-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, OPENALEX, PUBMED, PMC]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.ciReceiptPresent).toBe(true);
    expect(receipt.scoreDeltaPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.23);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when radiology article metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0031-radiology-metadata-only-agent",
      corpusId: "gap-0031-radiology-metadata-only",
      corpusVersion: "2026.06.26",
      baselineRunId: "gap-0031-baseline",
      candidateRunId: "gap-0031-candidate",
      sourceRefs: [],
      now: new Date("2026-06-26T00:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0031-radiology-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Radiology title, DOI, Lancet page, PubMed ID, PMCID, OpenAlex metadata, systematic-review labels, meta-analysis labels, readability labels, patient/public/clinician labels, and clinical-error labels without AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: [DOI, PUBMED],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.71,
            evidenceRefs: [OPENALEX, PMC],
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

  it("does not add radiology paper identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7128949215");
      expect(source).not.toContain("landig.2025.100960");
      expect(source).not.toContain(TITLE);
    }
  });
});
