import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0930-scouter-public-methodology.md";
const REPO = "demml/scouter";
const URL = "https://github.com/demml/scouter";
const TITLE = "scouter";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0930 scouter public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0930");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 48");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("2,988 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain(".github");
    expect(doc).toContain("crates");
    expect(doc).toContain("docker");
    expect(doc).toContain("docs");
    expect(doc).toContain("images");
    expect(doc).toContain("py-scouter");
    expect(doc).toContain("setup");
    expect(doc).toContain("AGENTS.md");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("Cargo.lock");
    expect(doc).toContain("Cargo.toml");
    expect(doc).toContain("LICENSE.md");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("Releases 62");
    expect(doc).toContain("v0.25.0");
    expect(doc).toContain("Mar 26, 2026");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Rust 68.2%");
    expect(doc).toContain("Python 31.0%");
    expect(doc).toContain("Other 0.8%");
    expect(doc).toContain("Developer-First ML Monitoring, Observability, and Agent Evaluation");
    expect(doc).toContain("Monitoring, Evaluation and Observability for AI Applications");
    expect(doc).toContain("Population Stability Index (PSI)");
    expect(doc).toContain("Custom Metrics");
    expect(doc).toContain("Distributed Tracing");
    expect(doc).toContain("Offline Evaluation");
    expect(doc).toContain("Online Evaluation");
    expect(doc).toContain("AssertionTask");
    expect(doc).toContain("LLMJudgeTask");
    expect(doc).toContain("TraceAssertionTask");
    expect(doc).toContain("OpenTelemetry Compatible");
    expect(doc).toContain("Postgres");
    expect(doc).toContain("PyO3");
    expect(doc).toContain("Kafka");
    expect(doc).toContain("RabbitMQ");
    expect(doc).toContain("Redis");
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

  it("keeps observability toolkit metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Scouter observability metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("scouter_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("scouter_public_methodology");
    }
  });
});
