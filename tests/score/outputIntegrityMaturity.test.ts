import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreOutputIntegrityMaturity } from "../../src/score/outputIntegrityMaturity.js";

describe("outputIntegrityMaturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreOutputIntegrityMaturity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects truthguard dir as output validation", () => {
    mkdirSync(join(tmp, "src/truthguard"), { recursive: true });
    const r = scoreOutputIntegrityMaturity(tmp);
    expect(r.hasOutputValidation).toBe(true);
  });

  it("detects partial artifacts", () => {
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    writeFileSync(join(tmp, "src/enforce/sanitizer.ts"), "");
    writeFileSync(join(tmp, "src/enforce/codeExecutionGuard.ts"), "");
    const r = scoreOutputIntegrityMaturity(tmp);
    expect(r.hasOutputSanitization).toBe(true);
    expect(r.hasCodeExecutionGuard).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
    expect(r.gaps.length).toBeGreaterThan(0);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/truthguard"), { recursive: true });
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/receipts"), { recursive: true });
    writeFileSync(join(tmp, "src/enforce/sanitizer.ts"), "");
    writeFileSync(join(tmp, "src/score/confidenceDrift.ts"), "");
    writeFileSync(join(tmp, "src/score/claimProvenance.ts"), "");
    writeFileSync(join(tmp, "src/enforce/codeExecutionGuard.ts"), "");
    writeFileSync(join(tmp, "src/types.ts"), "");
    const r = scoreOutputIntegrityMaturity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
