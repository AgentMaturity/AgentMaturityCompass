import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreFailSecureGovernance } from "../../src/score/failSecureGovernance.js";

describe("failSecureGovernance", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreFailSecureGovernance(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects enforce dir as fail-closed", () => {
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    const r = scoreFailSecureGovernance(tmp);
    expect(r.failsClosedByDefault).toBe(true);
    expect(r.hasExcessiveAgencyControls).toBe(true);
  });

  it("detects tool allowlist", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, ".amc/tool_allowlist.json"), "[]");
    const r = scoreFailSecureGovernance(tmp);
    expect(r.hasToolCallWhitelist).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    mkdirSync(join(tmp, "src/ops"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/approvals"), { recursive: true });
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, "src/ops/circuitBreaker.ts"), "");
    writeFileSync(join(tmp, "ACTION_POLICY.md"), "");
    writeFileSync(join(tmp, ".amc/tool_allowlist.json"), "[]");
    writeFileSync(join(tmp, "src/ops/rateLimiter.ts"), "");
    writeFileSync(join(tmp, "src/score/modelDrift.ts"), "");
    writeFileSync(join(tmp, ".amc/ACTION_AUDIT.md"), "");
    writeFileSync(join(tmp, "src/assurance/packs/governanceBypassPack.ts"), "");
    const r = scoreFailSecureGovernance(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
