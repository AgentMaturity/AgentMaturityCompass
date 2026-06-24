import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0973-helm-public-methodology.md";
const HOME = "https://crfm.stanford.edu/helm/";
const GITHUB = "https://github.com/stanford-crfm/helm";
const LATEST = "https://crfm.stanford.edu/helm/latest/";
const CLASSIC = "https://crfm.stanford.edu/helm/classic/latest/";
const TITLE = "HELM";
const IDENTIFIER = "helm_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0973 HELM public-methodology boundary", () => {
  it("documents live HELM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0973");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(LATEST);
    expect(doc).toContain(CLASSIC);
    expect(doc).toContain("live HELM website");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("stanford-crfm/helm");
    expect(doc).toContain("2.8k stars");
    expect(doc).toContain("397 forks");
    expect(doc).toContain("49 issues");
    expect(doc).toContain("28 pull requests");
    expect(doc).toContain("6,298 commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("v0.5.16 Latest Apr 30, 2026");
    expect(doc).toContain("maintenance mode on June 1, 2026");
    expect(doc).toContain("holistic, reproducible and transparent evaluation");
    expect(doc).toContain("Datasets and benchmarks in a standardized format");
    expect(doc).toContain("models from various providers");
    expect(doc).toContain("metrics for measuring various aspects beyond accuracy");
    expect(doc).toContain("Web UI for inspecting individual prompts and responses");
    expect(doc).toContain("Web leaderboard for comparing results");
    expect(doc).toContain("HELM Capabilities");
    expect(doc).toContain("HELM Safety");
    expect(doc).toContain("VHELM");
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

  it("keeps HELM metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("HELM source metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(GITHUB);
    expect(manifestText).not.toContain(HOME);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific HELM public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain(HOME);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
