import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreTrustAuthorizationSync } from "../../src/score/trustAuthorizationSync.js";

describe("trustAuthorizationSync", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreTrustAuthorizationSync(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects dynamic permissions via .amc/dynamic_permissions.json", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, ".amc/dynamic_permissions.json"), "{}");
    const r = scoreTrustAuthorizationSync(tmp);
    expect(r.hasDynamicPermissions).toBe(true);
  });

  it("detects trust signal integration via src/trust dir", () => {
    mkdirSync(join(tmp, "src/trust"), { recursive: true });
    const r = scoreTrustAuthorizationSync(tmp);
    expect(r.hasTrustSignalIntegration).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    mkdirSync(join(tmp, "src/trust"), { recursive: true });
    mkdirSync(join(tmp, "src/audit"), { recursive: true });
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    mkdirSync(join(tmp, "src/monitor"), { recursive: true });
    writeFileSync(join(tmp, ".amc/dynamic_permissions.json"), "{}");
    writeFileSync(join(tmp, "src/enforce/permissionDecay.ts"), "");
    writeFileSync(join(tmp, ".amc/trust_permission_audit.jsonl"), "");
    writeFileSync(join(tmp, "src/auth/contextAwareAuth.ts"), "");
    writeFileSync(join(tmp, "src/monitor/trustDivergence.ts"), "");
    writeFileSync(join(tmp, "src/trust/recalibration.ts"), "");
    const r = scoreTrustAuthorizationSync(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
