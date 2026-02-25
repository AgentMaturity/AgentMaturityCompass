import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreMonitorBypassResistance } from "../../src/score/monitorBypassResistance.js";

describe("monitorBypassResistance", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreMonitorBypassResistance(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects multi-layer monitoring via src/monitor dir", () => {
    mkdirSync(join(tmp, "src/monitor"), { recursive: true });
    const r = scoreMonitorBypassResistance(tmp);
    expect(r.hasMultiLayerMonitoring).toBe(true);
  });

  it("detects monitor redundancy via 2+ files in src/monitor/", () => {
    mkdirSync(join(tmp, "src/monitor"), { recursive: true });
    writeFileSync(join(tmp, "src/monitor/a.ts"), "");
    writeFileSync(join(tmp, "src/monitor/b.ts"), "");
    const r = scoreMonitorBypassResistance(tmp);
    expect(r.hasMonitorRedundancy).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, "src/monitor"), { recursive: true });
    mkdirSync(join(tmp, "src/truthguard"), { recursive: true });
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    mkdirSync(join(tmp, "src/assurance/packs"), { recursive: true });
    writeFileSync(join(tmp, "src/score/modelDrift.ts"), "");
    writeFileSync(join(tmp, "src/monitor/a.ts"), "");
    writeFileSync(join(tmp, "src/monitor/b.ts"), "");
    writeFileSync(join(tmp, "src/monitor/proxyDetector.ts"), "");
    writeFileSync(join(tmp, "src/assurance/packs/governanceBypassPack.ts"), "");
    const r = scoreMonitorBypassResistance(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
