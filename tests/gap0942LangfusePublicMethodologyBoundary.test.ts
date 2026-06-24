import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0942-langfuse-public-methodology.md";
const SOURCE = "Langfuse";
const URL = "https://langfuse.com";
const IDENTIFIER = "langfuse_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0942 Langfuse public-methodology boundary", () => {
  it("documents live product metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0942");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(URL);
    expect(doc).toContain("live Langfuse homepage");
    expect(doc).toContain("by ClickHouse");
    expect(doc).toContain("GitHub Stars 29.5k");
    expect(doc).toContain("Contributors 300+");
    expect(doc).toContain("Community Q&A threads 1.8k");
    expect(doc).toContain("Roadmap threads 1.6k");
    expect(doc).toContain("Latest OSS release 2 days ago");
    expect(doc).toContain("Open Source AI Engineering Platform");
    expect(doc).toContain("Trace and evaluate AI Agents");
    expect(doc).toContain("Used by 19 of Fortune 50");
    expect(doc).toContain("10+ billion observations/month");
    expect(doc).toContain("100,000+ engineers");
    expect(doc).toContain("observability, prompts, evals, experiments, and human annotation");
    expect(doc).toContain("Hierarchical traces");
    expect(doc).toContain("LLM-as-a-judge");
    expect(doc).toContain("heuristic functions");
    expect(doc).toContain("human review");
    expect(doc).toContain("one-click deployments and rollbacks");
    expect(doc).toContain("golden datasets");
    expect(doc).toContain("100+ integrations");
    expect(doc).toContain("OTel");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("All product features MIT licensed");
    expect(doc).toContain("REST APIs for everything");
    expect(doc).toContain("Query SDK");
    expect(doc).toContain("S3 blob storage export");
    expect(doc).toContain("Clickhouse OLAP database");
    expect(doc).toContain("Async ingestion via Redis queue");
    expect(doc).toContain("50M+ SDK installs/month");
    expect(doc).toContain("99.9% uptime");
    expect(doc).toContain("SOC 2 Type II");
    expect(doc).toContain("ISO 27001");
    expect(doc).toContain("GDPR");
    expect(doc).toContain("EU & US Data Regions");
    expect(doc).toContain("HIPAA eligible");
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

  it("keeps Langfuse product metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Langfuse product metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain(IDENTIFIER);
    expect(manifestText).not.toContain("COMP-002");
  });

  it("keeps this source-specific methodology identifier out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("COMP-002");
    }
  });
});
