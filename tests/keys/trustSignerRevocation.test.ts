import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { keyRevocationLocation, readKeyRevocations } from "../../src/keys/keyRevocations.js";
import { getSigningPublicKeyPem, revokeKey, revokeKeyAsync, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { readAnchoredRevocationList, revocationListSha256 } from "../../src/keys/revocationList.js";
import { readTransparencyEntries } from "../../src/transparency/logChain.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { defaultTrustConfig, loadTrustConfig, trustConfigPath, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { resignTrustConfig } from "../../src/trust/trustConfigPublication.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function rotated(): { root: string; oldKeyId: string } {
  const root = mkdtempSync(join(tmpdir(), "amc-trust-signer-revoke-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const oldKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal"))!;
  rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
  return { root, oldKeyId };
}

const sigEnvelopeKeyId = (root: string) => {
  const sig = JSON.parse(readFileSync(`${trustConfigPath(root)}.sig`, "utf8")) as { envelope: { pubkeyB64: string } };
  return ed25519KeyId(Buffer.from(sig.envelope.pubkeyB64, "base64").toString("utf8"));
};

/** The revocation is final: listed, anchored by its own transparency entry, nothing staged. */
function expectFullyRevoked(root: string, keyId: string, sequence: number): void {
  const location = keyRevocationLocation(root);
  const list = readAnchoredRevocationList(location)!;
  expect(list.list.sequence).toBe(sequence);
  expect(list.list.revoked.map(row => row.id)).toContain(keyId);
  expect(existsSync(join(root, ".amc", "keys", "revocations.signed.json.pending"))).toBe(false);
  const entry = readTransparencyEntries(root).find(row => row.artifact.id === `${location.listId}#${sequence}`);
  expect(entry?.artifact.sha256).toBe(revocationListSha256(list.list));
  expect(list.anchor?.transparencyEntryHash).toBe(entry?.hash);
  expect(readKeyRevocations(root, true).map(row => row.keyId)).toContain(keyId);
}

/** A NOTARY-mode trust.yaml pair signed by the workspace's current artifact-seal key, as enable-notary leaves it (not written). */
function notaryTrustPair(root: string) {
  const base = defaultTrustConfig();
  const config = { trust: { ...base.trust, mode: "NOTARY" as const, notary: { ...base.trust.notary, baseUrl: "http://127.0.0.1:9", pinnedPubkeyFingerprint: "a".repeat(64), requiredAttestationLevel: "HARDWARE" as const } } };
  const body = Buffer.from(YAML.stringify(config), "utf8");
  const signed = signDigestWithVault({ workspace: root, kind: "BUNDLE", digestHex: sha256Hex(body) });
  const sig = Buffer.from(JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
  return { config, body, sig };
}

describe("revoking the key that signs trust.yaml (P0-37)", () => {
  it("re-signs the verified trust.yaml with the current key and completes the revocation", () => {
    const { root, oldKeyId } = rotated();
    expect(sigEnvelopeKeyId(root)).toBe(oldKeyId);
    const before = readFileSync(trustConfigPath(root));
    const result = revokeKey(root, "artifact-seal", oldKeyId, "key-compromise");
    expect(result).toMatchObject({ sequence: 3, trustConfig: { status: "resigned" } });
    expectFullyRevoked(root, oldKeyId, 3);
    expect(readFileSync(trustConfigPath(root))).toEqual(before);
    expect(sigEnvelopeKeyId(root)).toBe(ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal")));
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
    expect(() => signDigestWithPolicy({ workspace: root, kind: "BUNDLE", digestHex: "a".repeat(64) })).not.toThrow();
  });

  it("does the same through the owner CLI's asynchronous revocation", async () => {
    const { root, oldKeyId } = rotated();
    await expect(revokeKeyAsync(root, "artifact-seal", oldKeyId, "key-compromise", PASS)).resolves.toMatchObject({ sequence: 3, trustConfig: { status: "resigned" } });
    expectFullyRevoked(root, oldKeyId, 3);
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
    expect(() => signDigestWithPolicy({ workspace: root, kind: "BUNDLE", digestHex: "a".repeat(64) })).not.toThrow();
  });

  it.each([
    ["sync", (root: string, keyId: string) => Promise.resolve(revokeKey(root, "artifact-seal", keyId, "key-compromise"))],
    ["async", (root: string, keyId: string) => revokeKeyAsync(root, "artifact-seal", keyId, "key-compromise", PASS)]
  ])("a tampered trust.yaml never blocks the revocation and is never re-signed (%s)", async (_name, revoke) => {
    const { root, oldKeyId } = rotated();
    const tampered = Buffer.from(readFileSync(trustConfigPath(root), "utf8").replace("denyLocalVaultSigningIfNotaryEnabled: true", "denyLocalVaultSigningIfNotaryEnabled: false"));
    writeFileSync(trustConfigPath(root), tampered);
    const sig = readFileSync(`${trustConfigPath(root)}.sig`);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    const result = await revoke(root, oldKeyId);
    expect(result).toMatchObject({ sequence: 3, trustConfig: { status: "refused", recovery: "amc trust init" } });
    expectFullyRevoked(root, oldKeyId, 3);
    expect(readFileSync(trustConfigPath(root))).toEqual(tampered);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    expect(() => signDigestWithPolicy({ workspace: root, kind: "BUNDLE", digestHex: "a".repeat(64) })).toThrow(/trust config signature invalid/);
  });

  it("leaves a trust.yaml another current key signs untouched", () => {
    const { root, oldKeyId } = rotated();
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    const monitorKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "ledger-row"))!;
    expect(monitorKeyId).not.toBe(oldKeyId);
    const sig = readFileSync(`${trustConfigPath(root)}.sig`);
    rotatePurposeKeys({ workspace: root, purposes: ["ledger-row"], passphrase: PASS });
    expect(revokeKey(root, "ledger-row", monitorKeyId, "superseded")).toMatchObject({ trustConfig: { status: "unchanged" } });
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
  });
});

describe("amc trust resign (P0-37)", () => {
  /** A NOTARY trust.yaml signed by a key that is then rotated out and revoked (trust.yaml restored as it was). */
  function revokedNotarySigner() {
    const { root, oldKeyId } = rotated();
    // Sign NOTARY settings with the current key, rotate it out and revoke it. With NOTARY on disk every log seal would need
    // the notary, so the rotation and revocations run without a trust config; then the NOTARY pair is put back.
    const { config, body, sig } = notaryTrustPair(root);
    const signerKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal"))!;
    rmSync(trustConfigPath(root)); rmSync(`${trustConfigPath(root)}.sig`);
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
    revokeKey(root, "artifact-seal", oldKeyId, "superseded");
    revokeKey(root, "artifact-seal", signerKeyId, "key-compromise");
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, sig);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    return { root, config, body, sig };
  }

  it("re-signs a revoked signer's verified NOTARY trust.yaml in place, keeping its notary settings", async () => {
    const { root, config, body } = revokedNotarySigner();
    await expect(resignTrustConfig(root)).resolves.toMatchObject({ mode: "NOTARY" });
    expect(readFileSync(trustConfigPath(root))).toEqual(body);
    expect(loadTrustConfig(root)).toMatchObject(config);
    expect(sigEnvelopeKeyId(root)).toBe(ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal")));
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
  });

  it("a revocation under a trust.yaml signed by an already-revoked key completes and names amc trust resign", () => {
    const { root, body, sig } = revokedNotarySigner();
    const monitorKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "ledger-row"))!;
    // A rotation's own log append still refuses a refused trust config; rotate without one, then put the pair back.
    rmSync(trustConfigPath(root)); rmSync(`${trustConfigPath(root)}.sig`);
    rotatePurposeKeys({ workspace: root, purposes: ["receipt", "ledger-row"], passphrase: PASS });
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, sig);
    const before = readAnchoredRevocationList(keyRevocationLocation(root))!.list.sequence;
    expect(revokeKey(root, "ledger-row", monitorKeyId, "superseded")).toMatchObject({ trustConfig: { status: "refused", recovery: "amc trust resign --confirm" } });
    expectFullyRevoked(root, monitorKeyId, before + 1);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
  });

  it("refuses content that does not verify and writes nothing", async () => {
    const { root, body, sig } = revokedNotarySigner();
    const tampered = Buffer.from(body.toString("utf8").replace("requiredAttestationLevel: HARDWARE", "requiredAttestationLevel: SOFTWARE"));
    writeFileSync(trustConfigPath(root), tampered);
    await expect(resignTrustConfig(root)).rejects.toThrow(/does not match its signature/);
    // Same digest, signature by no history key.
    const forged = JSON.parse(sig.toString("utf8")) as { signature: string; envelope: { sigB64: string } };
    forged.signature = forged.envelope.sigB64 = Buffer.alloc(64, 1).toString("base64");
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, JSON.stringify(forged));
    await expect(resignTrustConfig(root)).rejects.toThrow(/does not verify under any artifact-seal history key/);
    expect(readFileSync(`${trustConfigPath(root)}.sig`, "utf8")).toBe(JSON.stringify(forged));
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
  });

  it("refuses when the vault is locked", async () => {
    const { root, sig } = revokedNotarySigner();
    lockVault(root);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); // nothing may unlock it on entry
    await expect(resignTrustConfig(root)).rejects.toThrow(/vault|passphrase|locked/i);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
  });

  it("the CLI requires --confirm and re-signs through dist/cli.js", () => {
    const { root, config } = revokedNotarySigner();
    const cli = (...args: string[]) => spawnSync(process.execPath, [resolve("dist/cli.js"), "trust", "resign", ...args],
      { cwd: root, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 120_000 });
    const refused = cli();
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/--confirm/);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    const done = cli("--confirm");
    expect(done.status, done.stderr).toBe(0);
    expect(done.stdout).toMatch(/Mode: NOTARY/);
    expect(verifyTrustConfigSignature(root).valid).toBe(true);
    expect(loadTrustConfig(root)).toMatchObject(config);
  });
});
