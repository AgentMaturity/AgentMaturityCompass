import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreMemorySecurityArchitecture } from "../../src/score/memorySecurityArchitecture.js";

describe("memorySecurityArchitecture", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreMemorySecurityArchitecture(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects memory isolation via Dockerfile", () => {
    writeFileSync(join(tmp, "Dockerfile"), "FROM node:20");
    const r = scoreMemorySecurityArchitecture(tmp);
    expect(r.hasMemoryIsolation).toBe(true);
  });

  it("detects crypto provenance via src/receipts dir", () => {
    mkdirSync(join(tmp, "src/receipts"), { recursive: true });
    const r = scoreMemorySecurityArchitecture(tmp);
    expect(r.hasCryptoProvenance).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/sandbox"), { recursive: true });
    mkdirSync(join(tmp, "src/receipts"), { recursive: true });
    mkdirSync(join(tmp, "src/ledger"), { recursive: true });
    mkdirSync(join(tmp, "src/monitor"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, ".amc/snapshots"), { recursive: true });
    writeFileSync(join(tmp, "src/monitor/accessPatterns.ts"), "");
    writeFileSync(join(tmp, "src/score/memoryIntegrity.ts"), "");
    const r = scoreMemorySecurityArchitecture(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
