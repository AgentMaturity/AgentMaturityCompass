import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreKernelSandboxMaturity } from "../../src/score/kernelSandboxMaturity.js";

describe("kernelSandboxMaturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreKernelSandboxMaturity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects sandbox_profile.json as OS isolation + fs + network + profile", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, ".amc/sandbox_profile.json"), "{}");
    const r = scoreKernelSandboxMaturity(tmp);
    expect(r.hasOSLevelIsolation).toBe(true);
    expect(r.hasFilesystemRestrictions).toBe(true);
    expect(r.hasNetworkIsolation).toBe(true);
    expect(r.hasSandboxProfile).toBe(true);
  });

  it("detects vault dir as secret injection", () => {
    mkdirSync(join(tmp, "src/vault"), { recursive: true });
    const r = scoreKernelSandboxMaturity(tmp);
    expect(r.hasSecretInjection).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    mkdirSync(join(tmp, "src/vault"), { recursive: true });
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    writeFileSync(join(tmp, ".amc/sandbox_profile.json"), "{}");
    writeFileSync(join(tmp, "src/assurance/packs/compoundThreatPack.ts"), "");
    const r = scoreKernelSandboxMaturity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
