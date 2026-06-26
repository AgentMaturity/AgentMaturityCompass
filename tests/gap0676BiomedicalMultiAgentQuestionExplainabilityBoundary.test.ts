import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0676-biomedical-multi-agent-question-explainability.md";
const DOI = "10.1038/s41551-026-01634-6";
const OPENALEX = "W7143351253";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
  "src/score/domainPacks.ts",
];

describe("GAP-0676 biomedical multi-agent question-explainability boundary", () => {
  it("documents live Nature metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0676");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("Nature Biomedical Engineering");
    expect(doc).toContain("Published: 30 March 2026");
    expect(doc).toContain("BioMedAgent");
    expect(doc).toContain("BioMed-AQA");
    expect(doc).toContain("327 biomedical data tasks");
    expect(doc).toContain("77% success rate");
    expect(doc).toContain("BixBench");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps biomedical source context bounded to existing AMC question explainability proof", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, domain pack, or scoring behavior changed");
    expect(doc).toContain("No clinical decision-support subsystem, BioMedAgent integration");
    expect(doc).toContain("No medical, biomedical, clinical, diagnostic, or regulatory claim");
    expect(doc).toContain("metadata-only source identity must fail closed");
  });

  it("does not add BioMedAgent identifiers to diagnostic, guide, passport, or domain-pack modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("BioMedAgent");
      expect(source).not.toContain("biomedagent_question_explainability");
    }
  });
});
