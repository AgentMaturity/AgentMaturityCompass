import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreOWASPLLMCoverage } from "../../src/score/owaspLLMCoverage.js";

describe("owaspLLMCoverage", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero coverage for empty directory", () => {
    const r = scoreOWASPLLMCoverage(tmp);
    expect(r.score).toBe(0);
    expect(r.coveredCount).toBe(0);
    expect(r.uncoveredRisks).toHaveLength(10);
    expect(r.gaps.length).toBeGreaterThan(0);
  });

  it("detects partial coverage", () => {
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    writeFileSync(join(tmp, "src/assurance/packs/injectionPack.ts"), "");
    const r = scoreOWASPLLMCoverage(tmp);
    expect(r.llm01_promptInjection).toBe(true);
    expect(r.coveredCount).toBe(1);
    expect(r.uncoveredRisks).toHaveLength(9);
    expect(r.score).toBe(10);
  });

  it("returns full coverage when all artifacts present", () => {
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/ops"), { recursive: true });
    writeFileSync(join(tmp, "src/assurance/packs/injectionPack.ts"), "");
    writeFileSync(join(tmp, "src/score/outputIntegrityMaturity.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/ragPoisoningPack.ts"), "");
    writeFileSync(join(tmp, "src/ops/circuitBreaker.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/sbomSupplyChainPack.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/dlpExfiltrationPack.ts"), "");
    writeFileSync(join(tmp, "src/score/mcpCompliance.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/governanceBypassPack.ts"), "");
    writeFileSync(join(tmp, "src/score/humanOversightQuality.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/exfiltrationPack.ts"), "");
    const r = scoreOWASPLLMCoverage(tmp);
    expect(r.coveredCount).toBe(10);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.uncoveredRisks).toHaveLength(0);
    expect(r.gaps).toHaveLength(0);
  });
});
