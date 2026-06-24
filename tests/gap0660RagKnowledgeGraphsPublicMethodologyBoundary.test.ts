import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0660-rag-knowledge-graphs-public-methodology.md";
const DOI = "10.1016/j.cosrev.2026.100925";
const OPENALEX = "W7128601153";
const TITLE = "From vectors to knowledge graphs: A comprehensive analysis of modern retrieval-augmented generation architectures";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0660 RAG knowledge-graphs public-methodology boundary", () => {
  it("documents the metadata-limited skip and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0660");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("skipped as metadata-limited public-methodology evidence");
    expect(doc).toContain("DNS resolution errors");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
    expect(doc).toContain("no public methodology change");
  });

  it("does not add a methodology version bump or source-specific RAG/KG implementation", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("No RAG knowledge-graph subsystem, graph database, vector store, retriever, importer, paper parser");
    expect(doc).toContain("No upstream paper prose");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("rag_knowledge_graphs");
    expect(manifestText).not.toContain("vectors_to_knowledge_graphs");
  });

  it("keeps GAP-0660 identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("rag_knowledge_graphs");
      expect(source).not.toContain("vectors_to_knowledge_graphs");
    }
  });
});
