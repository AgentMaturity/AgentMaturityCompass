import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0993-llm-counselor-public-methodology.md";
const OPENALEX = "https://openalex.org/W4415031587";
const OPENALEX_API = "https://api.openalex.org/works/W4415031587";
const DOI = "https://doi.org/10.1145/3772318.3791821";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3791821";
const ACM_PDF = "https://dl.acm.org/doi/pdf/10.1145/3772318.3791821";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3791821";
const ARXIV = "https://arxiv.org/abs/2505.02428";
const ARXIV_PDF = "https://arxiv.org/pdf/2505.02428";
const TITLE =
  "Can LLM-Simulated Practice and Feedback Upskill Human Counselors? A Randomized Study with 90+ Novice Counselors";
const IDENTIFIER = "llm_counselor_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0993 LLM counselor-training public-methodology boundary", () => {
  it("documents live counselor-training source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0993");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ACM);
    expect(doc).toContain(ACM_PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("ACM");
    expect(doc).toContain("publication_date `2026-04-13`");
    expect(doc).toContain("published-online `2026-04-13`");
    expect(doc).toContain("reference-count `119`");
    expect(doc).toContain("referenced_works_count `0`");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("open access status `gold`");
    expect(doc).toContain("Ryan Louie");
    expect(doc).toContain("Raj Sanjay Shah");
    expect(doc).toContain("Emma Brunskill");
    expect(doc).toContain("Diyi Yang");
    expect(doc).toContain("Active listening");
    expect(doc).toContain("Randomized controlled trial");
    expect(doc).toContain("Dreyfus model of skill acquisition");
    expect(doc).toContain("Mental health");
    expect(doc).toContain("LLM-simulated practice");
    expect(doc).toContain("novice counselor");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
    expect(doc).toContain("cf-mitigated: challenge");
    expect(doc).toContain("arXiv `2505.02428`");
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

  it("keeps counselor-training paper metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Counselor-training paper metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(ACM);
    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific counselor-training public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(ACM);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain("W4415031587");
      expect(source).not.toContain("10.1145/3772318.3791821");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
