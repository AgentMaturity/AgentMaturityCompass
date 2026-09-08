import { createPrivateKey, generateKeyPairSync, sign as rawSign } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPublicKeyToHistory, ensureSigningKeys, getAuthenticatedKeyHistory, getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, migratePublicKeyHistory, signHexDigest, signHexDigestWith, verifyHexDigest, verifyHexDigestAny, verifyKeyHistoryChain } from "../../src/crypto/keys.js";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory, verifyKeyHistoryEnvelope } from "../../src/crypto/keyHistoryEnvelope.js";
import { verifyKeyRotationReceipt } from "../../src/crypto/keyRotationReceipt.js";
import { decryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { lockVault, rotateMonitorKeyInVault, setVaultSecret, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import * as fileOps from "../../src/utils/fs.js";

const pair = () => {
  const keys = generateKeyPairSync("ed25519");
  return { publicPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), privatePem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
};
const digest = (s: string) => sha256Hex(Buffer.from(s, "utf8"));

describe("authenticated history admission", () => {
  let workspace: string;
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-history-admission-"));
    ensureSigningKeys(workspace);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    lockVault(workspace);
    rmSync(workspace, { force: true, recursive: true });
  });
  const historyFile = (role = "auditor") => join(workspace, ".amc", "keys", `${role}_history.json`);
  const stored = () => JSON.parse(readFileSync(historyFile(), "utf8"));

  it("initializes all four roles with authenticated private-derived current keys", () => {
    for (const role of ["monitor", "auditor", "lease", "session"] as const) {
      const history = getAuthenticatedKeyHistory(workspace, role)!;
      expect(history.role).toBe(role);
      expect(history.entries.map((entry) => entry.publicKeyPem)).toEqual([publicKeyFromPrivate(getPrivateKeyPem(workspace, role))]);
    }
  });

  it("readers verify admissions with the vault locked", () => {
    const extra = pair();
    addPublicKeyToHistory(workspace, "auditor", extra.publicPem);
    lockVault(workspace);
    expect(getPublicKeyHistory(workspace, "auditor")).toContain(extra.publicPem);
  });

  it.each(["role", "source", "revision", "fingerprint", "unknown-field"])("rejects %s tampering even when chain hashes remain unchanged", (field) => {
    const extra = pair();
    addPublicKeyToHistory(workspace, "auditor", extra.publicPem);
    const value = stored();
    if (field === "role") value.role = "monitor";
    else if (field === "source") value.entries[1].source = "notary";
    else if (field === "revision") value.revision++;
    else if (field === "fingerprint") value.entries[1].fingerprint = "0".repeat(64);
    else value.unrecognizedAuthority = true;
    writeFileSync(historyFile(), JSON.stringify(value));
    expect(getPublicKeyHistory(workspace, "auditor")).toEqual([getPublicKeyPem(workspace, "auditor")]);
  });

  it("rejects a valid history signed by a different anchor", () => {
    const extra = pair();
    const envelope = sealKeyHistory("auditor", [buildKeyHistoryEntry(extra.publicPem, [])], extra.privatePem);
    writeFileSync(historyFile(), JSON.stringify(envelope));
    expect(getAuthenticatedKeyHistory(workspace, "auditor")).toBeNull();
  });

  it("ordinary digest signatures cannot authorize a history envelope", () => {
    const value = stored();
    const { signature: _signature, ...base } = value;
    value.signature = signHexDigest(digest(canonicalize(base)), getPrivateKeyPem(workspace, "auditor"));
    expect(verifyKeyHistoryEnvelope(value, "auditor", getPublicKeyPem(workspace, "auditor")).valid).toBe(false);
  });

  it("digest-signing APIs refuse a raw tagged admission payload encoded as long hex", () => {
    const { signature: _signature, ...base } = stored();
    const payload = Buffer.from("AMC_KEY_HISTORY_ADMISSION_V1\0" + canonicalize(base), "utf8");
    const rawHex = payload.toString("hex");
    const privatePem = getPrivateKeyPem(workspace, "auditor");
    expect(() => signHexDigest(rawHex, privatePem)).toThrow(/64/);
    expect(() => signHexDigestWith(createPrivateKey(privatePem), rawHex)).toThrow(/64/);
    expect(() => signDigestWithVault({ workspace, kind: "CERT", digestHex: rawHex })).toThrow(/64/);
    expect(() => signDigestWithPolicy({ workspace, kind: "CERT", digestHex: rawHex })).toThrow(/64/);
    const signature = rawSign(null, payload, privatePem).toString("base64");
    expect(verifyHexDigest(rawHex, signature, getPublicKeyPem(workspace, "auditor"))).toBe(false);
    expect(verifyHexDigest("aa".repeat(32) + "zz", signature, getPublicKeyPem(workspace, "auditor"))).toBe(false);
    expect(() => signHexDigest("A".repeat(64), privatePem)).toThrow(/lowercase/);
  });

  it("rejects malformed or duplicate keys even if an owner signs the payload", () => {
    const value = stored();
    expect(() => sealKeyHistory("auditor", [...value.entries, ...value.entries], getPrivateKeyPem(workspace, "auditor"))).toThrow(/duplicate/);
    expect(() => addPublicKeyToHistory(workspace, "auditor", "invalid PEM")).toThrow();
    expect(getAuthenticatedKeyHistory(workspace, "auditor")!.entries).toHaveLength(1);
  });

  it.each(["legacy", "malformed", "tampered-envelope"])("does not launder %s history through unlock, initialization or secret changes", (format) => {
    const extra = pair();
    const value = stored();
    value.entries.push(buildKeyHistoryEntry(extra.publicPem, value.entries));
    const raw = format === "legacy" ? JSON.stringify(value.entries) : format === "malformed" ? "{broken" : JSON.stringify(value);
    writeFileSync(historyFile(), raw);
    lockVault(workspace);
    unlockVault(workspace, "amc-test-passphrase");
    ensureSigningKeys(workspace);
    setVaultSecret(workspace, "admission-test", "ordinary secret rewrite");
    expect(readFileSync(historyFile(), "utf8")).toBe(raw);
    expect(getPublicKeyHistory(workspace, "auditor")).not.toContain(extra.publicPem);
    expect(verifyKeyHistoryChain(workspace, "auditor").ok).toBe(false);
  });

  it("does not seed a new vault from an existing planted history list", () => {
    const fresh = mkdtempSync(join(tmpdir(), "amc-planted-init-"));
    try {
      const file = join(fresh, ".amc", "keys", "auditor_history.json");
      const extra = pair();
      fileOps.writeFileAtomic(file, JSON.stringify([buildKeyHistoryEntry(extra.publicPem, [])]));
      ensureSigningKeys(fresh);
      expect(getPublicKeyHistory(fresh, "auditor")).not.toContain(extra.publicPem);
      expect(readdirSync(join(fresh, ".amc", "keys")).some((name) => name.startsWith("auditor_history.json.previous-"))).toBe(true);
    } finally { lockVault(fresh); rmSync(fresh, { force: true, recursive: true }); }
  });

  it("refuses mismatched live public keys before a vault rewrite changes disk", () => {
    const paths = vaultPaths(workspace);
    const before = readFileSync(paths.vaultFile, "utf8");
    writeFileSync(paths.auditorPublic, pair().publicPem);
    expect(() => setVaultSecret(workspace, "test", "value")).toThrow(/does not match/);
    expect(readFileSync(paths.vaultFile, "utf8")).toBe(before);
  });

  it("locked and no-sign admission refuse without modifying history", () => {
    const before = readFileSync(historyFile(), "utf8");
    lockVault(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    expect(() => addPublicKeyToHistory(workspace, "auditor", pair().publicPem)).toThrow(/locked/i);
    vi.stubEnv("AMC_NO_SIGN", "1");
    expect(() => addPublicKeyToHistory(workspace, "auditor", pair().publicPem)).toThrow(/no-sign/i);
    expect(readFileSync(historyFile(), "utf8")).toBe(before);
  });

  it("migration admits only exact reviewed fingerprints and saves the original bytes", () => {
    const approved = pair();
    const unapproved = pair();
    const value = stored();
    value.entries.push(buildKeyHistoryEntry(approved.publicPem, value.entries));
    value.entries.push(buildKeyHistoryEntry(unapproved.publicPem, value.entries));
    const raw = JSON.stringify(value.entries);
    writeFileSync(historyFile(), raw);
    expect(() => addPublicKeyToHistory(workspace, "auditor", approved.publicPem)).toThrow(/migrate/);
    expect(() => migratePublicKeyHistory({ workspace, kind: "auditor", expectedSha256: "0".repeat(64), approvedFingerprints: [] })).toThrow(/changed/);
    const result = migratePublicKeyHistory({ workspace, kind: "auditor", expectedSha256: digest(raw), approvedFingerprints: [digest(approved.publicPem)] });
    expect(readFileSync(result.backupPath, "utf8")).toBe(raw);
    expect(getPublicKeyHistory(workspace, "auditor")).toContain(approved.publicPem);
    expect(getPublicKeyHistory(workspace, "auditor")).not.toContain(unapproved.publicPem);
    expect(verifyKeyHistoryChain(workspace, "auditor").ok).toBe(true);
  });

  it("explicit current-only migration can recover malformed history but cannot approve absent keys", () => {
    const raw = "{corrupt history";
    writeFileSync(historyFile(), raw);
    const input = { workspace, kind: "auditor" as const, expectedSha256: digest(raw), approvedFingerprints: ["f".repeat(64)] };
    expect(() => migratePublicKeyHistory(input)).toThrow(/missing/);
    expect(readFileSync(historyFile(), "utf8")).toBe(raw);
    migratePublicKeyHistory({ ...input, approvedFingerprints: [] });
    expect(getPublicKeyHistory(workspace, "auditor")).toEqual([getPublicKeyPem(workspace, "auditor")]);
  });

  it("rotation preserves old signatures and emits independently pinned continuity proof", () => {
    openLedger(workspace).close();
    const oldPrivate = getPrivateKeyPem(workspace, "monitor");
    const oldPublic = getPublicKeyPem(workspace, "monitor");
    const messageDigest = "a".repeat(64);
    const oldSignature = signHexDigest(messageDigest, oldPrivate);
    const result = rotateMonitorKeyInVault(workspace, "amc-test-passphrase");
    expect(getPublicKeyHistory(workspace, "monitor")).toEqual([oldPublic, getPublicKeyPem(workspace, "monitor")]);
    expect(verifyHexDigestAny(messageDigest, oldSignature, getPublicKeyHistory(workspace, "monitor"))).toBe(true);
    const receipt = JSON.parse(readFileSync(result.rotationReceiptPath, "utf8"));
    expect(verifyKeyRotationReceipt(receipt, digest(oldPublic))).toBe(true);
    expect(verifyKeyRotationReceipt(receipt, result.fingerprint)).toBe(false);
    expect(verifyKeyRotationReceipt({ ...receipt, nextFingerprint: "f".repeat(64) }, digest(oldPublic))).toBe(false);
    const pinned = verifyLedgerIntegrity(workspace, { expectedMonitorFingerprint: digest(oldPublic) });
    expect(pinned.trustRoot.anchored).toBe(false);
    expect(pinned.chain.errors.join(" ")).toContain("trust root");
    expect(receipt.previousHistorySha256).toBe(digest(readFileSync(join(result.recoveryDirectory, "previous-monitor-history.json"), "utf8")));
    expect(receipt.nextHistorySha256).toBe(digest(readFileSync(historyFile("monitor"), "utf8")));
    const oldVault = JSON.parse(readFileSync(join(result.recoveryDirectory, "previous-vault.amcvault"), "utf8"));
    expect(JSON.parse(decryptVaultPayload(oldVault, "amc-test-passphrase").toString()).monitorPrivateKeyPem).toBe(oldPrivate);
  });

  it("rotation refuses untrusted legacy history before replacing the private key", () => {
    const paths = vaultPaths(workspace);
    const raw = readFileSync(paths.vaultFile, "utf8");
    writeFileSync(paths.monitorHistory, JSON.stringify(getAuthenticatedKeyHistory(workspace, "monitor")!.entries));
    expect(() => rotateMonitorKeyInVault(workspace, "amc-test-passphrase")).toThrow(/migrate/);
    expect(readFileSync(paths.vaultFile, "utf8")).toBe(raw);
  });

  it("interrupted rotation refuses historical verification and retains recoverable encrypted state", () => {
    const paths = vaultPaths(workspace);
    const oldPrivate = getPrivateKeyPem(workspace, "monitor");
    const write = fileOps.writeFileAtomic;
    vi.spyOn(fileOps, "writeFileAtomic").mockImplementation((path, bytes, mode) => {
      if (path === paths.monitorHistory) throw new Error("simulated history publication failure");
      write(path, bytes, mode);
    });
    expect(() => rotateMonitorKeyInVault(workspace, "amc-test-passphrase")).toThrow(/simulated/);
    expect(getAuthenticatedKeyHistory(workspace, "monitor")).toBeNull();
    expect(verifyHexDigestAny("b".repeat(64), signHexDigest("b".repeat(64), oldPrivate), getPublicKeyHistory(workspace, "monitor"))).toBe(false);
    const recovery = join(paths.keysDir, "rotations", readdirSync(join(paths.keysDir, "rotations"))[0]!);
    const saved = JSON.parse(readFileSync(join(recovery, "previous-vault.amcvault"), "utf8"));
    expect(JSON.parse(decryptVaultPayload(saved, "amc-test-passphrase").toString()).monitorPrivateKeyPem).toBe(oldPrivate);
    expect(readdirSync(recovery)).toContain("next-vault.amcvault");
  });
});
