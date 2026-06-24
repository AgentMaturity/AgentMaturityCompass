import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/source-reviews/GAP-0663-dbms-configuration-question-explainability.md";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
];

describe("GAP-0663 DBMS configuration question-explainability boundary", () => {
  it("documents primary source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0663");
    expect(doc).toContain("W7140756610");
    expect(doc).toContain("10.14778/3797919.3797940");
    expect(doc).toContain("https://arxiv.org/abs/2603.22708");
    expect(doc).toContain("VLDB 2026");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps the DBMS tuning paper bounded to existing question-score explainability", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("relevant to AMC only as source-review context for question-level score explainability");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("signed evidence rows");
    expect(doc).toContain("No DBMS tuning subsystem, configuration-rule miner, source-code analyzer");
    expect(doc).toContain("No upstream paper prose");
  });

  it("does not add source-specific DBMS tuning identifiers to explainability implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("SysInsight");
      expect(source).not.toContain("dbms_configuration_question_explainability");
      expect(source).not.toContain("W7140756610");
      expect(source).not.toContain("10.14778/3797919.3797940");
    }
  });
});
