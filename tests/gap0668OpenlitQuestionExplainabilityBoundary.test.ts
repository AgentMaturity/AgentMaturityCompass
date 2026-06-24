import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0668-openlit-question-explainability.md";
const SOURCE = "openlit/openlit";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
  "src/watch/liveDriftAlerts.ts",
  "src/vault/vault.ts",
];

describe("GAP-0668 OpenLIT question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0668");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("OpenTelemetry-native LLM observability");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps OpenLIT context bounded to existing AMC question explainability proof", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("trace/receipt/source previews");
    expect(doc).toContain("No OpenLIT SDK integration, OpenTelemetry collector");
    expect(doc).toContain("No upstream code, README/docs prose");
  });

  it("does not add OpenLIT-specific identifiers to diagnostic, Watch, Vault, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("OpenLIT");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("openlit_question_explainability");
    }
  });
});
