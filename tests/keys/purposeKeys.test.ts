import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createKeyRotationReceipt, verifyKeyRotationReceipt } from "../../src/crypto/keyRotationReceipt.js";
import { getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import {
  exportPublicKey, getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, listKeys, revokeKey, rotatePurposeKeys, verifyProofOfPossession
} from "../../src/keys/purposeKeys.js";
import { verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { admitKey, ed25519KeyId, workspaceSelfTrust } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault, purposeKeyPaths, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { decryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { v1Workspace } from "../helpers/legacyVault.js";
import { initWorkspace } from "../../src/workspace.js";
import { context, listEntry } from "../trust/trustFixtures.js";

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-purpose-keys-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

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
    expect(readFileSync(paths.previousVaultFile, "utf8")).toBe(envelope);
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
    expect(revokeKey(root, "artifact-seal", ed25519KeyId(old)!, "key-compromise")).toMatchObject({ listId: "keys:default", sequence: 1 });
    expect(admitKey({ publicKeyPem: old, purpose: "artifact-seal", signature: "s", context: workspaceSelfTrust(root) }).status).toBe("distrusted");
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
    const orgRoot = pem();
    const result = rotatePurposeKeys({ workspace: root, purposes: ["receipt"], reason: "key-compromise", rootPrivateKeyPems: [orgRoot.privatePem], passphrase: PASS });
    // The compromised monitor key also signed ledger rows, so both purposes moved.
    expect(result.rotated.map(row => row.purpose).sort()).toEqual(["ledger-row", "receipt"]);
    expect(getPublicKeyHistory(root, "monitor")).not.toContain(old);
    expect(getPurposeKeyHistory(root, "receipt")).not.toContain(old);
    expect(existsSync(purposeKeyPaths(root, "receipt").publicFile)).toBe(true);
  });

  it("old amc.monitor-key-rotation receipts still verify", () => {
    const previous = pem();
    const next = pem();
    const receipt = createKeyRotationReceipt({ previousPrivateKeyPem: previous.privatePem, nextPublicKeyPem: next.publicPem, previousHistorySha256: "a".repeat(64), nextHistorySha256: "b".repeat(64) });
    expect(verifyKeyRotationReceipt(receipt, sha256Hex(Buffer.from(previous.publicPem, "utf8")))).toBe(true);
  });
});
