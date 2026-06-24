import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1013-jamaibase-public-methodology.md";
const REPO = "https://github.com/EmbeddedLLM/JamAIBase";
const API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase";
const README_API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase/readme";
const README = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/README.md";
const LICENSE_API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase/license";
const CONTENTS_API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase/contents?ref=main";
const COMMIT_API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase/commits/main";
const RELEASE_API = "https://api.github.com/repos/EmbeddedLLM/JamAIBase/releases/latest";
const CI = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/ci.yml";
const LINT = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/.github/workflows/lint.yml";
const VERSIONING = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/VERSIONING.md";
const MIGRATION = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/MIGRATION_GUIDE.md";
const CHANGELOG = "https://raw.githubusercontent.com/EmbeddedLLM/JamAIBase/main/CHANGELOG.md";
const HEAD = "91e2743e96290a8029f9d803ac00f765d0f03f3a";
const RELEASE = "v0.4";
const IDENTIFIER = "jamaibase_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1013 JamAIBase public-methodology boundary", () => {
  it("documents live JamAIBase source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1013");
    expect(doc).toContain("EmbeddedLLM/JamAIBase");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(CI);
    expect(doc).toContain(LINT);
    expect(doc).toContain(VERSIONING);
    expect(doc).toContain(MIGRATION);
    expect(doc).toContain(CHANGELOG);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("Python");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("1,100 stars");
    expect(doc).toContain("41 forks");
    expect(doc).toContain("2 open issues");
    expect(doc).toContain("created_at `2024-05-30T15:31:08Z`");
    expect(doc).toContain("pushed_at `2026-06-08T06:06:06Z`");
    expect(doc).toContain("updated_at `2026-06-23T23:19:52Z`");
    expect(doc).toContain("README sha `e9e26769c40543ecfe5400af9b8f4f0792eb0981`");
    expect(doc).toContain("LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`");
    expect(doc).toContain("release `v0.4` published `2025-02-13T16:58:32Z`");
    expect(doc).toContain("CI workflow sha `1cc46d9161854bce5e89bf180307b418a03db62a`");
    expect(doc).toContain("lint workflow sha `fc364c3befdbc3c0a3e3e269dbedd9356232207e`");
    expect(doc).toContain("Semantic Versioning");
    expect(doc).toContain("Major version zero");
    expect(doc).toContain("public API should not be considered stable");
    expect(doc).toContain("v1 to v2 migration guide");
    expect(doc).toContain("both instances of JamAIBase running concurrently");
    expect(doc).toContain("CHANGELOG");
    expect(doc).toContain("CHANGED / FIXED");
    expect(doc).toContain("deprecated and/or removed");
    expect(doc).toContain("RAG references");
    expect(doc).toContain("model response");
    expect(doc).toContain("built-in LLM");
    expect(doc).toContain("vector embeddings");
    expect(doc).toContain("reranker orchestration");
    expect(doc).toContain("spreadsheet-like UI");
    expect(doc).toContain("Generative Tables");
    expect(doc).toContain("Action Tables");
    expect(doc).toContain("Knowledge Tables");
    expect(doc).toContain("Chat Tables");
    expect(doc).toContain("LanceDB");
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

  it("keeps JamAIBase repo evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "JamAIBase repo evidence alone cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("EmbeddedLLM/JamAIBase");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(HEAD);
    expect(manifestText).not.toContain(RELEASE);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific JamAIBase identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("EmbeddedLLM/JamAIBase");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain("JamAIBase");
      expect(source).not.toContain("JamAI Base");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
