import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0677-agentic-security-public-methodology.md";
const SOURCE = "msoedov/agentic_security";
const SOURCE_URL = "https://github.com/msoedov/agentic_security";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0677 Agentic Security public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0677");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain("main");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("1.9k stars");
    expect(doc).toContain("265 forks");
    expect(doc).toContain("45 issues");
    expect(doc).toContain("25 pull requests");
    expect(doc).toContain("702 commits");
    expect(doc).toContain("19 releases");
    expect(doc).toContain("0.7.5");
    expect(doc).toContain("Jun 3, 2026");
    expect(doc).toContain("Python 99.3%");
    expect(doc).toContain("agent-security");
    expect(doc).toContain("llm-fuzzing");
    expect(doc).toContain("llm-guardrails");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not convert Agentic Security repository metadata into AMC public methodology versioning", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, Shield runner, Watch monitor, or scoring code changed");
    expect(doc).toContain("Agentic Security repository metadata alone must fail closed");
    expect(doc).toContain("No Agentic Security scanner integration, red-team kit wrapper, fuzzer adapter");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain("agentic_security_public_methodology");
    expect(manifestText).not.toContain("Agentic Security");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(SOURCE_URL);
      expect(source).not.toContain("agentic_security_public_methodology");
    }
  });
});
