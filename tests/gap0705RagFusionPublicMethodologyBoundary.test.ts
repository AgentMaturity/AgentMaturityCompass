import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0705-rag-fusion-public-methodology.md";
const SOURCE = "https://github.com/Raudaschl/rag-fusion";
const REPO = "Raudaschl/rag-fusion";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0705 RAG-Fusion public-methodology boundary", () => {
  it("documents live RAG-Fusion metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0705");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `696503950`");
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("size `562`");
    expect(doc).toContain("not archived");
    expect(doc).toContain("2026-04-26T18:45:00Z");
    expect(doc).toContain("multi-query generation");
    expect(doc).toContain("reciprocal rank fusion");
    expect(doc).toContain("vector search");
    expect(doc).toContain("BM25");
    expect(doc).toContain("NFCorpus");
    expect(doc).toContain("BEIR");
    expect(doc).toContain("precision, recall, NDCG, and MRR");
    expect(doc).toContain("paired-bootstrap confidence intervals");
    expect(doc).toContain("LLM judge");
    expect(doc).toContain("cost and latency analysis");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps RAG-Fusion as retrieval-evaluation context instead of an AMC methodology version source", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No RAG-Fusion adapter");
    expect(doc).toContain("repository metadata and README evaluation claims alone must fail closed");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("rag_fusion_public_methodology");
  });

  it("does not add RAG-Fusion identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("rag_fusion_public_methodology");
      expect(source).not.toContain("Reciprocal Rank Fusion");
    }
  });
});
