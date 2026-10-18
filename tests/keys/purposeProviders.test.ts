import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { verifyHexDigestAny } from "../../src/crypto/keys.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { AntiRollbackError } from "../../src/keys/highWater.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { KeyProviderError, type KeyProvider } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey, exportPurposePublicKey, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, listKeys, revokeKey, rotatePurposeKeys, verifyProofOfPossession } from "../../src/keys/purposeKeys.js";
import { lockVault, vaultPaths, vaultStatus } from "../../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig } from "../../src/workspace.js";
import { logSequence } from "../../src/keys/anchorLog.js";
import { encodeDelegation, issueDelegation } from "../../src/keys/delegation.js";
import { KeyRevokedError, keyRevocationLocation } from "../../src/keys/keyRevocations.js";
import { nextRevocationList, publishRevocationList, readAnchoredRevocationList, revocationListSha256 } from "../../src/keys/revocationList.js";
import { gcpKmsProvider } from "../../src/keys/providers/gcpKms.js";
import { fileKeyProvider } from "../../src/keys/providers/file.js";
import { setMode } from "../../src/mode/mode.js";
import { generateKeyPairSync, sign } from "node:crypto";
import { AWS_ARN, awsFake, fakeKey, GCP_KEY, gcpFake } from "./providerFakes.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-purpose-providers-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/**
 * Writes the `keys` section of .amc/amc.config.yaml (null removes it) and signs the file, as an owner does with
 * `amc verify --sign-config`; `signed: false` leaves the edit unsigned.
 */
function configureKeys(root: string, keys: unknown, opts: { signed?: boolean } = {}): void {
  const path = join(root, ".amc", "amc.config.yaml");
  const config = (YAML.parse(readFileSync(path, "utf8")) ?? {}) as Record<string, unknown>;
  if (keys === null) delete config.keys;
  else config.keys = keys;
  writeFileSync(path, YAML.stringify(config));
  if (opts.signed !== false) signAmcConfig(root);
}

