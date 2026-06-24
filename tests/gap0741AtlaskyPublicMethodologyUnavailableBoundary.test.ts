import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0741-atlasky-ai-public-methodology-unavailable.md";
const DOI = "10.1016/j.eswa.2026.131801";
const OPENALEX = "W7135068047";
const TITLE = "ATLASky-AI: An autonomous framework for physics-based trustworthy verification of LLM-generated spatiotemporal knowledge";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0741 ATLASky-AI public-methodology unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0741");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, Elsevier publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("physics-based verification");
    expect(doc).toContain("spatiotemporal knowledge");
    expect(doc).toContain("ground truth");
    expect(doc).toContain("anomaly detection");
    expect(doc).toContain("five-module agent architecture");
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
    expect(doc).toContain("No ATLASky-AI framework, physics verifier, spatiotemporal reasoner");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("atlasky_ai_public_methodology");
    expect(manifestText).not.toContain("physics_based_verification");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("atlasky_ai_public_methodology");
      expect(source).not.toContain("physics_based_verification");
    }
  });
});
