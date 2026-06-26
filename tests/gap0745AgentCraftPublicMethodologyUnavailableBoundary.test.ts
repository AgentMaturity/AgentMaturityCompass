import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0745-agentcraft-public-methodology-unavailable.md";
const DOI = "10.1145/3742414.3794957";
const OPENALEX = "W7134257403";
const TITLE = "AgentCraft: Workshop on Developing Trustworthy Agentic AI Systems";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0745 AgentCraft public-methodology unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0745");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, ACM publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("ACM DOI page returned `403`");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("trustworthy agentic systems");
    expect(doc).toContain("workflow");
    expect(doc).toContain("debugging");
    expect(doc).toContain("knowledge management");
    expect(doc).toContain("human-computer interaction");
    expect(doc).toContain("engineering ethics");
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

  it("does not create an AMC public-methodology version bump from unavailable metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No workshop importer, agent-building framework, trustworthy-agent workflow");

    expect(manifestText).not.toContain(DOI);
    expect(manifestText).not.toContain(OPENALEX);
    expect(manifestText).not.toContain("agentcraft_public_methodology");
    expect(manifestText).not.toContain("trustworthy_agentic_systems");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("agentcraft_public_methodology");
      expect(source).not.toContain("trustworthy_agentic_systems");
    }
  });
});
