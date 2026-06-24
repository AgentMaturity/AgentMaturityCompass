import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0750-caim-public-methodology.md";
const ARXIV = "https://arxiv.org/abs/2505.13044";
const ARXIV_DOI = "10.48550/arXiv.2505.13044";
const BACKLOG_DOI = "10.1145/3742413.3789222";
const OPENALEX = "W7133361058";
const TITLE = "CAIM: Development and Evaluation of a Cognitive AI Memory Framework for Long-Term Interaction with Intelligent Agents";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0750 CAIM public-methodology boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0750");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(BACKLOG_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Rebecca Westhaeusser");
    expect(doc).toContain("Frederik Berenz");
    expect(doc).toContain("Wolfgang Minker");
    expect(doc).toContain("Sebastian Zepf");
    expect(doc).toContain("2025-05-19");
    expect(doc).toContain("Artificial Intelligence");
    expect(doc).toContain("Human-Computer Interaction");
    expect(doc).toContain("long-term interactions");
    expect(doc).toContain("user adaptation");
    expect(doc).toContain("contextual knowledge");
    expect(doc).toContain("holistic memory modeling");
    expect(doc).toContain("Memory Controller");
    expect(doc).toContain("Memory Retrieval");
    expect(doc).toContain("Post-Thinking");
    expect(doc).toContain("retrieval accuracy");
    expect(doc).toContain("response correctness");
    expect(doc).toContain("contextual coherence");
    expect(doc).toContain("memory storage");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create an AMC public-methodology version bump from memory-framework metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("paper labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No CAIM memory framework, Memory Controller, Memory Retrieval, Post-Thinking module");

    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain(ARXIV_DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("caim_public_methodology");
    expect(manifestText).not.toContain("cognitive_ai_memory_framework");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(ARXIV_DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("caim_public_methodology");
      expect(source).not.toContain("cognitive_ai_memory_framework");
    }
  });
});
