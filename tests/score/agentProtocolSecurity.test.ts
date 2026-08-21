import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreAgentProtocolSecurity } from "../../src/score/agentProtocolSecurity.js";
import { markAsAmcCheckout } from "../helpers/amcCheckout.js";

describe("agentProtocolSecurity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreAgentProtocolSecurity(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects protocol inventory via ADAPTERS.md", () => {
    writeFileSync(join(tmp, "ADAPTERS.md"), "# Adapters");
    const r = scoreAgentProtocolSecurity(tmp);
    expect(r.hasProtocolInventory).toBe(true);
  });

  it("detects protocol authZ via src/enforce dir", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    const r = scoreAgentProtocolSecurity(tmp);
    expect(r.hasProtocolAuthZ).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    mkdirSync(join(tmp, "src/auth"), { recursive: true });
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    mkdirSync(join(tmp, "src/audit"), { recursive: true });
    mkdirSync(join(tmp, "src/protocols"), { recursive: true });
    writeFileSync(join(tmp, "src/enforce/inputValidator.ts"), "");
    mkdirSync(join(tmp, "src/product"), { recursive: true });
    writeFileSync(join(tmp, "src/product/toolRateLimiter.ts"), "");
    writeFileSync(join(tmp, "src/protocols/versionPin.ts"), "");
    const r = scoreAgentProtocolSecurity(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
