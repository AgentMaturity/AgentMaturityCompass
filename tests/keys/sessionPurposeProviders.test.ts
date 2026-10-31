import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sign, verify } from "node:crypto";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { verifyKeyHistoryEnvelope } from "../../src/crypto/keyHistoryEnvelope.js";
import { bindPurposeProviderKey, exportPurposePublicKey, loadKeyProvider, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { type KeyProvider } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { lockVault, vaultPaths } from "../../src/vault/vault.js";
import { logSequence } from "../../src/keys/anchorLog.js";
import { keyRevocationLocation } from "../../src/keys/keyRevocations.js";
import { nextRevocationList, publishRevocationList, readAnchoredRevocationList, revocationListSha256 } from "../../src/keys/revocationList.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-session-provider-"));
  roots.push(root); initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return root;
}
function configure(root: string, id = AWS_ARN("session"), extra: Record<string, unknown> = {}, signed = true) {
  const path = join(root, ".amc", "amc.config.yaml");
  const config = YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  config.keys = { refs: { session: { provider: "aws-kms", id } }, ...extra };
  writeFileSync(path, YAML.stringify(config));
  if (signed) signAmcConfig(root);
}
function kms() {
  const first = fakeKey("p256"), second = fakeKey("ed25519");
  const fake = awsFake({ [AWS_ARN("session")]: first, [AWS_ARN("session-alias")]: first, [AWS_ARN("other")]: second });
  return { first, second, fake, provider: awsKmsProvider(fake.call) };
}
/** Existing KeyProvider SDK boundary, real provider crypto, and a state change before its answer returns. */
function afterSign(provider: KeyProvider, change: () => void | Promise<void>): KeyProvider {
  return { ...provider, async sign(ref, bytes) { const answer = await provider.sign(ref, bytes); await change(); return answer; } };
}
function revokeRecorded(root: string, keyId: string) {
  const location = keyRevocationLocation(root);
  const previous = readAnchoredRevocationList(location)!;
  const list = nextRevocationList(location.listId, { sequence: previous.list.sequence, sha256: revocationListSha256(previous.list) },
    [...previous.list.revoked, { id: keyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: session" }], 0);
  publishRevocationList(location, list, getSigningKey(root, "revocation-list"), logSequence);
}

describe("session owner binding and async purpose authority", () => {
  it("atomically binds P256 and authenticated exact-session history without changing other role authority", async () => {
    const root = workspace(), { provider, fake } = kms();
    const unchanged = ["session.pub", "session_ed25519.pub", "monitor_history.json", "auditor_history.json", "lease_history.json"]
      .map(name => [name, readFileSync(join(vaultPaths(root).keysDir, name))] as const);
    const before = assertKeysetComplete(root)!;
    const anchor = getSigningPublicKeyPem(root, "session");
    configure(root);
    const bound = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
    expect(bound).toMatchObject({ purpose: "session", generation: before.generation + 1, delegation: null, algorithm: "ecdsa-p256-sha256" });
    const current = assertKeysetComplete(root)!;
    const pem = readFileSync(join(vaultPaths(root).keysDir, "session-provider.pub"), "utf8");
    const historyBytes = readFileSync(join(vaultPaths(root).keysDir, "session_history.json"));
    expect(current.files["keys/session-provider.pub"]).toBe(sha256Hex(pem));
    expect(current.files["keys/session_history.json"]).toBe(sha256Hex(historyBytes));
    const history = verifyKeyHistoryEnvelope(JSON.parse(historyBytes.toString()), "session", anchor);
    expect(history.valid).toBe(true);
    expect(history.envelope!.entries.map(entry => entry.publicKeyPem)).toContain(pem);
    for (const [name, bytes] of unchanged) expect(readFileSync(join(vaultPaths(root).keysDir, name))).toEqual(bytes);
    for (const role of ["monitor", "auditor", "lease"] as const) expect(getPublicKeyHistory(root, role)).not.toContain(pem);
    expect(() => getSigningKey(root, "session")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    const describeCount = fake.requests.filter(request => request.operation !== "Sign").length;
    const bytes = Buffer.from("real session payload");
    const signed = await signWithPurposeKey(root, "session", bytes, { provider });
    expect(verifyCanonical(signed.algorithm, bytes, pem, signed.signature)).toBe(true);
    expect(fake.requests.filter(request => request.operation !== "Sign").length).toBe(describeCount);
    writeFileSync(join(vaultPaths(root).keysDir, "session_history.json"), historyBytes.toString() + " ");
    expect(() => assertKeysetComplete(root)).toThrow(/incomplete/);
  });

  it("retains both provider session issuers through owner rebind in authenticated history", async () => {
    const root = workspace(), { provider } = kms();
    configure(root);
    const first = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
    configure(root, AWS_ARN("other"));
    const second = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(getPurposeKeyHistory(root, "session").map(pem => signingKeyId(pem))).toEqual(expect.arrayContaining([first.keyId, second.keyId]));
    expect(getPublicKeyHistory(root, "monitor").map(pem => signingKeyId(pem))).not.toContain(first.keyId);
  });

  it("needs signed configuration before the first session admission", async () => {
    const root = workspace(), { provider, fake } = kms();
    configure(root, AWS_ARN("session"), {}, false);
    await expect(bindPurposeProviderKey(root, "session", { passphrase: PASS, provider })).rejects.toThrow(/signature verifies/);
    expect(fake.requests).toEqual([]);
    expect(existsSync(join(vaultPaths(root).keysDir, "session-provider.pub"))).toBe(false);
  });

  it("refuses a stale prepared bind instead of overwriting an intervening real keyset generation", async () => {
    const root = workspace(), { provider } = kms();
    configure(root);
    const delayed = afterSign(provider, () => { rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS }); });
    await expect(bindPurposeProviderKey(root, "session", { passphrase: PASS, provider: delayed })).rejects.toThrow(/changed while.*prepared/);
    expect(assertKeysetComplete(root)!.providers?.session).toBeUndefined();
    expect(existsSync(join(vaultPaths(root).keysDir, "session-provider.pub"))).toBe(false);
  });

  for (const operation of ["sign", "export"] as const) {
    const invoke = (root: string, provider: KeyProvider) => operation === "sign"
      ? signWithPurposeKey(root, "session", Buffer.from("session"), { provider })
      : exportPurposePublicKey(root, "session", { provider });

    it(`${operation}: refuses a same-key alias owner rebind while the original provider ref is awaited`, async () => {
      const root = workspace(), { provider } = kms(); configure(root);
      const before = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
      const pem = (await provider.describe({ provider: "aws-kms", id: AWS_ARN("session") })).publicKeyPem;
      const control = Buffer.from("same canonical key before and after ref change");
      const initial = await signWithPurposeKey(root, "session", control, { provider });
      expect(verifyCanonical(initial.algorithm, control, pem, initial.signature)).toBe(true);
      let changed = false;
      const delayed: KeyProvider = { ...provider, async sign(ref, bytes) {
        const answer = await provider.sign(ref, bytes);
        expect(ref.id).toBe(AWS_ARN("session"));
        // Provider transport may return high S; signChecked canonically normalizes it after this wrapper returns.
        expect(verify("sha256", bytes, { key: pem, dsaEncoding: "ieee-p1363" }, answer)).toBe(true);
        configure(root, AWS_ARN("session-alias"));
        const after = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
        expect(after.keyId).toBe(before.keyId); expect(after.id).toBe(AWS_ARN("session-alias"));
        expect(after.generation).toBe(before.generation + 1); changed = true;
        return answer;
      } };
      await expect(invoke(root, delayed)).rejects.toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
      expect(changed).toBe(true);
      expect(assertKeysetComplete(root)!.providers!.session).toMatchObject({ id: AWS_ARN("session-alias"), keyId: before.keyId });
      const current = await signWithPurposeKey(root, "session", control, { provider });
      expect(current.keyId).toBe(before.keyId); expect(verifyCanonical(current.algorithm, control, pem, current.signature)).toBe(true);
    });

    it(`${operation}: refuses a real revocation recorded while the provider was awaited`, async () => {
      const root = workspace(), { provider, fake } = kms();
      configure(root);
      const bound = await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
      const describes = fake.requests.filter(request => request.operation !== "Sign").length;
      await expect(invoke(root, afterSign(provider, () => revokeRecorded(root, bound.keyId))))
        .rejects.toThrow(expect.objectContaining({ code: "KEY_REVOKED" }));
      expect(fake.requests.filter(request => request.operation !== "Sign").length).toBe(describes);
    });

    it(`${operation}: refuses a committed rebind while its old provider was awaited`, async () => {
      const root = workspace(), { provider } = kms();
      configure(root);
      await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
      const delayed = afterSign(provider, async () => {
        configure(root, AWS_ARN("other"));
        await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
      });
      await expect(invoke(root, delayed)).rejects.toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    });

    it(`${operation}: applies the current algorithm policy after provider latency`, async () => {
      const root = workspace(), { provider } = kms();
      configure(root);
      await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
      await expect(invoke(root, afterSign(provider, () => configure(root, AWS_ARN("session"), { algorithmPolicy: { allowed: ["ed25519"] } }))))
        .rejects.toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    });
  }

  it("preserves default Ed25519 bytes and refuses a vault lock after the file signature was computed", async () => {
    const root = workspace(), message = Buffer.from("default session");
    const expected = sign(null, message, getSigningKey(root, "session"));
    expect((await signWithPurposeKey(root, "session", message)).signature).toEqual(expected);
    const provider = loadKeyProvider(root, "file"), original = provider.sign.bind(provider);
    vi.spyOn(provider, "sign").mockImplementation(async (ref, bytes) => {
      const signature = await original(ref, bytes);
      lockVault(root); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); return signature;
    });
    await expect(signWithPurposeKey(root, "session", message)).rejects.toThrow(/Vault locked/i);
  });

  it("pins caller message bytes before awaiting describe, and rejects a description naming another ref", async () => {
    const root = workspace(), { provider } = kms();
    configure(root);
    await bindPurposeProviderKey(root, "session", { passphrase: PASS, provider });
    const message = Buffer.from("original"), original = Buffer.from(message);
    const mutable: KeyProvider = { ...provider, async describe(ref) { const result = await provider.describe(ref); message.fill(9); return result; } };
    const signed = await signWithPurposeKey(root, "session", message, { provider: mutable });
    expect(verifyCanonical(signed.algorithm, original, signed.publicKeyPem, signed.signature)).toBe(true);
    expect(verifyCanonical(signed.algorithm, message, signed.publicKeyPem, signed.signature)).toBe(false);
    const wrong: KeyProvider = { ...provider, async describe(ref) { return { ...await provider.describe(ref), ref: { ...ref, id: AWS_ARN("other") } }; } };
    await expect(signWithPurposeKey(root, "session", original, { provider: wrong })).rejects.toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
  });
});

