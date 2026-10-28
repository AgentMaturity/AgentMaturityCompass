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
import { describeTrustConfigResign, resignTrustConfig } from "../../src/trust/trustConfigPublication.js";
import { distrustEntry } from "../trust/trustFixtures.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/** Operator distrust added on top of the shipped built-in list, for the distrust refusal. */
const extraDistrust = vi.hoisted(() => [] as import("../../src/trust/trustList.js").DistrustEntry[]);
vi.mock("../../src/trust/builtInDistrust.js", async importOriginal => {
  const real = await importOriginal<typeof import("../../src/trust/builtInDistrust.js")>();
  return { ...real, builtInDistrust: () => [...real.builtInDistrust(), ...extraDistrust] };
});

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => { extraDistrust.length = 0; vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

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
    const result = revokeKey(root, "artifact-seal", oldKeyId, "superseded");
    expect(result).toMatchObject({ sequence: 3, trustConfig: { status: "resigned" } });
    expectFullyRevoked(root, oldKeyId, 3);
    expect(readFileSync(trustConfigPath(root))).toEqual(before);
    expect(sigEnvelopeKeyId(root)).toBe(ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal")));
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
    expect(() => signDigestWithPolicy({ workspace: root, kind: "BUNDLE", digestHex: "a".repeat(64) })).not.toThrow();
  });

  it("does the same through the owner CLI's asynchronous revocation", async () => {
    const { root, oldKeyId } = rotated();
    await expect(revokeKeyAsync(root, "artifact-seal", oldKeyId, "superseded", PASS)).resolves.toMatchObject({ sequence: 3, trustConfig: { status: "resigned" } });
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

  it.each([
    ["sync", (root: string, keyId: string) => Promise.resolve(revokeKey(root, "artifact-seal", keyId, "key-compromise"))],
    ["async", (root: string, keyId: string) => revokeKeyAsync(root, "artifact-seal", keyId, "key-compromise", PASS)]
  ])("a key-compromise revocation completes but never re-signs what the compromised key signed (%s)", async (_name, revoke) => {
    const { root, oldKeyId } = rotated();
    const body = readFileSync(trustConfigPath(root)), sig = readFileSync(`${trustConfigPath(root)}.sig`);
    await expect(revoke(root, oldKeyId)).resolves.toMatchObject({ sequence: 3, trustConfig: { status: "refused", reason: "signer-compromised",
      recovery: "amc trust resign (review .amc/trust.yaml and its output), then amc trust resign --confirm <sha256> --accept-compromised-signer" } });
    expectFullyRevoked(root, oldKeyId, 3);
    expect(readFileSync(trustConfigPath(root))).toEqual(body);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
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
  function revokedNotarySigner(reason: "key-compromise" | "superseded" = "key-compromise") {
    const { root, oldKeyId } = rotated();
    // Sign NOTARY settings with the current key, rotate it out and revoke it. With NOTARY on disk every log seal would need
    // the notary, so the rotation and revocations run without a trust config; then the NOTARY pair is put back.
    const { config, body, sig } = notaryTrustPair(root);
    const signerKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal"))!;
    rmSync(trustConfigPath(root)); rmSync(`${trustConfigPath(root)}.sig`);
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
    revokeKey(root, "artifact-seal", oldKeyId, "superseded");
    revokeKey(root, "artifact-seal", signerKeyId, reason);
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, sig);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    return { root, config, body, sig, signerKeyId };
  }

  it("re-signs a retired-and-revoked signer's verified NOTARY trust.yaml in place, keeping its notary settings", async () => {
    const { root, config, body } = revokedNotarySigner("superseded");
    await expect(resignTrustConfig(root)).resolves.toMatchObject({ mode: "NOTARY" });
    expect(readFileSync(trustConfigPath(root))).toEqual(body);
    expect(loadTrustConfig(root)).toMatchObject(config);
    expect(sigEnvelopeKeyId(root)).toBe(ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal")));
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
  });

  it("re-signs a key-compromise signer's content only with acceptCompromisedSigner, bound to the reviewed digest", async () => {
    const { root, config, body, sig, signerKeyId } = revokedNotarySigner();
    await expect(resignTrustConfig(root)).rejects.toThrow(/revoked as key-compromise.*--accept-compromised-signer/);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
    const review = describeTrustConfigResign(root);
    expect(review).toMatchObject({ sha256: sha256Hex(body), config, signerKeyIds: [signerKeyId], compromisedSignerKeyIds: [signerKeyId], distrustedSignerKeyIds: [] });
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true, expectedSha256: "0".repeat(64) })).rejects.toThrow(/changed since it was reviewed/);
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true, expectedSha256: review.sha256 })).resolves.toMatchObject({ mode: "NOTARY" });
    expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true });
    expect(loadTrustConfig(root)).toMatchObject(config);
  });

  it("never re-signs content whose signer the operator trust context distrusts, even when accepted", async () => {
    const { root, sig, signerKeyId } = revokedNotarySigner();
    extraDistrust.push(distrustEntry(signerKeyId));
    expect(describeTrustConfigResign(root).distrustedSignerKeyIds).toEqual([signerKeyId]);
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true })).rejects.toThrow(/operator trust context distrusts/);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
  });

  it("a revocation under a trust.yaml signed by an already-revoked key completes and names amc trust resign", () => {
    const { root, body, sig } = revokedNotarySigner();
    const monitorKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "ledger-row"))!;
    // A rotation's own log append still refuses a refused trust config; rotate without one, then put the pair back.
    rmSync(trustConfigPath(root)); rmSync(`${trustConfigPath(root)}.sig`);
    rotatePurposeKeys({ workspace: root, purposes: ["receipt", "ledger-row"], passphrase: PASS });
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, sig);
    const before = readAnchoredRevocationList(keyRevocationLocation(root))!.list.sequence;
    expect(revokeKey(root, "ledger-row", monitorKeyId, "superseded")).toMatchObject({ trustConfig: { status: "refused",
      recovery: "amc trust resign (review .amc/trust.yaml and its output), then amc trust resign --confirm <sha256> --accept-compromised-signer" } });
    expectFullyRevoked(root, monitorKeyId, before + 1);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
  });

  it("refuses content that does not verify and writes nothing", async () => {
    const { root, body, sig } = revokedNotarySigner();
    const tampered = Buffer.from(body.toString("utf8").replace("requiredAttestationLevel: HARDWARE", "requiredAttestationLevel: SOFTWARE"));
    writeFileSync(trustConfigPath(root), tampered);
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true })).rejects.toThrow(/does not match its signature/);
    // Same digest, signature by no history key.
    const forged = JSON.parse(sig.toString("utf8")) as { signature: string; envelope: { sigB64: string } };
    forged.signature = forged.envelope.sigB64 = Buffer.alloc(64, 1).toString("base64");
    writeFileSync(trustConfigPath(root), body); writeFileSync(`${trustConfigPath(root)}.sig`, JSON.stringify(forged));
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true })).rejects.toThrow(/does not verify under any artifact-seal history key/);
    expect(readFileSync(`${trustConfigPath(root)}.sig`, "utf8")).toBe(JSON.stringify(forged));
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
  });

  it("refuses when the vault is locked", async () => {
    const { root, sig } = revokedNotarySigner();
    lockVault(root);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); // nothing may unlock it on entry
    await expect(resignTrustConfig(root, { acceptCompromisedSigner: true })).rejects.toThrow(/vault|passphrase|locked/i);
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(sig);
  });

  it("the CLI shows the content, requires --confirm and --accept-compromised-signer, and re-signs through dist/cli.js", () => {
    const { root, config, body } = revokedNotarySigner();
    const cli = (...args: string[]) => spawnSync(process.execPath, [resolve("dist/cli.js"), "trust", "resign", ...args],
      { cwd: root, env: { ...process.env, NO_COLOR: "1" }, encoding: "utf8", timeout: 120_000 });
    const refused = cli();
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/--confirm/);
    expect(refused.stdout).toContain(`trust.yaml sha256: ${sha256Hex(body)}`);
    expect(refused.stdout).toContain(`"pinnedPubkeyFingerprint": "${"a".repeat(64)}"`);
    const reviewed = sha256Hex(body);
    // The operator binds the digest they reviewed; a digest the run computes itself would bind nothing they saw.
    const stale = cli("--confirm", "0".repeat(64), "--accept-compromised-signer");
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toMatch(/changed since the reviewed digest/);
    const unaccepted = cli("--confirm", reviewed);
    expect(unaccepted.status).not.toBe(0);
    expect(unaccepted.stderr).toMatch(/--accept-compromised-signer/);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
    const done = cli("--confirm", reviewed, "--accept-compromised-signer");
    expect(done.status, done.stderr).toBe(0);
    expect(done.stdout).toMatch(/Mode: NOTARY/);
    expect(verifyTrustConfigSignature(root).valid).toBe(true);
    expect(loadTrustConfig(root)).toMatchObject(config);
  });
});
