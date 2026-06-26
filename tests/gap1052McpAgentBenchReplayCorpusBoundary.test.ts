import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1052-mcp-agentbench-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7137847086";
const OPENALEX_API = "https://api.openalex.org/works/W7137847086";
const DOI = "https://doi.org/10.1609/aaai.v40i37.40347";
const DOI_VALUE = "10.1609/aaai.v40i37.40347";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i37.40347";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/40347";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/40347/44308";
const TITLE = "MCP-AgentBench: Evaluating Real-World Language Agent Performance with MCP-Mediated Tools";
const IDENTIFIER = "mcp_agentbench_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1052 MCP-AgentBench replay-corpus boundary", () => {
  it("documents live MCP-AgentBench paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1052");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("Association for the Advancement of Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("oa_status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("issue `37`");
    expect(doc).toContain("pages `30888-30896`");
    expect(doc).toContain("Zikang Guo");
    expect(doc).toContain("Benfeng Xu");
    expect(doc).toContain("Chiwei Zhu");
    expect(doc).toContain("Wentao Hong");
    expect(doc).toContain("Xiaorui Wang");
    expect(doc).toContain("Zhendong Mao");
    expect(doc).toContain("University of Science and Technology of China");
    expect(doc).toContain("University of Science and Technology Beijing");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Interoperability");
    expect(doc).toContain("Testbed");
    expect(doc).toContain("Benchmark (surveying)");
    expect(doc).toContain("Protocol (science)");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("AAAI article returned HTTP/2 200");
    expect(doc).toContain("PDF endpoint returned HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("26253-AAAI26.GuoZ-NLP.pdf");
    expect(doc).toContain("33 MCP servers");
    expect(doc).toContain("188 tools");
    expect(doc).toContain("600 queries");
    expect(doc).toContain("6 categories");
    expect(doc).toContain("MCP-Eval");
    expect(doc).toContain("outcome-oriented");
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

  it("accepts MCP-AgentBench context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1052-mcp-agentbench-reviewed-agent",
      corpusId: "gap-1052-amc-owned-mcp-agentbench-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1052-baseline",
      candidateRunId: "gap-1052-candidate",
      sourceRefs: [DOI, OPENALEX, OPENALEX_API, CROSSREF, AAAI, PDF],
      now: new Date("2026-06-25T03:35:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1052-owned-mcp-agentbench-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned MCP-mediated tool-use replay fixture with no copied AAAI paper text, MCP servers, tool definitions, query corpus, prompts, results, figures, tables, benchmark rows, or configs",
            inputHash: hash("d"),
            expectedHash: hash("e"),
            fixtureHash: hash("f"),
            seed: 1052,
            metadata: { sourceReview: "GAP-1052", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.42,
            evidenceRefs: ["ev-gap1052-baseline"],
            signedEvidenceRefs: ["ledger-gap1052-baseline", "ledger-gap1052-baseline-ci"],
          },
          candidate: {
            score0to1: 0.74,
            evidenceRefs: ["ev-gap1052-candidate"],
            signedEvidenceRefs: ["ledger-gap1052-candidate", "ledger-gap1052-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.32);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when MCP-AgentBench metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1052-metadata-only-agent",
      corpusId: "gap-1052-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1052-baseline",
      candidateRunId: "gap-1052-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T03:35:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1052-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "MCP-AgentBench title, DOI, OpenAlex, Crossref, AAAI page, PDF URL, MCP, server count, tool count, query count, category count, and MCP-Eval labels without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.65,
            evidenceRefs: [DOI],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.65,
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

  it("does not add MCP-AgentBench identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("MCP-AgentBench");
    }
  });
});
