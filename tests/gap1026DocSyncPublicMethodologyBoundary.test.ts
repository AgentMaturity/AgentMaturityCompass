import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1026-docsync-public-methodology.md";
const OPENALEX = "https://openalex.org/W7163218920";
const OPENALEX_API = "https://api.openalex.org/works/W7163218920";
const DOI = "https://doi.org/10.1109/icaiset66439.2026.11541905";
const DOI_VALUE = "10.1109/icaiset66439.2026.11541905";
const CROSSREF = "https://api.crossref.org/works/10.1109/icaiset66439.2026.11541905";
const IEEE = "https://ieeexplore.ieee.org/document/11541905/";
const TITLE = "DocSync: Agentic Documentation Maintenance via Critic-Guided Reflexion";
const IDENTIFIER = "docsync_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1026 DocSync public-methodology boundary", () => {
  it("documents live DocSync paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1026");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(IEEE);
    expect(doc).toContain("publication_date `2026-04-21`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("language `null`");
    expect(doc).toContain("oa_status `closed`");
    expect(doc).toContain("is_oa `false`");
    expect(doc).toContain("any_repository_has_fulltext `false`");
    expect(doc).toContain("raw_type `proceedings-article`");
    expect(doc).toContain("locations_count `1`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Crossref type `proceedings-article`");
    expect(doc).toContain("publisher `IEEE`");
    expect(doc).toContain("issued `2026-04-21`");
    expect(doc).toContain("Cairo, Egypt");
    expect(doc).toContain("event dates `2026-04-21` to `2026-04-23`");
    expect(doc).toContain("page `1-6`");
    expect(doc).toContain("reference-count `14`");
    expect(doc).toContain("is-referenced-by-count `1`");
    expect(doc).toContain("prefix `10.1109`");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 202");
    expect(doc).toContain("x-amzn-waf-action: challenge");
    expect(doc).toContain("Sidhesh Badrinarayan");
    expect(doc).toContain("Adithya Parthasarathy");
    expect(doc).toContain("Documentation");
    expect(doc).toContain("Process management");
    expect(doc).toContain("Knowledge management");
    expect(doc).toContain("Engineering ethics");
    expect(doc).toContain("Human-computer interaction");
    expect(doc).toContain("agentic documentation maintenance");
    expect(doc).toContain("critic-guided reflexion");
    expect(doc).toContain("documentation drift");
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

  it("keeps DocSync paper evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "DocSync paper evidence alone cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(DOI_VALUE);
    expect(manifestText).not.toContain(IEEE);
    expect(manifestText).not.toContain(TITLE);
    expect(manifestText).not.toContain("DocSync");
    expect(manifestText).not.toContain("critic-guided reflexion");
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific DocSync identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IEEE);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("DocSync");
      expect(source).not.toContain("critic-guided reflexion");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
