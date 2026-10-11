import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AntiRollbackError, checkHighWater, highWaterPath, readHighWater, recordHighWater } from "../../src/keys/highWater.js";
import { loadTrustContext, signTrustList } from "../../src/trust/index.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

describe("high-water marks (P1-08 anti-rollback)", () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "amc-high-water-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("records the highest sequence with mode 0600 and never lowers it", () => {
    expect(recordHighWater("trust-list:org", 7, SHA_A, { amcHome: home })).toBe(true);
    expect(statSync(highWaterPath({ amcHome: home })).mode & 0o777).toBe(0o600);
    expect(recordHighWater("trust-list:org", 7, SHA_A, { amcHome: home })).toBe(true);
    expect(readHighWater("trust-list:org", { amcHome: home })).toMatchObject({ sequence: 7, sha256: SHA_A });
    const file = JSON.parse(readFileSync(highWaterPath({ amcHome: home }), "utf8"));
    expect(file).toMatchObject({ type: "amc.high-water", version: 1 });
  });

  it("refuses a lower sequence with ROLLBACK_DETECTED and other bytes at the same sequence with FORK_DETECTED", () => {
    recordHighWater("trust-list:org", 7, SHA_A, { amcHome: home });
    expect(() => checkHighWater("trust-list:org", 6, SHA_A, { amcHome: home })).toThrow(/ROLLBACK_DETECTED/);
    expect(() => recordHighWater("trust-list:org", 6, SHA_B, { amcHome: home })).toThrow(AntiRollbackError);
    expect(() => checkHighWater("trust-list:org", 7, SHA_B, { amcHome: home })).toThrow(/FORK_DETECTED/);
    expect(checkHighWater("trust-list:org", 8, SHA_B, { amcHome: home })).toMatchObject({ sequence: 7 });
    expect(readHighWater("trust-list:org", { amcHome: home })?.sequence).toBe(7);
  });

  it("refuses trust list sequence 6 after 7, and another list at sequence 7", () => {
    const root = testKey();
    const file = join(home, "list.json");
    const load = (sequence: number, subject = "test auditor") => {
      writeFileSync(file, JSON.stringify(signTrustList(trustList([listEntry(testKey(), { subject })], { sequence }), root.privateKeyPem)));
      return loadTrustContext({ amcHome: home, now: new Date("2026-10-06T00:00:00.000Z"), trustLists: [file], trustRoots: [root.keyId] });
    };
    expect(load(7).lists[0]?.sequence).toBe(7);
    expect(() => load(6)).toThrow(/ROLLBACK_DETECTED/);
    expect(() => load(7, "another list")).toThrow(/FORK_DETECTED/);
    expect(load(8).lists[0]?.sequence).toBe(8);
  });

  it("reads the state file only in its canonical encoding", () => {
    recordHighWater("k", 1, SHA_A, { amcHome: home });
    const path = highWaterPath({ amcHome: home });
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace('"sequence":1', '"sequence":9,"sequence":1'));
    expect(() => readHighWater("k", { amcHome: home })).toThrow(/not a valid/);
    writeFileSync(path, JSON.stringify(JSON.parse(text), null, 2));
    expect(() => readHighWater("k", { amcHome: home })).toThrow(/not a valid/);
  });

  it("fails closed on a symlinked, malformed or unreadable state file", () => {
    const path = highWaterPath({ amcHome: home });
    mkdirSync(join(home, "state"), { recursive: true });
    const elsewhere = join(home, "elsewhere.json");
    writeFileSync(elsewhere, JSON.stringify({ type: "amc.high-water", version: 1, entries: {} }));
    symlinkSync(elsewhere, path);
    expect(() => readHighWater("k", { amcHome: home })).toThrow(/unreadable/);
    rmSync(path);
    writeFileSync(path, "{not json");
    expect(() => readHighWater("k", { amcHome: home })).toThrow(/not a valid amc.high-water/);
    expect(() => recordHighWater("k", 1, SHA_A, { amcHome: home })).toThrow(/not a valid/);
  });

  it("keeps deciding, and warns once, when AMC home is read-only", () => {
    if (process.getuid?.() === 0) return; // root ignores directory modes
    const state = join(home, "state");
    mkdirSync(state, { recursive: true });
    chmodSync(state, 0o500);
    try {
      expect(recordHighWater("k", 1, SHA_A, { amcHome: home })).toBe(false);
    } finally {
      chmodSync(state, 0o700);
    }
  });
});
