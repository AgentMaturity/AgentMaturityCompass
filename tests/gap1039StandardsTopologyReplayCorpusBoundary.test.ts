import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-1039-standards-topology-replay-corpus.md";
const OPENALEX = "https://openalex.org/W7139912757";
const OPENALEX_API = "https://api.openalex.org/works/W7139912757";
const DOI = "https://doi.org/10.1115/1.4071459";
const DOI_VALUE = "10.1115/1.4071459";
const ASME =
  "https://asmedigitalcollection.asme.org/computingengineering/article/doi/10.1115/1.4071459/1232020/Navigating-Standards-in-Engineering-Design-through";
const PDF = "https://asmedigitalcollection.asme.org/computingengineering/article-pdf/doi/10.1115/1.4071459/7601517/jcise-24-1654.pdf";
const CROSSREF = "https://api.crossref.org/works/10.1115/1.4071459";
const TITLE = "Navigating Standards in Engineering Design through Latent Textual Topology and LLMs";
const IDENTIFIER = "standards_topology_replay_corpus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-1039 standards topology replay-corpus boundary", () => {
  it("documents live standards topology metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1039");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(ASME);
    expect(doc).toContain(PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Journal of Computing and Information Science in Engineering");
    expect(doc).toContain("publication_date `2026-03-20`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("oa_status `hybrid`");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("ASME International");
    expect(doc).toContain("page `1-14`");
    expect(doc).toContain("Matthew B. Bowen");
    expect(doc).toContain("Logan A. Smith");
    expect(doc).toContain("Cody Carroll");
    expect(doc).toContain("Mozhdeh Rahmanpour");
    expect(doc).toContain("Tan Pan");
    expect(doc).toContain("Beshoy Morkos");
    expect(doc).toContain("University of Georgia");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Software engineering");
    expect(doc).toContain("Engineering design process");
    expect(doc).toContain("Standardization");
    expect(doc).toContain("Technical documentation");
    expect(doc).toContain("Requirements engineering");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
    expect(doc).toContain("Cloudflare challenge");
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

  it("accepts standards topology context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1039-standards-topology-reviewed-agent",
      corpusId: "gap-1039-amc-owned-standards-topology-replay-corpus",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1039-baseline",
      candidateRunId: "gap-1039-candidate",
      sourceRefs: [DOI, OPENALEX, OPENALEX_API, CROSSREF, ASME, PDF],
      now: new Date("2026-06-25T01:20:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1039-owned-standards-topology-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned standards topology replay fixture with no copied ASME paper text, standards corpora, technical documentation, topology graphs, prompts, datasets, figures, or benchmark outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 1039,
            metadata: { sourceReview: "GAP-1039", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.51,
            evidenceRefs: ["ev-gap1039-baseline"],
            signedEvidenceRefs: ["ledger-gap1039-baseline", "ledger-gap1039-baseline-ci"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["ev-gap1039-candidate"],
            signedEvidenceRefs: ["ledger-gap1039-candidate", "ledger-gap1039-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, OPENALEX, OPENALEX_API, CROSSREF, ASME, PDF]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.33);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when standards topology metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-1039-metadata-only-agent",
      corpusId: "gap-1039-metadata-only",
      corpusVersion: "2026.06.25",
      baselineRunId: "gap-1039-baseline",
      candidateRunId: "gap-1039-candidate",
      sourceRefs: [],
      now: new Date("2026-06-25T01:20:00.000+05:30"),
      rows: [
        {
          rowId: "gap-1039-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Standards topology paper title, DOI, OpenAlex record, ASME landing page, latent textual topology, and engineering standards metadata without an AMC-owned replay fixture",
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

  it("does not add standards topology identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain("W7139912757");
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
