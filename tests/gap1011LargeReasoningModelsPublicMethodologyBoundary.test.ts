import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1011-large-reasoning-models-public-methodology.md";
const OPENALEX = "https://openalex.org/W7128026658";
const OPENALEX_API = "https://api.openalex.org/works/W7128026658";
const DOI = "https://doi.org/10.1038/s41467-026-69010-1";
const NATURE_ARTICLE = "https://www.nature.com/articles/s41467-026-69010-1";
const NATURE_PDF = "https://www.nature.com/articles/s41467-026-69010-1.pdf";
const CROSSREF = "https://api.crossref.org/works/10.1038/s41467-026-69010-1";
const IDENTIFIER = "large_reasoning_models_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1011 large reasoning models public-methodology boundary", () => {
  it("documents live paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1011");
    expect(doc).toContain("Large reasoning models are autonomous jailbreak agents");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(NATURE_ARTICLE);
    expect(doc).toContain(NATURE_PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 303");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("last-modified: Fri, 06 Feb 2026 13:02:52 GMT");
    expect(doc).toContain("content-length: 871299");
    expect(doc).toContain("Nature Communications");
    expect(doc).toContain("Nature Communications 2026 17:1");
    expect(doc).toContain("journal-article");
    expect(doc).toContain("article");
    expect(doc).toContain("publication_date 2026-02-05");
    expect(doc).toContain("datePublished 2026-02-05");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("publishedVersion");
    expect(doc).toContain("cited_by_count 2");
    expect(doc).toContain("Thilo Hagendorff");
    expect(doc).toContain("Erik Derner");
    expect(doc).toContain("Nuria Oliver");
    expect(doc).toContain("University of Stuttgart");
    expect(doc).toContain("ELLIS Alicante");
    expect(doc).toContain("Adversarial Robustness in Machine Learning");
    expect(doc).toContain("Explainable Artificial Intelligence");
    expect(doc).toContain("Ethics and Social Impacts of AI");
    expect(doc).toContain("Computer Science");
    expect(doc).toContain("Safety Research");
    expect(doc).toContain("Mathematics and computing");
    expect(doc).toContain("Scientific community");
    expect(doc).toContain("DeepSeek-R1");
    expect(doc).toContain("Gemini 2.5 Flash");
    expect(doc).toContain("Grok 3 Mini");
    expect(doc).toContain("Qwen3 235B");
    expect(doc).toContain("nine widely used target models");
    expect(doc).toContain("multi-turn conversations");
    expect(doc).toContain("system prompt");
    expect(doc).toContain("no further supervision");
    expect(doc).toContain("harmful prompts");
    expect(doc).toContain("sensitive domains");
    expect(doc).toContain("97.14%");
    expect(doc).toContain("alignment regression");
    expect(doc).toContain("safety guardrails");
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

  it("keeps the jailbreak-agents paper out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Large reasoning models are autonomous jailbreak agents cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(NATURE_ARTICLE);
    expect(manifestText).not.toContain("Large reasoning models are autonomous jailbreak agents");
    expect(manifestText).not.toContain("autonomous jailbreak agents");
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific jailbreak paper identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(NATURE_ARTICLE);
      expect(source).not.toContain("Large reasoning models are autonomous jailbreak agents");
      expect(source).not.toContain("autonomous jailbreak agents");
      expect(source).not.toContain("DeepSeek-R1");
      expect(source).not.toContain("Grok 3 Mini");
      expect(source).not.toContain("Qwen3 235B");
      expect(source).not.toContain("97.14%");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
