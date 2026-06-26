import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0701-monoscope-public-methodology.md";
const SOURCE = "https://github.com/monoscope-tech/monoscope";
const REPO = "monoscope-tech/monoscope";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
  "docs/SCORING_METHODOLOGY.md",
];

describe("GAP-0701 Monoscope public-methodology boundary", () => {
  it("documents live Monoscope metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0701");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("branch `master`");
    expect(doc).toContain("1.2k stars");
    expect(doc).toContain("48 forks");
    expect(doc).toContain("6` issues");
    expect(doc).toContain("5` pull requests");
    expect(doc).toContain("5,215 commits");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Monoscope v0.6.23");
    expect(doc).toContain("Jun 11, 2026");
    expect(doc).toContain("Haskell `82.0%`");
    expect(doc).toContain("OpenTelemetry support");
    expect(doc).toContain("scheduled AI agents");
    expect(doc).toContain("anomaly detection");
    expect(doc).toContain("MCP server");
    expect(doc).toContain("REST tool registration");
    expect(doc).toContain("TimeFusion storage");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps Monoscope as observability context instead of an AMC methodology version source", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("skipped as AMC public-methodology evidence");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("No Monoscope adapter");
    expect(doc).toContain("Monoscope repository metadata alone must fail closed");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("monoscope_public_methodology");
  });

  it("does not add Monoscope identifiers to methodology or badge implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("monoscope_public_methodology");
      expect(source).not.toContain("TimeFusion");
    }
  });
});
