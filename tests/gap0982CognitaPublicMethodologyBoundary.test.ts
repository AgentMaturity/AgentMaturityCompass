import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0982-cognita-public-methodology.md";
const GITHUB = "https://github.com/truefoundry/cognita";
const GITHUB_API = "https://api.github.com/repos/truefoundry/cognita";
const RAW_README = "https://raw.githubusercontent.com/truefoundry/cognita/main/README.md";
const RAW_LICENSE = "https://raw.githubusercontent.com/truefoundry/cognita/main/LICENSE";
const TITLE = "truefoundry/cognita";
const IDENTIFIER = "cognita_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0982 Cognita public-methodology boundary", () => {
  it("documents live Cognita metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0982");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(RAW_LICENSE);
    expect(doc).toContain("Public archive");
    expect(doc).toContain("archived by the owner on Mar 13, 2026");
    expect(doc).toContain("no longer actively maintained");
    expect(doc).toContain("stargazers_count `4408`");
    expect(doc).toContain("forks_count `390`");
    expect(doc).toContain("open_issues_count `22`");
    expect(doc).toContain("watchers_count `4408`");
    expect(doc).toContain("pushed_at `2026-03-13T15:04:36Z`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("agent");
    expect(doc).toContain("llmops");
    expect(doc).toContain("rag");
    expect(doc).toContain("retrieval-augmented-generation");
    expect(doc).toContain("RAG");
    expect(doc).toContain("production ready");
    expect(doc).toContain("modular");
    expect(doc).toContain("API driven");
    expect(doc).toContain("UI");
    expect(doc).toContain("incremental indexing");
    expect(doc).toContain("Langchain");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("model gateway");
    expect(doc).toContain("Vector DB");
    expect(doc).toContain("TrueFoundry AI Gateway");
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

  it("keeps Cognita metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "Cognita source metadata alone cannot justify a public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(GITHUB);
    expect(manifestText).not.toContain(GITHUB_API);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific Cognita public-methodology identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain(GITHUB_API);
      expect(source).not.toContain("truefoundry/cognita");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
