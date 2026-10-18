import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { verifyHexDigestAny } from "../../src/crypto/keys.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { AntiRollbackError } from "../../src/keys/highWater.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey, exportPurposePublicKey, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, listKeys, revokeKey, rotatePurposeKeys, verifyProofOfPossession } from "../../src/keys/purposeKeys.js";
import { lockVault, vaultPaths } from "../../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig } from "../../src/workspace.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-purpose-providers-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/** Writes the `keys` section of .amc/amc.config.yaml (null removes it). */
function configureKeys(root: string, keys: unknown): void {
  const path = join(root, ".amc", "amc.config.yaml");
  const config = (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Record<string, unknown>;
  if (keys === null) delete config.keys;
  else config.keys = keys;
  writeFileSync(path, YAML.stringify(config));
}

const sealKey = fakeKey("p256");
const issuerKey = fakeKey("ed25519");
const otherKey = fakeKey("p256");
function kms(fail?: string) {
  const fake = awsFake({ [AWS_ARN("seal")]: sealKey, [AWS_ARN("issuer")]: issuerKey, [AWS_ARN("other")]: otherKey }, { fail });
  return { fake, provider: awsKmsProvider(fake.call) };
}
const isCode = (code: string) => (error: unknown) => error instanceof KeyProviderError && error.code === code;

describe("purpose keys held by key providers (P2-08)", () => {
  it("without a keys section every purpose signs with the vault exactly as before", async () => {
    const root = workspace();
    const vaultKey = getSigningKey(root, "artifact-seal");
    const signed = await signWithPurposeKey(root, "artifact-seal", Buffer.alloc(32, 1));
    expect(signed).toMatchObject({ provider: "file", algorithm: "ed25519", publicKeyPem: getSigningPublicKeyPem(root, "artifact-seal") });
    expect(verifyHexDigestAny("01".repeat(32), signed.signature.toString("base64"), [signed.publicKeyPem])).toBe(true);
    expect(getSigningKey(root, "artifact-seal")).toBe(vaultKey);
    expect(listKeys(root).purposes.find(row => row.purpose === "artifact-seal")).toMatchObject({ provider: "file", algorithm: "ed25519", protection: "software", protectionBasis: "configured", providerKeyId: null });
  });

  it("a purpose configured to a provider never falls back to the vault, bound or not", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    await expect(signWithPurposeKey(root, "artifact-seal", Buffer.alloc(32), { provider: kms().provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    // Other purposes keep the vault.
    expect(getSigningKey(root, "receipt")).toContain("PRIVATE KEY");
    // Saving the workspace config (amc config, setup) keeps the keys section, so the refusal survives it.
    saveAMCConfig(root, loadAMCConfig(root));
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  it("only ledger-row can be bound in this release: other purposes keep refusing their vault key until removed from keys.refs", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    await expect(bindPurposeProviderKey(root, "artifact-seal", { passphrase: PASS, provider })).rejects.toThrow(/cannot be bound to artifact-seal yet/);
    expect(fake.requests).toEqual([]);
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    configureKeys(root, null);
    expect(getSigningKey(root, "artifact-seal")).toContain("PRIVATE KEY");
  });

  it("binding commits a key-set generation naming the provider key; signing then goes through the provider only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { fake, provider } = kms();
    const before = listKeys(root).generation!;
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const pem = sealKey.publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(bound).toMatchObject({ purpose: "ledger-row", generation: before + 1, provider: "aws-kms", keyId: signingKeyId(pem), algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata" });
    const keyset = JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8"));
    expect(keyset.providers["ledger-row"]).toEqual({ provider: "aws-kms", keyId: signingKeyId(pem), algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata" });
    expect(keyset.files["keys/ledger-row-provider.pub"]).toMatch(/^[0-9a-f]{64}$/);
    expect(listKeys(root).purposes.find(row => row.purpose === "ledger-row")).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata", providerKeyId: signingKeyId(pem) });

    const message = Buffer.alloc(32, 5);
    const signsBefore = fake.requests.filter(row => row.operation === "Sign").length;
    const signed = await signWithPurposeKey(root, "ledger-row", message, { provider });
    expect(fake.requests.filter(row => row.operation === "Sign").length).toBe(signsBefore + 1);
    expect(signed).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", keyId: signingKeyId(pem), publicKeyPem: pem });
    expect(verifyCanonical("ecdsa-p256-sha256", message, pem, signed.signature)).toBe(true);
    // The bound key is admitted for its purpose, beside the vault delegate.
    expect(getPurposeKeyHistory(root, "ledger-row")).toEqual(expect.arrayContaining([pem, getSigningPublicKeyPem(root, "ledger-row")]));
    expect(verifyHexDigestAny("05".repeat(32), signed.signature.toString("base64"), getPurposeKeyHistory(root, "ledger-row"))).toBe(true);
  });

  it("fails closed: an unreachable provider, another key, a lost config or a rolled-back key set never signs with the vault", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const unbound = readFileSync(keysetPaths(root).keyset);
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
    const delegate = getSigningKey(root, "ledger-row");

    const down = await signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms("TimeoutError").provider }).catch((e: unknown) => e as KeyProviderError);
    expect(down).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 });
    expect(down.message).not.toMatch(/vault locked|internal\.example|111122223333/i);
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms("AccessDeniedException").provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_AUTH_FAILED"));

    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } });
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).rejects.toThrow(/not the key the key set binds/);

    // The key set, not the config, decides: without keys.refs the provider path refuses, and only the delegate the
    // provider certified keeps signing rows.
    configureKeys(root, null);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);

    // Putting back the key set from before the binding is a rollback this machine refuses.
    writeFileSync(keysetPaths(root).keyset, unbound);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(AntiRollbackError);
  });

  it("a later rotation carries the binding forward; re-binding moves the purpose to another provider key and drops the old one", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    const first = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    rotatePurposeKeys({ workspace: root, purposes: ["receipt"], passphrase: PASS });
    expect(JSON.parse(readFileSync(keysetPaths(root).keyset, "utf8")).providers["ledger-row"].keyId).toBe(first.keyId);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ provider: "aws-kms", keyId: first.keyId });
    // A bound key still signs: revoking it is refused, as for any key in use (rotate, here re-bind, first).
    expect(() => revokeKey(root, "ledger-row", first.keyId, "key-compromise", PASS)).toThrow(/still signs/);

    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } });
    const second = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(second.keyId).toBe(signingKeyId(otherKey.publicKey.export({ format: "pem", type: "spki" }).toString()));
    expect(getPurposeKeyHistory(root, "ledger-row").map(pem => signingKeyId(pem))).not.toContain(first.keyId);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ keyId: second.keyId });
    expect(getSigningKey(root, "ledger-row")).toContain("PRIVATE KEY");
  });

  it("export-public of a provider-held key prints the public key and a provider-signed proof of possession only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const exported = await exportPurposePublicKey(root, "ledger-row", { provider });
    expect(exported).toMatchObject({ provider: "aws-kms", algorithm: "ecdsa-p256-sha256", publicKeyPem: sealKey.publicKey.export({ format: "pem", type: "spki" }).toString() });
    expect(Object.keys(exported).sort()).toEqual(["algorithm", "keyId", "proofOfPossession", "provider", "publicKeyPem", "purpose"]);
    expect(JSON.stringify(exported)).not.toContain("PRIVATE KEY");
    expect(verifyProofOfPossession(exported)).toBe(true);
    expect(verifyProofOfPossession({ ...exported, purpose: "artifact-seal" })).toBe(false);
  });

  it("keys.requireNonExportable refuses the vault (file provider) for unbound purposes", async () => {
    const root = workspace();
    configureKeys(root, { requireNonExportable: true });
    expect(() => getSigningKey(root, "receipt")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }));
    await expect(signWithPurposeKey(root, "receipt", Buffer.alloc(32))).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
  });

  it("a locked vault still reports itself as locked for vault purposes", () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    lockVault(root);
    const prior = process.env.AMC_VAULT_PASSPHRASE;
    delete process.env.AMC_VAULT_PASSPHRASE;
    try {
      expect(() => getSigningKey(root, "receipt")).toThrow(/Vault locked/);
    } finally {
      process.env.AMC_VAULT_PASSPHRASE = prior;
    }
  });

  it("ledger-row: the vault delegate signs rows only while a provider-signed delegation for it is current", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("issuer") } } });
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    const { fake, provider } = kms();
    const now = new Date();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, now });
    expect(bound.delegation).toMatchObject({ notBefore: now.toISOString(), notAfter: new Date(now.getTime() + 24 * 3_600_000).toISOString() });
    const delegate = getSigningKey(root, "ledger-row");
    expect(delegate).toContain("PRIVATE KEY");
    const signs = fake.requests.filter(row => row.operation === "Sign").length;
    for (let i = 0; i < 5; i++) getSigningKey(root, "ledger-row");
    expect(fake.requests.filter(row => row.operation === "Sign").length).toBe(signs);

    const delegationFile = join(vaultPaths(root).keysDir, "delegations", "ledger-row.json");
    const current = readFileSync(delegationFile);
    // Expired: issued 25 hours ago.
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider, now: new Date(Date.now() - 25 * 3_600_000) });
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    // Signed by another key: refused.
    const forged = JSON.parse(current.toString());
    forged.signature = Buffer.alloc(64, 3).toString("base64");
    writeFileSync(delegationFile, JSON.stringify(forged));
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    rmSync(delegationFile);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    // Renewed: rows sign again.
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);
  });
});
