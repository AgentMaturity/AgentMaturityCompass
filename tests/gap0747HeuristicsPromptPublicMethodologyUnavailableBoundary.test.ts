import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0747-heuristics-prompt-public-methodology-unavailable.md";
const DOI = "10.1145/3742413.3789108";
const OPENALEX = "W7133359620";
const TITLE = "Vulnerability of LLM Outputs to Heuristics-Inducing Prompt Structures";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0747 heuristics prompt public-methodology unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0747");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches returned no primary result");
    expect(doc).toContain("returned `403`");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("representativeness heuristic");
    expect(doc).toContain("anchoring");
    expect(doc).toContain("framing");
    expect(doc).toContain("debiasing");
    expect(doc).toContain("vulnerability");
    expect(doc).toContain("risk analysis");
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

  it("does not create an AMC public-methodology version bump from unavailable metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No debiasing evaluator, prompt-heuristics benchmark");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("heuristics_prompt_public_methodology");
    expect(manifestText).not.toContain("prompt_heuristics_benchmark");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("heuristics_prompt_public_methodology");
      expect(source).not.toContain("prompt_heuristics_benchmark");
    }
  });
});
