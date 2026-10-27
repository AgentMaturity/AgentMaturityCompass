import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { highWaterPath, workspaceScope } from "../../src/keys/highWater.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { encodeSignedRevocationList, nextRevocationList, readAnchoredRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { canonicalize } from "../../src/utils/json.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createKeyRotationReceipt, verifyKeyRotationReceipt } from "../../src/crypto/keyRotationReceipt.js";
import { getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import {
  exportPublicKey, getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, listKeys, resumeKeyRotation, revokeKey, rotatePurposeKeys, verifyProofOfPossession
} from "../../src/keys/purposeKeys.js";
import { verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { admitKey, ed25519KeyId, workspaceSelfTrust } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault, purposeKeyPaths, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { decryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { v1Workspace } from "../helpers/legacyVault.js";
import { initWorkspace } from "../../src/workspace.js";
import { verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { context, listEntry } from "../trust/trustFixtures.js";

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  rmSync(join(process.env.AMC_HOME!, "trust", "trust-roots.json"), { force: true });
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-purpose-keys-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/** Pins a key as this machine's trust-list root (<AMC home>/trust/trust-roots.json), as a key-compromise rotation needs. */
const pinned = <T extends { publicPem: string }>(key: T): T => {
  const file = join(process.env.AMC_HOME!, "trust", "trust-roots.json");
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [ed25519KeyId(key.publicPem)] }));
  return key;
};
const pem = () => {
  const keys = generateKeyPairSync("ed25519");
  return { privatePem: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
};

describe("purpose keys and vault payload v2 (P1-08)", () => {
  it("a v1 vault migrates to v2 on unlock with identical public keys, keeping the v1 file", () => {
    const { root, roles, envelope } = v1Workspace(PASS);
    roots.push(root);
    const paths = vaultPaths(root);
    const before = Object.fromEntries((["monitor", "auditor", "lease", "session"] as const).map(role => [role, readFileSync(paths[`${role}Public`], "utf8")]));
    unlockVault(root, PASS);
    const v2 = JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(paths.vaultFile, "utf8")), PASS).toString("utf8"));
    expect(v2.v).toBe(2);
    expect(v2.secrets).toEqual({ kept: "secret" });
    // The v1 envelope is key material: kept in AMC home with the recovery copies, never in the workspace (review round 2).
    expect(existsSync(paths.previousVaultFile)).toBe(false);
    expect(readFileSync(join(process.env.AMC_HOME!, "state", "keyset-recovery", workspaceScope(root), "previous-vault.amcvault"), "utf8")).toBe(envelope);
    for (const role of ["monitor", "auditor", "lease", "session"] as const) expect(readFileSync(paths[`${role}Public`], "utf8")).toBe(before[role]);
    expect(getSigningPublicKeyPem(root, "ledger-row")).toBe(roles.monitor.publicPem);
    expect(getSigningPublicKeyPem(root, "receipt")).toBe(roles.monitor.publicPem);
    for (const purpose of ["artifact-seal", "revocation-list", "config-signature"] as const) expect(getSigningPublicKeyPem(root, purpose)).toBe(roles.auditor.publicPem);
    expect(getSigningKey(root, "receipt")).toBe(roles.monitor.privatePem);
    expect(getPrivateKeyPem(root, "auditor")).toBe(roles.auditor.privatePem);
    expect(v2.keys["revocation-list"].keyId).toBe(ed25519KeyId(roles.auditor.publicPem));
    expect(listKeys(root)).toMatchObject({ generation: 1, complete: true });
  });

  it("after rotating receipt, receipts use the new key and ledger rows keep the old one", () => {
    const root = workspace();
    const monitor = getPrivateKeyPem(root, "monitor");
    const result = rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    expect(result.rotated).toEqual([expect.objectContaining({ purpose: "receipt", reason: "purpose-split" })]);
    expect(getSigningKey(root, "ledger-row")).toBe(monitor);
    expect(getPrivateKeyPem(root, "monitor")).toBe(monitor);
    const receipt = getSigningKey(root, "receipt");
    expect(receipt).not.toBe(monitor);
    // Role-history verifiers keep verifying receipts; the purpose history separates them.
    const digest = "c".repeat(64);
    expect(verifyHexDigestAny(digest, signHexDigest(digest, receipt), getPublicKeyHistory(root, "monitor"))).toBe(true);
    expect(getPurposeKeyHistory(root, "ledger-row")).not.toContain(getSigningPublicKeyPem(root, "receipt"));
    const statement = readFileSync(result.rotated[0]!.statementPath);
    expect(verifyRotationStatement(statement, { expected: { workspaceId: "default", purpose: "receipt" },
      trustedCurrentPublicKeyPem: getPublicKeyPem(root, "monitor"), previous: null })).toMatchObject({ valid: true });
    expect(listKeys(root).purposes.find(row => row.purpose === "receipt")).toMatchObject({ sharedWith: [], rotations: 1 });
  });

  it("the ledger signs receipts with the receipt key and rows with the ledger-row key after a receipt rotation", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const ledger = openLedger(root);
    try {
      ledger.startSession({ sessionId: "s1", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
      const appended = ledger.appendEvidenceWithReceipt({ sessionId: "s1", runtime: "unknown", eventType: "stdout", payload: "x", meta: { trustTier: "OBSERVED" },
        receipt: { kind: "tool_action", agentId: "default", providerId: "toolhub", model: null, bodySha256: "a".repeat(64) } });
      const row = ledger.getEventById(appended.id)!;
      const receipt = (JSON.parse(row.meta_json) as { receipt: string }).receipt;
      expect(verifyReceipt(receipt, [getSigningPublicKeyPem(root, "receipt")]).ok).toBe(true);
      expect(verifyReceipt(receipt, [getSigningPublicKeyPem(root, "ledger-row")]).ok).toBe(false);
      expect(verifyHexDigestAny(row.event_hash, row.writer_sig, [getSigningPublicKeyPem(root, "ledger-row")])).toBe(true);
      expect(verifyHexDigestAny(row.event_hash, row.writer_sig, [getSigningPublicKeyPem(root, "receipt")])).toBe(false);
    } finally {
      ledger.close();
    }
  });

  it("an artifact-seal key signing a revocation is refused by P0-09 admission (wrong-purpose)", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal"], passphrase: PASS });
    const seal = getSigningPublicKeyPem(root, "artifact-seal");
    const exported = exportPublicKey(root, "artifact-seal");
    expect(verifyProofOfPossession(exported)).toBe(true);
    expect(verifyProofOfPossession({ ...exported, purpose: "revocation-list" })).toBe(false);
    const operator = context({ lists: [{ type: "amc.trust-list", version: 1, listId: "org", sequence: 1, issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z", distrust: [],
      entries: [listEntry({ keyId: exported.keyId, publicKeyPem: exported.publicKeyPem, privateKeyPem: "" }, { purposes: ["artifact-seal"], validTo: null })] }] });
    expect(admitKey({ publicKeyPem: seal, purpose: "revocation-list", signature: "revocations.signed.json", context: operator }).status).toBe("wrong-purpose");
    expect(admitKey({ publicKeyPem: seal, purpose: "artifact-seal", signature: "manifest.sig", context: operator }).status).toBe("admitted");
    const self = workspaceSelfTrust(root);
    expect(admitKey({ publicKeyPem: seal, purpose: "revocation-list", signature: "s", context: self }).status).not.toBe("admitted");
    expect(admitKey({ publicKeyPem: seal, purpose: "artifact-seal", signature: "s", context: self }).status).toBe("admitted");
  });

  it("revokes a retired key so the workspace self-check refuses it, and refuses to revoke a key in use", () => {
    const root = workspace();
    const old = getSigningPublicKeyPem(root, "artifact-seal");
    expect(() => revokeKey(root, "artifact-seal", ed25519KeyId(old)!, "superseded")).toThrow(/rotate it first/);
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
    // trust.yaml still carries the retired key's signature; the revocation re-signs it with the current key (P0-37).
    // Sequence 1 at creation, 2 when the rotated revocation-list key re-signed it, 3 for this revocation.
    expect(revokeKey(root, "artifact-seal", ed25519KeyId(old)!, "key-compromise")).toMatchObject({ listId: "keys:default", sequence: 3 });
    expect(admitKey({ publicKeyPem: old, purpose: "artifact-seal", signature: "s", context: workspaceSelfTrust(root) }).status).toBe("distrusted");
    expect(verifyTrustConfigSignature(root).valid).toBe(true);
    expect(() => revokeKey(root, "artifact-seal", "0".repeat(64), "superseded")).toThrow(/not in the artifact-seal key history/);
  });

  it("keys for release, notary and trust-list roots never come from a workspace vault", () => {
    const root = workspace();
    for (const purpose of ["release", "notary", "trust-list-root", "evidence-authority", "independent-attestation"] as const) {
      expect(() => getSigningKey(root, purpose)).toThrow(/never live in a workspace vault/);
    }
  });

  it("a key-compromise rotation needs a root and drops the compromised key from every history", () => {
    const root = workspace();
    const old = getSigningPublicKeyPem(root, "receipt");
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", passphrase: PASS })).toThrow(/root signature/);
    const orgRoot = pinned(pem());
    const result = rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [orgRoot.privatePem], passphrase: PASS });
    // The compromised monitor key also signed ledger rows, so both purposes moved.
    expect(result.rotated.map(row => row.purpose).sort()).toEqual(["ledger-row", "receipt"]);
    expect(getPublicKeyHistory(root, "monitor")).not.toContain(old);
    expect(getPurposeKeyHistory(root, "receipt")).not.toContain(old);
    expect(existsSync(purposeKeyPaths(root, "receipt").publicFile)).toBe(true);
  });

  it("a key-compromise rotation also drops the key from a purpose that split off it earlier (self-audit)", () => {
    const root = workspace();
    const shared = getSigningPublicKeyPem(root, "ledger-row");
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS }); // purpose-split: receipt's history keeps the shared key
    expect(getPurposeKeyHistory(root, "receipt")).toContain(shared);
    rotatePurposeKeys({ workspace: root, purposes: ["ledger-row"], reason: "key-compromise", rootPrivateKeyPems: [pinned(pem()).privatePem], passphrase: PASS });
    expect(getPurposeKeyHistory(root, "ledger-row")).not.toContain(shared);
    expect(getPurposeKeyHistory(root, "receipt")).not.toContain(shared);
  });

  it("old amc.monitor-key-rotation receipts still verify", () => {
    const previous = pem();
    const next = pem();
    const receipt = createKeyRotationReceipt({ previousPrivateKeyPem: previous.privatePem, nextPublicKeyPem: next.publicPem, previousHistorySha256: "a".repeat(64), nextHistorySha256: "b".repeat(64) });
    expect(verifyKeyRotationReceipt(receipt, sha256Hex(Buffer.from(previous.publicPem, "utf8")))).toBe(true);
  });
});

