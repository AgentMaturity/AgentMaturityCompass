import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0986-affective-computing-public-methodology.md";
const OPENALEX = "https://openalex.org/W7125637838";
const OPENALEX_API = "https://api.openalex.org/works/W7125637838";
const DOI = "https://doi.org/10.1016/j.knosys.2026.115411";
const DOI_REDIRECT = "https://linkinghub.elsevier.com/retrieve/pii/S0950705126001541";
const ARXIV = "https://arxiv.org/abs/2408.04638";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2408.04638";
const ARXIV_PDF = "https://arxiv.org/pdf/2408.04638";
const TITLE = "Affective computing in the era of large language models: A survey from the NLP perspective";
const IDENTIFIER = "affective_computing_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0986 affective computing public-methodology boundary", () => {
  it("documents live affective-computing source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0986");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_REDIRECT);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain("Knowledge-Based Systems");
    expect(doc).toContain("publication_date `2026-01-25`");
    expect(doc).toContain("closed");
    expect(doc).toContain("referenced_works_count `77`");
    expect(doc).toContain("cited_by_count `3`");
    expect(doc).toContain("Yiqun Zhang");
    expect(doc).toContain("Xiaocui Yang");
    expect(doc).toContain("Ge Yu");
    expect(doc).toContain("Affective Understanding");
    expect(doc).toContain("Affective Generation");
    expect(doc).toContain("Instruction Tuning");
    expect(doc).toContain("LoRA");
    expect(doc).toContain("P-/Prompt-Tuning");
    expect(doc).toContain("Prompt Engineering");
    expect(doc).toContain("zero/few-shot");
    expect(doc).toContain("chain-of-thought");
    expect(doc).toContain("agent-based prompting");
    expect(doc).toContain("Reinforcement Learning");
    expect(doc).toContain("RLHF");
    expect(doc).toContain("RLVR");
    expect(doc).toContain("RLAIF");
    expect(doc).toContain("benchmarks and evaluation practices");
    expect(doc).toContain("ethics");
    expect(doc).toContain("robust evaluation");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("skipped as public-methodology implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps affective-computing paper metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Affective-computing paper metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific affective-computing public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
