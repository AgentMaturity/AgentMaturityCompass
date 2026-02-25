import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreAdaptiveAccessControl } from "../../src/score/adaptiveAccessControl.js";

describe("adaptiveAccessControl", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreAdaptiveAccessControl(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects behavior profiling via .amc/behavior_profiles/ dir", () => {
    mkdirSync(join(tmp, ".amc/behavior_profiles"), { recursive: true });
    const r = scoreAdaptiveAccessControl(tmp);
    expect(r.hasBehaviorProfiling).toBe(true);
  });

  it("detects contextual permissions via src/auth/contextAwareAuth.ts", () => {
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    writeFileSync(join(tmp, "src/auth/contextAwareAuth.ts"), "");
    const r = scoreAdaptiveAccessControl(tmp);
    expect(r.hasContextualPermissions).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc/behavior_profiles"), { recursive: true });
    mkdirSync(join(tmp, ".amc/policy_versions"), { recursive: true });
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    mkdirSync(join(tmp, "src/ops"), { recursive: true });
    writeFileSync(join(tmp, "src/enforce/learnedPolicies.ts"), "");
    writeFileSync(join(tmp, "src/enforce/policyStaging.ts"), "");
    writeFileSync(join(tmp, "src/enforce/anomalyDenial.ts"), "");
    writeFileSync(join(tmp, "src/auth/contextAwareAuth.ts"), "");
    const r = scoreAdaptiveAccessControl(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
