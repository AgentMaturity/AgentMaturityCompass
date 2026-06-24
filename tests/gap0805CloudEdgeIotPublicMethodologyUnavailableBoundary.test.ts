import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0805-cloud-edge-iot-public-methodology-unavailable.md";
const DOI = "10.5281/zenodo.20591969";
const OPENALEX = "W7163869541";
const TITLE = "Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0805 cloud-edge-IoT public-methodology unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0805");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("Zenodo search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("No abstract in OpenAlex metadata");
    expect(doc).toContain("skipped as public-methodology implementation evidence");
    expect(doc).toContain("cloud-edge-IoT continuum");
    expect(doc).toContain("systematic mapping study");
    expect(doc).toContain("architectures");
    expect(doc).toContain("deployment");
    expect(doc).toContain("evaluation");
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

  it("keeps unavailable cloud-edge-IoT metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("unavailable source metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("cloud_edge_iot_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("cloud_edge_iot_public_methodology");
    }
  });
});
