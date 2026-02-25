import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreBehavioralContractMaturity } from "../../src/score/behavioralContractMaturity.js";

describe("behavioralContractMaturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreBehavioralContractMaturity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.hasAlignmentCard).toBe(false);
    expect(r.hasPermittedActions).toBe(false);
    expect(r.hasForbiddenActions).toBe(false);
    expect(r.hasEscalationTriggers).toBe(false);
    expect(r.hasValueDeclarations).toBe(false);
    expect(r.hasRuntimeIntegrityCheck).toBe(false);
    expect(r.hasDriftProfile).toBe(false);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects alignment card with all fields", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(
      join(tmp, ".amc/alignment_card.json"),
      JSON.stringify({
        permitted: ["read"],
        forbidden: ["delete"],
        escalationTriggers: ["error"],
        values: ["accuracy"],
      }),
    );
    const r = scoreBehavioralContractMaturity(tmp);
    expect(r.hasAlignmentCard).toBe(true);
    expect(r.hasPermittedActions).toBe(true);
    expect(r.hasForbiddenActions).toBe(true);
    expect(r.hasEscalationTriggers).toBe(true);
    expect(r.hasValueDeclarations).toBe(true);
  });

  it("detects ACTION_POLICY.md as permitted + forbidden", () => {
    writeFileSync(join(tmp, "ACTION_POLICY.md"), "# Policy");
    const r = scoreBehavioralContractMaturity(tmp);
    expect(r.hasAlignmentCard).toBe(true);
    expect(r.hasPermittedActions).toBe(true);
    expect(r.hasForbiddenActions).toBe(true);
  });

  it("detects CAPABILITY_MANIFEST.md as value declarations", () => {
    writeFileSync(join(tmp, "CAPABILITY_MANIFEST.md"), "# Manifest");
    const r = scoreBehavioralContractMaturity(tmp);
    expect(r.hasAlignmentCard).toBe(true);
    expect(r.hasValueDeclarations).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(
      join(tmp, ".amc/alignment_card.json"),
      JSON.stringify({
        permitted: ["read"],
        forbidden: ["delete"],
        escalationTriggers: ["error"],
        values: ["accuracy"],
      }),
    );
    writeFileSync(join(tmp, "ACTION_POLICY.md"), "# Policy");
    writeFileSync(join(tmp, "CAPABILITY_MANIFEST.md"), "# Manifest");
    writeFileSync(join(tmp, ".amc/ACTION_AUDIT.md"), "# Audit");
    writeFileSync(join(tmp, ".amc/PREDICTION_LOG.md"), "# Predictions");
    const r = scoreBehavioralContractMaturity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