describe("key use refuses revoked keys and unreadable revocation state (P1-08, security review)", () => {
  const keysList = (root: string) => join(root, ".amc", "keys", "revocations.signed.json");
  const revokedRotation = (): { root: string; old: string } => {
    const root = workspace();
    const old = getSigningPublicKeyPem(root, "artifact-seal");
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
    revokeKey(root, "artifact-seal", ed25519KeyId(old)!, "superseded");
    return { root, old };
  };

  it("refuses a current key the signed key revocation list names, at use time", () => {
    const root = workspace();
    expect(getSigningKey(root, "artifact-seal")).toBeTruthy();
    const location = { workspace: root, rel: ".amc/keys/revocations.signed.json", listId: "keys:default", trustedPublicKeyPems: getPurposeKeyHistory(root, "revocation-list") };
    const current = readAnchoredRevocationList(location)!;
    const keyId = ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal"))!;
    // A validly signed newer list naming the key in use (written directly; amc keys revoke refuses a key in use).
    const list = nextRevocationList("keys:default", { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
      [{ id: keyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: artifact-seal" }], 0);
    writeFileSync(keysList(root), encodeSignedRevocationList(signRevocationList(list, getSigningKey(root, "revocation-list"))));
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(/revoked/);
    expect(() => getPrivateKeyPem(root, "auditor")).toThrow(/revoked/);
    expect(getSigningKey(root, "lease")).toBeTruthy();
  });

  it.each([
    ["deleted after it existed", (root: string) => rmSync(keysList(root))],
    ["with a bad signature", (root: string) => {
      const body = JSON.parse(readFileSync(keysList(root), "utf8"));
      body.list.revoked = [];
      writeFileSync(keysList(root), JSON.stringify(body));
    }],
    ["replaced by a directory", (root: string) => { rmSync(keysList(root)); mkdirSync(keysList(root)); }],
    ["unparseable", (root: string) => writeFileSync(keysList(root), "{")]
  ])("refuses every key use when the key revocation list is %s", (_name, damage) => {
    const { root } = revokedRotation();
    expect(getSigningKey(root, "receipt")).toBeTruthy();
    damage(root);
    expect(() => getSigningKey(root, "receipt")).toThrow();
    expect(() => getPrivateKeyPem(root, "monitor")).toThrow();
  });

  it("refuses every key use when an older key revocation list is replayed", () => {
    const { root } = revokedRotation();
    const older = readFileSync(keysList(root));
    const retired = getSigningPublicKeyPem(root, "config-signature");
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
    revokeKey(root, "config-signature", ed25519KeyId(retired)!, "superseded");
    writeFileSync(keysList(root), older);
    expect(() => getSigningKey(root, "receipt")).toThrow(/ROLLBACK_DETECTED/);
  });

  it("refuses key use when the anti-rollback state turns unreadable after a successful use", () => {
    const root = workspace();
    expect(getSigningKey(root, "artifact-seal")).toBeTruthy();
    const path = highWaterPath();
    rmSync(path);
    mkdirSync(path);
    try {
      expect(() => getSigningKey(root, "artifact-seal")).toThrow(/anti-rollback state/);
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  });
});

describe("self-audit: no downgrade to a pre-P1-08 workspace (P1-08, security review)", () => {
  it("an unlocked v2 vault whose key set was deleted refuses to sign, even on a machine with no marks", () => {
    const root = workspace();
    expect(getSigningKey(root, "receipt")).toBeTruthy();
    rmSync(keysetPaths(root).keyset);
    rmSync(highWaterPath(), { force: true });
    // Refused before the vault is even consulted: purpose files without keyset.json mean the key set was removed.
    expect(() => getSigningKey(root, "receipt")).toThrow(/no key set|keyset\.json is missing/);
    expect(() => getPrivateKeyPem(root, "monitor")).toThrow(/no key set|keyset\.json is missing/);
  });

  it("a recovery directory planted as a symlink is refused before anything is copied into it", () => {
    const root = workspace();
    const elsewhere = mkdtempSync(join(tmpdir(), "amc-elsewhere-"));
    roots.push(elsewhere);
    rmSync(keysetPaths(root).rotations, { recursive: true }); // the first generation's own recovery manifest
    symlinkSync(elsewhere, keysetPaths(root).rotations);
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS })).toThrow(/symlink|outside/);
    expect(existsSync(keysetPaths(root).pending)).toBe(false);
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});

describe("key-set paths stay inside the keys directory (P1-08, security review)", () => {
  it.each(["../outside.txt", "keys/../../outside.txt", "/etc/hosts", "keys/statements/receipt/../../../../outside.txt", "keys/a∕b.pub", "keys/a\u0000.pub"])(
    "resume refuses a pending key set naming %j and touches nothing outside", (rel) => {
      const root = workspace();
      const outside = join(root, "outside.txt");
      writeFileSync(outside, "keep me");
      const keyset = JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8"));
      writeFileSync(keysetPaths(root).pending, JSON.stringify({ ...keyset, generation: keyset.generation + 1, files: { [rel]: "0".repeat(64) } }));
      expect(() => resumeKeyRotation(root)).toThrow();
      expect(readFileSync(outside, "utf8")).toBe("keep me");
    });

  it("a rollback manifest naming a path outside .amc is refused", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const outside = join(root, "outside.txt");
    writeFileSync(outside, "keep me");
    const keyset = JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8"));
    const generation = keyset.generation + 1;
    const recovery = join(keysetPaths(root).rotations, `gen-${generation}`);
    mkdirSync(recovery, { recursive: true });
    writeFileSync(join(recovery, "manifest.json"), JSON.stringify({ generation, files: [{ rel: "../outside.txt", existed: false, mode: 384 }] }));
    writeFileSync(keysetPaths(root).pending, JSON.stringify({ ...keyset, generation, files: { "keys/receipt.pub": "0".repeat(64) } }));
    expect(() => resumeKeyRotation(root)).toThrow();
    expect(readFileSync(outside, "utf8")).toBe("keep me");
  });

  it("a committed key set naming a path outside .amc refuses to sign", () => {
    const root = workspace();
    const keyset = JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8"));
    writeFileSync(keysetPaths(root).keyset, canonicalize({ ...keyset, files: { ...keyset.files, "../outside.pub": "0".repeat(64) } }));
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(/key set/);
  });

  it("refuses a statements directory that is a symlink out of the keys directory", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const elsewhere = mkdtempSync(join(tmpdir(), "amc-elsewhere-"));
    roots.push(elsewhere);
    const dir = join(root, ".amc", "keys", "statements", "receipt");
    renameSync(dir, join(elsewhere, "receipt"));
    symlinkSync(join(elsewhere, "receipt"), dir);
    expect(() => rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS })).toThrow(/outside|symlink/);
  });
});
