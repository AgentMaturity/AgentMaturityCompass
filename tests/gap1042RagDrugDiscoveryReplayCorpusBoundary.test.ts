import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1042-rag-drug-discovery-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7137823239";
const OPENALEX_API = "https://api.openalex.org/works/W7137823239";
const DOI = "https://doi.org/10.1609/aaai.v40i1.37020";
const DOI_VALUE = "10.1609/aaai.v40i1.37020";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i1.37020";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/37020";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/37020/40982";
const TITLE = "RAG-Enhanced Collaborative LLM Agents for Drug Discovery";
const IDENTIFIER = "rag_drug_discovery_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1042 RAG drug discovery replay-corpus boundary", () => {
  it("documents live drug discovery paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1042");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("publisher `Association for the Advancement of Artificial Intelligence (AAAI)`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("page `561-569`");
    expect(doc).toContain("firstpage `561`");
    expect(doc).toContain("lastpage `569`");
    expect(doc).toContain("oa_status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Namkyeong Lee");
    expect(doc).toContain("Edward De Brouwer");
    expect(doc).toContain("Ehsan Hajiramezanali");
    expect(doc).toContain("Tommaso Biancalani");
    expect(doc).toContain("Chanyoung Park");
    expect(doc).toContain("Gabriele Scalia");
    expect(doc).toContain("Korea Advanced Institute of Science and Technology");
    expect(doc).toContain("Drug discovery");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Data science");
    expect(doc).toContain("Data discovery");
    expect(doc).toContain("Precision medicine");
    expect(doc).toContain("Risk analysis");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("AAAI article returned HTTP/2 200");
    expect(doc).toContain("PDF endpoint returned HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
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

  it("accepts drug discovery context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1042-rag-drug-discovery-reviewed-agent",
      corpusId: "gap-1042-amc-owned-rag-drug-discovery-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1042-baseline",
      candidateRunId: "gap-1042-candidate",
      sourceRefs: [DOI, OPENALEX, OPENALEX_API, CROSSREF, AAAI, PDF],
      now: new Date("2026-06-25T02:05:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1042-owned-rag-drug-discovery-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned drug discovery replay fixture with no copied AAAI paper text, biomedical datasets, compound records, molecule workflows, RAG prompts, collaborative-agent traces, figures, tables, or benchmark outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 1042,
            metadata: { sourceReview: "GAP-1042", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.52,
            evidenceRefs: ["ev-gap1042-baseline"],
            signedEvidenceRefs: ["ledger-gap1042-baseline", "ledger-gap1042-baseline-ci"],
          },
          candidate: {
            score0to1: 0.83,
            evidenceRefs: ["ev-gap1042-candidate"],
            signedEvidenceRefs: ["ledger-gap1042-candidate", "ledger-gap1042-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, OPENALEX, OPENALEX_API, CROSSREF, AAAI, PDF]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.31);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when drug discovery metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1042-metadata-only-agent",
      corpusId: "gap-1042-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1042-baseline",
      candidateRunId: "gap-1042-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T02:05:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1042-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "RAG-enhanced collaborative LLM agents, drug discovery title, DOI, OpenAlex, Crossref, AAAI page, PDF URL, biomedical, workflow, and precision medicine metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [DOI],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [OPENALEX],
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

  it("does not add drug discovery identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("RAG-Enhanced Collaborative LLM Agents");
    }
  });
});
