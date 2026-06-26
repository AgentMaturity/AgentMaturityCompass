import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0664-medea-omics-studio-drilldown.md";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/console/assets/passport.js",
];

describe("GAP-0664 Medea omics Studio drilldown boundary", () => {
  it("documents the unverified source lookup and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0664");
    expect(doc).toContain("W7125151103");
    expect(doc).toContain("10.64898/2026.01.16.696667");
    expect(doc).toContain("Medea: An omics AI agent for therapeutic discovery");
    expect(doc).toContain("returned no matching primary page");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps biomedical metadata out of Studio drilldown product scope", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("no Studio feature, route, clinical/omics claim, or biomedical agent subsystem is added");
    expect(doc).toContain("No `src/studio`, `src/console`, `src/watch`, API, CLI, diagnostic, guide, passport, or scoring behavior changed");
    expect(doc).toContain("an AMC-owned UI route, source artifact links, evidence previews");
    expect(doc).toContain("No Medea subsystem, omics agent, biomedical discovery workflow");
    expect(doc).toContain("No upstream paper prose");
  });

  it("does not add Medea-specific identifiers to relevant implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Medea");
      expect(source).not.toContain("W7125151103");
      expect(source).not.toContain("10.64898/2026.01.16.696667");
      expect(source).not.toContain("omics_studio_drilldown");
    }
  });
});
