import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreRuntimeIdentityMaturity } from "../../src/score/runtimeIdentityMaturity.js";

describe("runtimeIdentityMaturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreRuntimeIdentityMaturity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects CAPABILITY_MANIFEST as agent identity binding", () => {
    writeFileSync(join(tmp, "CAPABILITY_MANIFEST.md"), "");
    const r = scoreRuntimeIdentityMaturity(tmp);
    expect(r.hasAgentIdentityBinding).toBe(true);
  });

  it("detects auth dir as user identity propagation", () => {
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    const r = scoreRuntimeIdentityMaturity(tmp);
    expect(r.hasUserIdentityPropagation).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    mkdirSync(join(tmp, "src/ledger"), { recursive: true });
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, "CAPABILITY_MANIFEST.md"), "");
    writeFileSync(join(tmp, ".amc/ACTION_AUDIT.md"), "");
    writeFileSync(join(tmp, "src/auth/jitCredentials.ts"), "");
    writeFileSync(join(tmp, "src/auth/revocation.ts"), "");
    const r = scoreRuntimeIdentityMaturity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
