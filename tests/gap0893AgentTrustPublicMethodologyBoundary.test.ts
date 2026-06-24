import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0893-agenttrust-public-methodology.md";
const REPO = "chenglin1112/AgentTrust";
const URL = "https://github.com/chenglin1112/AgentTrust";
const TITLE = "AgentTrust";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0893 AgentTrust public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0893");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Unknown, Apache-2.0 licenses found");
    expect(doc).toContain("AGPL-3.0-or-later");
    expect(doc).toContain("Apache-2.0 legacy");
    expect(doc).toContain("Star 21");
    expect(doc).toContain("Fork 7");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("32 Commits");
    expect(doc).toContain("1 tags");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("experiments");
    expect(doc).toContain("src/ agent_trust");
    expect(doc).toContain("tests");
    expect(doc).toContain("LICENSE-Apache-2.0-legacy");
    expect(doc).toContain("deterministic safety floor");
    expect(doc).toContain("capability-control");
    expect(doc).toContain("tool-using AI agents");
    expect(doc).toContain("SafeFix");
    expect(doc).toContain("RiskChain");
    expect(doc).toContain("LLM-as-Judge");
    expect(doc).toContain("Self-Learning");
    expect(doc).toContain("42 risk patterns");
    expect(doc).toContain("174 policy rules");
    expect(doc).toContain("37 SafeFix rules");
    expect(doc).toContain("7 chain detectors");
    expect(doc).toContain("300 benchmark scenarios");
    expect(doc).toContain("630 held-out test scenarios");
    expect(doc).toContain("410 unit tests");
    expect(doc).toContain("~0.3ms median latency");
    expect(doc).toContain("MCP");
    expect(doc).toContain("public methodology versioning");
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

  it("keeps AgentTrust metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("AgentTrust safety-gate metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("agenttrust_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("agenttrust_public_methodology");
    }
  });
});
