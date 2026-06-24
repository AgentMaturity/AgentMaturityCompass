import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0987-epanet-agentic-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7125229955";
const OPENALEX_API = "https://api.openalex.org/works/W7125229955";
const DOI = "https://doi.org/10.1016/j.watres.2026.125433";
const DOI_REDIRECT = "https://linkinghub.elsevier.com/retrieve/pii/S0043135426001156";
const PUBMED = "https://pubmed.ncbi.nlm.nih.gov/41579609/";
const PUBMED_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=41579609&retmode=json";
const PUBMED_EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41579609&retmode=xml";
const CROSSREF = "https://api.crossref.org/works/10.1016/j.watres.2026.125433";
const TITLE = "EPANET-Agentic: A multi-agent system for natural language-controlled simulations of water distribution networks";
const IDENTIFIER = "epanet_agentic_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0987 EPANET-Agentic replay-corpus boundary", () => {
  it("documents live EPANET-Agentic metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0987");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_REDIRECT);
    expect(doc).toContain(PUBMED);
    expect(doc).toContain(PUBMED_ESUMMARY);
    expect(doc).toContain(PUBMED_EFETCH);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Water Research");
    expect(doc).toContain("publication_date `2026-01-21`");
    expect(doc).toContain("epubdate `2026 Jan 20`");
    expect(doc).toContain("pubdate `2026 Apr 1`");
    expect(doc).toContain("Volume `293`");
    expect(doc).toContain("StartPage `125433`");
    expect(doc).toContain("S0043-1354(26)00115-6");
    expect(doc).toContain("Jian Wang");
    expect(doc).toContain("Guangtao Fu");
    expect(doc).toContain("Dragan Savic");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Scalability");
    expect(doc).toContain("Benchmark");
    expect(doc).toContain("L-Town");
    expect(doc).toContain("C-Town");
    expect(doc).toContain("Net3");
    expect(doc).toContain("System Characteristics");
    expect(doc).toContain("System Dynamics");
    expect(doc).toContain("System Operation");
    expect(doc).toContain("Scenario Simulation");
    expect(doc).toContain("TaskExecutor");
    expect(doc).toContain("CodeRunner");
    expect(doc).toContain("DataAnalyzer");
    expect(doc).toContain("human-in-the-loop");
    expect(doc).toContain("100% success rate");
    expect(doc).toContain("tool invocation accuracy");
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

  it("accepts EPANET-Agentic context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0987-epanet-agentic-reviewed-agent",
      corpusId: "gap-0987-amc-owned-epanet-agentic-replay-corpus",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0987-baseline",
      candidateRunId: "gap-0987-candidate",
      sourceRefs: [OPENALEX, DOI, PUBMED],
      now: new Date("2026-06-24T12:10:00.000Z"),
      rows: [
        {
          rowId: "gap-0987-owned-epanet-agentic-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned replay fixture for water-network simulation-agent evidence with benchmark-network labels, task-category labels, tool-invocation evidence, human oversight, and no copied EPANET-Agentic article text, benchmark rows, prompts, code, simulator files, outputs, figures, or implementation details",
            inputHash: hash("g"),
            expectedHash: hash("h"),
            fixtureHash: hash("i"),
            seed: 987,
            metadata: { sourceReview: "GAP-0987", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.47,
            evidenceRefs: ["ev-gap0987-baseline"],
            signedEvidenceRefs: ["ledger-gap0987-baseline", "ledger-gap0987-baseline-ci"],
          },
          candidate: {
            score0to1: 0.85,
            evidenceRefs: ["ev-gap0987-candidate"],
            signedEvidenceRefs: ["ledger-gap0987-candidate", "ledger-gap0987-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([OPENALEX, DOI, PUBMED]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.38);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when EPANET-Agentic metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0987-metadata-only-agent",
      corpusId: "gap-0987-metadata-only",
      corpusVersion: "2026.06.24",
      baselineRunId: "gap-0987-baseline",
      candidateRunId: "gap-0987-candidate",
      sourceRefs: [],
      now: new Date("2026-06-24T12:10:00.000Z"),
      rows: [
        {
          rowId: "gap-0987-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "EPANET-Agentic title, DOI, PubMed metadata, Water Research metadata, benchmark network labels, task category labels, tool invocation labels, success-rate labels, human-in-the-loop labels, and local backlog metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: [OPENALEX],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: [DOI],
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

  it("does not add EPANET-Agentic identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("EPANET-Agentic");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
