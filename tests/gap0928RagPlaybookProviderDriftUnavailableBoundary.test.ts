import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0928-rag-playbook-provider-drift-unavailable.md";
const REPO = "anusky95/rag-playbook";
const URL = "https://github.com/anusky95/rag-playbook";
const TITLE = "rag-playbook";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

describe("GAP-0928 rag-playbook provider-drift unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0928");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("GitHub repository page");
    expect(doc).toContain("GitHub Search/API path");
    expect(doc).toContain("shell network remains DNS-restricted");
    expect(doc).toContain("Could not resolve host: github.com");
    expect(doc).toContain("The ultimate open-source RAG");
    expect(doc).toContain("TRUST framework");
    expect(doc).toContain("enterprise AI");
    expect(doc).toContain("production-grade demos");
    expect(doc).toContain("end-to-end retrieval, evaluation, and governance");
    expect(doc).toContain("skipped as provider-drift implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create provider-drift behavior from unavailable repository metadata", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("Provider/model drift is relevant to AMC through existing Score, Shield, and Watch primitives");
    expect(doc).toContain("Unavailable repository metadata alone must fail closed");
    expect(doc).toContain("No rag-playbook adapter");
    expect(doc).toContain("No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, Watch monitor, Shield verifier, or scoring code changed");
  });

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_playbook_provider_drift");
    }
  });
});
