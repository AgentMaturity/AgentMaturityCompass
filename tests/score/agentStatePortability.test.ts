import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreAgentStatePortability } from "../../src/score/agentStatePortability.js";

describe("agentStatePortability", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const r = scoreAgentStatePortability(tmp);
    expect(r.score).toBe(0);
    expect(r.level).toBe(0);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("detects snapshots dir as serializable state + versioning", () => {
    mkdirSync(join(tmp, ".amc/snapshots"), { recursive: true });
    const r = scoreAgentStatePortability(tmp);
    expect(r.hasSerializableState).toBe(true);
    expect(r.hasStateVersioning).toBe(true);
  });

  it("detects state_spec.json as vendor-neutral format", () => {
    mkdirSync(join(tmp, ".amc"), { recursive: true });
    writeFileSync(join(tmp, ".amc/state_spec.json"), "{}");
    const r = scoreAgentStatePortability(tmp);
    expect(r.hasVendorNeutralFormat).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    mkdirSync(join(tmp, ".amc/snapshots"), { recursive: true });
    mkdirSync(join(tmp, ".amc/state/versions"), { recursive: true });
    mkdirSync(join(tmp, "tests/portability"), { recursive: true });
    mkdirSync(join(tmp, "src/adapters"), { recursive: true });
    writeFileSync(join(tmp, ".amc/state_spec.json"), "{}");
    writeFileSync(join(tmp, ".amc/snapshot_hashes.json"), "{}");
    const r = scoreAgentStatePortability(tmp);
    expect(r.score).toBe(100);
    expect(r.level).toBe(5);
    expect(r.gaps).toHaveLength(0);
  });
});
