import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1041-adaptjobrec-public-methodology.md";
const OPENALEX = "https://openalex.org/W7139039941";
const OPENALEX_API = "https://api.openalex.org/works/W7139039941";
const DOI = "https://doi.org/10.1609/aaai.v40i47.41491";
const DOI_VALUE = "10.1609/aaai.v40i47.41491";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i47.41491";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/41491";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/41491/45452";
const TITLE = "AdaptJobRec: Enhancing Conversational Career Recommendation Through an LLM-Powered Agentic System";
const IDENTIFIER = "adaptjobrec_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1041 AdaptJobRec public-methodology boundary", () => {
  it("documents live AdaptJobRec metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1041");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("publisher `Association for the Advancement of Artificial Intelligence (AAAI)`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("page `40473-40479`");
    expect(doc).toContain("firstpage `40473`");
    expect(doc).toContain("lastpage `40479`");
    expect(doc).toContain("oa_status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Qixin Wang");
    expect(doc).toContain("Dawei Wang");
    expect(doc).toContain("Kun Chen");
    expect(doc).toContain("Yaowei Hu");
    expect(doc).toContain("Xintao Wu");
    expect(doc).toContain("Walmart (United States)");
    expect(doc).toContain("University of Arkansas at Fayetteville");
    expect(doc).toContain("Recommender system");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Human-computer interaction");
    expect(doc).toContain("Personalization");
    expect(doc).toContain("Decomposition");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("AAAI article returned HTTP/2 200");
    expect(doc).toContain("PDF endpoint returned HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
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

  it("keeps AdaptJobRec paper evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "AdaptJobRec paper evidence alone cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(DOI_VALUE);
    expect(manifestText).not.toContain(AAAI);
    expect(manifestText).not.toContain(TITLE);
    expect(manifestText).not.toContain("AdaptJobRec");
    expect(manifestText).not.toContain("career recommendation");
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific AdaptJobRec identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(AAAI);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("AdaptJobRec");
      expect(source).not.toContain("career recommendation");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
