import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * G1-18: unifiedRun carried six module scorers that graded a surface purely by
 * whether config files existed (policy.yaml +40, a .sig +20, guardrails +40).
 * They were dead — the live path is inspectUnifiedConfiguredSurfaces, which
 * performs real signature verification and ledger-integrity checks — but they
 * remained as a ready-made file-existence grader for any future caller.
 */
describe("unified run grades verification, not file presence", () => {
  const source = readFileSync(new URL("../src/unified/unifiedRun.ts", import.meta.url), "utf8");
  const inspection = readFileSync(
    new URL("../src/unified/unifiedSurfaceInspection.ts", import.meta.url),
    "utf8"
  );

  it("no longer defines file-existence module scorers", () => {
    for (const fn of [
      "runEnforceModule",
      "runVaultModule",
      "runWatchModule",
      "runFleetModule",
      "runPassportModule",
      "runComplyModule"
    ]) {
      expect(source).not.toContain(`function ${fn}(`);
    }
  });

  it("no longer awards points merely for a config file existing", () => {
    expect(source).not.toContain("if (hasPolicyFile) score += 40;");
    expect(source).not.toContain("let score = 50; // vault exists");
  });

  it("the surviving surface path verifies signatures and ledger integrity", () => {
    expect(inspection).toContain("verifyActionPolicySignature");
    expect(inspection).toContain("verifyLedgerIntegrity");
    expect(inspection).toContain("verifyComplianceMapsSignature");
  });

  it("still runs the real diagnostic for the Score surface", () => {
    expect(source).toContain("runDiagnostic");
    expect(source).toContain("runScoreModule");
  });
});
