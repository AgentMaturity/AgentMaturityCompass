import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0670-sta-conditional-commitment-replay-corpus.md";
const DOI = "10.5281/zenodo.20063055";
const OPENALEX = "W7160493853";
const TITLE = "STA Conditional Commitment Architecture for Output-Mediated and Multi-Agent AI Systems";

const implementationFiles = [
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

describe("GAP-0670 STA conditional commitment replay-corpus boundary", () => {
  it("documents unresolved live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0670");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live primary source was not reachable");
    expect(doc).toContain("metadata-only source signal");
    expect(doc).toContain("Status: skipped");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps unresolved STA metadata out of replay-corpus product scope", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("No replay-corpus product code changed");
    expect(doc).toContain("No Signal-Time-Authority framework, commitment architecture");
    expect(doc).toContain("Accepted replay claims still require AMC-owned manifests");
    expect(doc).toContain("The local backlog row remains a triage pointer");
  });

  it("does not add source-specific STA identifiers to replay implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("zenodo.20063055");
      expect(source).not.toContain("Signal-Time-Authority");
      expect(source).not.toContain("conditional_commitment");
      expect(source).not.toContain("sta_conditional_commitment");
    }
  });
});
