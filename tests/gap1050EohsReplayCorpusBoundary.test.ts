import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1050-eohs-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7139112767";
const OPENALEX_API = "https://api.openalex.org/works/W7139112767";
const DOI = "https://doi.org/10.1609/aaai.v40i43.41038";
const DOI_VALUE = "10.1609/aaai.v40i43.41038";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i43.41038";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/41038";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/41038/44999";
const TITLE = "EoH-S: Evolution of Heuristic Set Using LLMs for Automated Heuristic Design";
const IDENTIFIER = "eohs_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1050 EoH-S replay-corpus boundary", () => {
  it("documents live EoH-S paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1050");
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
    expect(doc).toContain("issue `43`");
    expect(doc).toContain("pages `37090-37098`");
    expect(doc).toContain("Fei Liu");
    expect(doc).toContain("Yilu Liu");
    expect(doc).toContain("Qingfu Zhang");
    expect(doc).toContain("Tong Xialiang");
    expect(doc).toContain("Mingxuan Yuan");
    expect(doc).toContain("City University of Hong Kong");
    expect(doc).toContain("Huawei Technologies (Sweden)");
    expect(doc).toContain("Huawei Noah");
    expect(doc).toContain("Vehicle Routing Optimization Methods");
    expect(doc).toContain("Optimization and Packing Problems");
    expect(doc).toContain("Constraint Satisfaction and Optimization");
    expect(doc).toContain("Heuristic");
    expect(doc).toContain("Hyper-heuristic");
    expect(doc).toContain("Generalization");
    expect(doc).toContain("Metaheuristic");
    expect(doc).toContain("Evolutionary algorithm");
    expect(doc).toContain("Travelling salesman problem");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("AAAI article returned HTTP/2 200");
    expect(doc).toContain("PDF endpoint returned HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("11984-AAAI26.LiuF-SO.pdf");
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

  it("accepts EoH-S context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1050-eohs-reviewed-agent",
      corpusId: "gap-1050-amc-owned-eohs-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1050-baseline",
      candidateRunId: "gap-1050-candidate",
      sourceRefs: [DOI, OPENALEX, OPENALEX_API, CROSSREF, AAAI, PDF],
      now: new Date("2026-06-25T03:20:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1050-owned-eohs-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned heuristic-design replay fixture with no copied AAAI paper text, optimization instances, TSP tasks, vehicle-routing datasets, heuristic sets, generated heuristics, prompts, figures, tables, or benchmark outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 1050,
            metadata: { sourceReview: "GAP-1050", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.49,
            evidenceRefs: ["ev-gap1050-baseline"],
            signedEvidenceRefs: ["ledger-gap1050-baseline", "ledger-gap1050-baseline-ci"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["ev-gap1050-candidate"],
            signedEvidenceRefs: ["ledger-gap1050-candidate", "ledger-gap1050-candidate-ci"],
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
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.3);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when EoH-S metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1050-metadata-only-agent",
      corpusId: "gap-1050-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1050-baseline",
      candidateRunId: "gap-1050-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T03:20:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1050-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "EoH-S title, DOI, OpenAlex, Crossref, AAAI page, PDF URL, heuristic, hyper-heuristic, TSP, optimization, vehicle routing, and generalization metadata without an AMC-owned replay fixture",
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

  it("does not add EoH-S identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Evolution of Heuristic Set");
    }
  });
});
