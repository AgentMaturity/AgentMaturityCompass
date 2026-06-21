import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = () => readFileSync("docs/source-reviews/GAP-0660-modern-rag-public-methodology.md", "utf8");

describe("GAP-0660 modern RAG public methodology source review", () => {
  it("documents live DOI/OpenAlex/Crossref metadata while failing closed for metadata-only methodology claims", () => {
    const content = doc();

    expect(content).toContain("selected metadata SHA-256 `2854d51cf1e1f5152672ded0ceb5381657efe657a64f6cf506ec8887f9d4c289`");
    expect(content).toContain("OpenAlex ID | `https://openalex.org/W7128601153`");
    expect(content).toContain("DOI | `https://doi.org/10.1016/j.cosrev.2026.100925`");
    expect(content).toContain("From vectors to knowledge graphs: A comprehensive analysis of modern retrieval-augmented generation architectures");
    expect(content).toContain("not a public AMC methodology version change by itself");
    expect(content).toContain("## AMC/8 surface check");
    expect(content).toContain("metadata, venue, publisher, title, citation counts, article number, or source URL alone must fail closed");
    expect(content).toContain("No retrieval subsystem, knowledge-graph subsystem, RAG adapter, graph database connector, vector-store connector, importer, benchmark mirror");
    expect(content).toContain("No product module changed");
  });
});
