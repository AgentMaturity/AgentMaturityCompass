import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AntiRollbackError, checkHighWater, highWaterPath, readHighWater, recordHighWater } from "../../src/keys/highWater.js";
import { loadTrustContext, signTrustList } from "../../src/trust/index.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";
import { existsSync } from "node:fs";
import { addPublicKeyToHistory, ensureSigningKeys, getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, verifyKeyHistoryChain } from "../../src/crypto/keys.js";
import { encodeSignedRevocationList, signRevocationList } from "../../src/keys/revocationList.js";
import { issueLeaseForCli, verifyLeaseForCli } from "../../src/leases/leaseCli.js";
import { bootstrapLeaseRevocations, leaseRevocationPaths, readVerifiedLeaseRevocations, revokeLease } from "../../src/leases/leaseStore.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

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

describe("lease revocation rollback attacks (P1-08; security review HIGH)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
    rmSync(highWaterPath(), { force: true });
  });
  function revokedWorkspace(): { root: string; token: string; leaseId: string; older: Buffer } {
    const root = mkdtempSync(join(tmpdir(), "amc-rollback-"));
    roots.push(root);
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    revokeLease(root, "lease-earlier", "first revocation");
    const older = readFileSync(leaseRevocationPaths(root).file);
    const token = issueLeaseForCli({ workspace: root, agentId: "default", ttl: "1h", scopes: "gateway:llm", routes: "/openai", models: "*", rpm: 10, tpm: 1000 }).token;
    const leaseId = (verifyLeaseForCli({ workspace: root, token }).payload as { leaseId: string }).leaseId;
    revokeLease(root, leaseId, "compromised");
    expect(verifyLeaseForCli({ workspace: root, token }).error).toBe("lease revoked");
    return { root, token, leaseId, older };
  }
  const refusedAndStaysRevoked = (root: string, token: string, reason: RegExp) => {
    expect(readVerifiedLeaseRevocations(root)).toEqual({ ok: false, reason: expect.stringMatching(reason) });
    expect(verifyLeaseForCli({ workspace: root, token }).ok).toBe(false);
    // The next revoke cannot make the rollback permanent.
    // Refused at the revocation list, or earlier, at the signing key, when the attack also broke this machine's marks.
    expect(() => revokeLease(root, "lease-later", "after the attack")).toThrow(/unverifiable|anti-rollback state/);
  };

  it("replaying the older validly signed list is ROLLBACK_DETECTED and the lease stays revoked", () => {
    const { root, token, older } = revokedWorkspace();
    writeFileSync(leaseRevocationPaths(root).file, older);
    refusedAndStaysRevoked(root, token, /ROLLBACK_DETECTED.*sequence 1 is older than the accepted sequence 2/);
  });

  it("deleting the store files never reads as an empty bootstrap once a list was anchored", () => {
    const { root, token } = revokedWorkspace();
    const paths = leaseRevocationPaths(root);
    for (const path of [paths.file, paths.legacyFile, paths.legacySig]) rmSync(path, { force: true });
    refusedAndStaysRevoked(root, token, /ROLLBACK_DETECTED: leases:default is missing, but sequence 2 was accepted before/);
    expect(() => bootstrapLeaseRevocations(root)).toThrow(/ROLLBACK_DETECTED/);
    expect(existsSync(paths.file)).toBe(false);
  });

  it("with the high-water anchor deleted, the transparency log still refuses the older list and the deleted store", () => {
    const { root, token, older } = revokedWorkspace();
    rmSync(highWaterPath());
    writeFileSync(leaseRevocationPaths(root).file, older);
    refusedAndStaysRevoked(root, token, /ROLLBACK_DETECTED: leases:default in the workspace transparency log sequence 1 is older than the accepted sequence 2/);
    rmSync(leaseRevocationPaths(root).file);
    expect(readVerifiedLeaseRevocations(root)).toEqual({ ok: false, reason: expect.stringMatching(/ROLLBACK_DETECTED: leases:default is missing/) });
  });

  it("a symlinked anchor fails closed, even when it points at a valid mark", () => {
    const { root, token } = revokedWorkspace();
    const path = highWaterPath();
    const copy = join(dirname(path), "copy.json");
    writeFileSync(copy, readFileSync(path));
    rmSync(path);
    symlinkSync(copy, path);
    refusedAndStaysRevoked(root, token, /anti-rollback state .* is unreadable/);
  });

  it("another validly signed list at the accepted sequence is FORK_DETECTED", () => {
    const { root, token } = revokedWorkspace();
    const path = leaseRevocationPaths(root).file;
    const { list, anchor } = JSON.parse(readFileSync(path, "utf8"));
    const forked = signRevocationList({ ...list, revoked: list.revoked.slice(0, 1) }, getPrivateKeyPem(root, "auditor"));
    writeFileSync(path, encodeSignedRevocationList({ ...forked, anchor }));
    refusedAndStaysRevoked(root, token, /FORK_DETECTED/);
    // An altered anchor on the accepted list is a different file at the same sequence too.
    rmSync(highWaterPath());
    const original = signRevocationList(list, getPrivateKeyPem(root, "auditor"));
    writeFileSync(path, encodeSignedRevocationList({ ...original, anchor: { transparencyEntryHash: "0".repeat(64) } }));
    expect(readVerifiedLeaseRevocations(root)).toEqual({ ok: false, reason: expect.stringMatching(/FORK_DETECTED.*names transparency entry/) });
  });
});

describe("key history rollback (P1-08)", () => {
  it("restoring an older validly signed key history gives ROLLBACK_DETECTED and admits only the current key", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-history-rollback-"));
    try {
      ensureSigningKeys(root);
      const path = join(root, ".amc", "keys", "auditor_history.json");
      const older = readFileSync(path);
      const extra = testKey();
      addPublicKeyToHistory(root, "auditor", extra.publicKeyPem);
      expect(getPublicKeyHistory(root, "auditor")).toContain(extra.publicKeyPem);
      const newer = readFileSync(path);
      writeFileSync(path, older);
      expect(verifyKeyHistoryChain(root, "auditor")).toMatchObject({ ok: false, reason: expect.stringMatching(/ROLLBACK_DETECTED/) });
      expect(getPublicKeyHistory(root, "auditor")).toEqual([getPublicKeyPem(root, "auditor")]);
      writeFileSync(path, newer);
      expect(verifyKeyHistoryChain(root, "auditor").ok).toBe(true);
    } finally {
      lockVault(root);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
