import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0666-biological-ai-agents-replay-corpus.md";
const DOI = "10.1093/bib/bbag075";
const OPENALEX = "W7131698947";

const implementationFiles = [
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

describe("GAP-0666 biological AI agents replay-corpus boundary", () => {
  it("documents primary source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0666");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("Artificial Intelligence agents for biological research: a survey");
    expect(doc).toContain("Briefings in Bioinformatics");
    expect(doc).toContain("bbag075");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps survey resources out of replay-corpus product scope", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("The source is not an AMC replay corpus");
    expect(doc).toContain("Accepted claims still need AMC-owned replay manifests");
    expect(doc).toContain("No biological-agent benchmark corpus, survey-resource importer");
    expect(doc).toContain("No upstream prose, abstract text, figures, tables, taxonomies");
    expect(doc).toContain("privacy/safety boundaries for biological data");
  });

  it("does not add source-specific biological-agent identifiers to replay implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("bbag075");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("biological_ai_agents_replay_corpus");
      expect(source).not.toContain("MineSelf2016/biological_agents_survey");
    }
  });
});