/** Records a revocation of `keyId` straight into the workspace key revocation list (as another tool or a restore would). */
function recordRevocation(root: string, keyId: string): void {
  const location = keyRevocationLocation(root);
  const current = readAnchoredRevocationList(location)!;
  const list = nextRevocationList(location.listId, { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
    [...current.list.revoked, { id: keyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: ledger-row" }], 0);
  publishRevocationList(location, list, getSigningKey(root, "revocation-list"), logSequence);
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
    expect(keyset.providers["ledger-row"]).toEqual({ provider: "aws-kms", id: AWS_ARN("seal"), keyId: signingKeyId(pem), algorithm: "ecdsa-p256-sha256", protection: "hsm", protectionBasis: "provider-metadata" });
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

    const down = (await signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms("TimeoutError").provider }).catch((e: unknown) => e)) as KeyProviderError;
    expect(down).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 });
    expect(down.message).not.toMatch(/vault locked|internal\.example|111122223333/i);
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms("AccessDeniedException").provider })).rejects.toSatisfy(isCode("KEY_PROVIDER_AUTH_FAILED"));

    // The key set, not the config, decides which key signs: a config naming another key, or none, changes nothing until
    // the owner binds again, and only the delegate the provider certified keeps signing rows.
    const boundId = listKeys(root).purposes.find(row => row.purpose === "ledger-row")!.providerKeyId;
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } });
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).resolves.toMatchObject({ keyId: boundId });
    configureKeys(root, null);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: kms().provider })).resolves.toMatchObject({ keyId: boundId });
    expect(getSigningKey(root, "ledger-row")).toBe(delegate);
    // A provider that describes another key than the bound one is refused.
    const swapped = awsFake({ [AWS_ARN("seal")]: otherKey });
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: awsKmsProvider(swapped.call) })).rejects.toThrow(/not the key the key set binds/);

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

  it("review: a provider-held purpose is refused before the vault is touched", () => {
    const root = workspace();
    configureKeys(root, { refs: { "artifact-seal": { provider: "aws-kms", id: AWS_ARN("seal") } } }, { signed: false });
    lockVault(root);
    // AMC_VAULT_PASSPHRASE is set, so touching the vault would unlock it.
    expect(() => getSigningKey(root, "artifact-seal")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    expect(vaultStatus(root).unlocked).toBe(false);
  });

  it("review: picking a provider key needs a signed amc.config.yaml, and the bytes verified are the bytes used", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } }, { signed: false });
    const { fake, provider } = kms();
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).rejects.toThrow(/amc\.config\.yaml/);
    expect(fake.requests).toEqual([]);
    // Unsigned, the section still refuses the vault (it can only refuse, never pick a key).
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    signAmcConfig(root);
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    // An unsigned edit naming another key binds nothing; renewing the bound key needs no signature; signing ignores the config.
    const requests = fake.requests.length;
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("other") } } }, { signed: false });
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).rejects.toThrow(/amc\.config\.yaml/);
    expect(fake.requests.length).toBe(requests);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).resolves.toMatchObject({ keyId: signingKeyId(sealKey.publicKey.export({ format: "pem", type: "spki" }).toString()) });
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } }, requireNonExportable: true }, { signed: false });
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).resolves.toMatchObject({ delegation: expect.any(Object) });
  });

  it("review: the ledger-row delegate is refused once the bound provider key is revoked", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    const bound = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    expect(getSigningKey(root, "ledger-row")).toContain("PRIVATE KEY");
    recordRevocation(root, bound.keyId);
    expect(() => getSigningKey(root, "ledger-row")).toThrow(KeyRevokedError);
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider })).rejects.toBeInstanceOf(KeyRevokedError);
  });

  it("review: a delegation for any key but the one the vault serves is refused", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    const { provider } = kms();
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
    const issuer = await provider.describe({ provider: "aws-kms", id: AWS_ARN("seal") });
    const stranger = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
    const forged = await issueDelegation(provider, issuer, { delegatePublicKeyPem: stranger, notBefore: new Date(), hours: 24, maxEvents: 10 });
    writeFileSync(join(vaultPaths(root).keysDir, "delegations", "ledger-row.json"), encodeDelegation(forged));
    expect(() => getSigningKey(root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
  });

  it("review: never another provider, and key changes stay owner-only", async () => {
    const root = workspace();
    configureKeys(root, { refs: { "ledger-row": { provider: "aws-kms", id: AWS_ARN("seal") } } });
    await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider });
    // The config now names a Google key: the binding is AWS, so nothing is asked of Google and nothing signs.
    configureKeys(root, { refs: { "ledger-row": { provider: "gcp-kms", id: GCP_KEY, version: "1" } } });
    const google = gcpFake(fakeKey("p256"), "HSM");
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: gcpKmsProvider(google.call) })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    expect(google.requests).toEqual([]);
    // Even a provider of another kind that presents the bound key (and can sign with it) is not asked.
    const bound = await kms().provider.describe({ provider: "aws-kms", id: AWS_ARN("seal") });
    let asked = 0;
    const confused: KeyProvider = { id: "gcp-kms", describe: async ref => { asked++; return { ...bound, ref }; },
      sign: async (_ref, message) => { asked++; return sign("sha256", message, { key: sealKey.privateKey, dsaEncoding: "ieee-p1363" }); } };
    await expect(signWithPurposeKey(root, "ledger-row", Buffer.alloc(32), { provider: confused })).rejects.toSatisfy(isCode("KEY_PROVIDER_KEY_REFUSED"));
    expect(asked).toBe(0);
    // Agent mode: binding and creating a file-provider wrap key are refused inside the functions.
    setMode(root, "agent");
    await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: kms().provider })).rejects.toThrow(/owner mode|agent mode/i);
    await expect(fileKeyProvider(root).wrapKey!({ provider: "file", id: "ledger-dek" }, Buffer.alloc(32))).rejects.toThrow(/owner mode|agent mode/i);
  });

  it("keys.requireNonExportable refuses the vault (file provider) for unbound purposes", async () => {
    const root = workspace();
    // Unsigned: the setting only refuses, so it counts as written (and the vault could not sign the config under it).
    configureKeys(root, { requireNonExportable: true }, { signed: false });
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
