import { describe, expect, test } from "vitest";
import { assurancePackIdSchema } from "../src/assurance/assuranceSchema.js";
import { evidenceArtifactTypeSchema, isEvidenceArtifactType } from "../src/assurance/evidenceArtifactSchema.js";
import { transparencyEntrySchema } from "../src/transparency/logSchema.js";

describe("assurance evidence artifact schema", () => {
  test("accepts Garak and generic vulnerability scan report artifact types", () => {
    expect(evidenceArtifactTypeSchema.parse("garak-scan-report")).toBe("garak-scan-report");
    expect(evidenceArtifactTypeSchema.parse("vulnerability-scan-report")).toBe("vulnerability-scan-report");
    expect(isEvidenceArtifactType("garak-scan-report")).toBe(true);
    expect(isEvidenceArtifactType("vulnerability-scan-report")).toBe(true);
  });

  test("rejects unsupported artifact types", () => {
    expect(isEvidenceArtifactType("unsupported-scan-report")).toBe(false);
    expect(() => evidenceArtifactTypeSchema.parse("unsupported-scan-report")).toThrow();
  });
});

describe("transparency schema artifact kinds", () => {
  test("accepts scanner report artifact kinds", () => {
    const base = {
      v: 1 as const,
      ts: 1,
      type: "LLM_SECURITY_SCAN",
      agentId: "agent-security",
      prev: "",
      hash: "a".repeat(64)
    };

    expect(
      transparencyEntrySchema.parse({
        ...base,
        artifact: { kind: "garak-scan-report", sha256: "b".repeat(64) }
      }).artifact.kind
    ).toBe("garak-scan-report");

    expect(
      transparencyEntrySchema.parse({
        ...base,
        artifact: { kind: "vulnerability-scan-report", sha256: "c".repeat(64) }
      }).artifact.kind
    ).toBe("vulnerability-scan-report");
  });
});

describe("assurance schema pack ids", () => {
  test("includes context leakage pack id", () => {
    expect(assurancePackIdSchema.parse("context-leakage")).toBe("context-leakage");
  });
});
