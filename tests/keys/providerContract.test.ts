import { createHash, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { checkedDescription, KeyProviderError, signChecked, type KeyProvider, type KeyRef } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { azureKeyVaultProvider } from "../../src/keys/providers/azureKeyVault.js";
import { fileKeyProvider } from "../../src/keys/providers/file.js";
import { gcpKmsProvider } from "../../src/keys/providers/gcpKms.js";
import { CK, pkcs11Provider } from "../../src/keys/providers/pkcs11.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { AWS_ARN, AZURE_KEY, AZURE_WRAP_KEY, awsFake, azureFake, fakeKey, GCP_KEY, gcpFake, pkcs11Fake, publicPem } from "./providerFakes.js";

const roots: string[] = [];
afterAll(() => { for (const root of roots) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
const PIN = "4321-test-pin";
const pkcs11Env = { AMC_PKCS11_PIN: PIN, AMC_PKCS11_PROTECTION: "software" };

interface Suite { name: string; provider: () => KeyProvider; ref: KeyRef; wrapRef: KeyRef | null; algorithm: "ed25519" | "ecdsa-p256-sha256"; protection: string; basis: string }

function fileWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-contract-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

const awsEd = fakeKey("ed25519");
const awsEc = fakeKey("p256");
const aws = awsFake({ [AWS_ARN("ed")]: awsEd, [AWS_ARN("ec")]: awsEc });
const gcpEd = gcpFake(fakeKey("ed25519"), "SOFTWARE");
const gcpEc = gcpFake(fakeKey("p256"), "HSM");
const azure = azureFake(fakeKey("p256"));
const token = pkcs11Fake({ token: "amc", pin: PIN, keys: [{ label: "seal-ec", key: fakeKey("p256") }, { label: "seal-ed", key: fakeKey("ed25519"), wrapOctetString: false }], secrets: ["dek-wrap"] });
let file: KeyProvider | null = null;

const suites: Suite[] = [
  { name: "file (vault)", provider: () => (file ??= fileKeyProvider(fileWorkspace())), ref: { provider: "file", id: "artifact-seal" }, wrapRef: { provider: "file", id: "ledger-dek" }, algorithm: "ed25519", protection: "software", basis: "configured" },
  { name: "aws-kms Ed25519", provider: () => awsKmsProvider(aws.call), ref: { provider: "aws-kms", id: AWS_ARN("ed") }, wrapRef: { provider: "aws-kms", id: AWS_ARN("wrap") }, algorithm: "ed25519", protection: "hsm", basis: "provider-metadata" },
  { name: "aws-kms P-256", provider: () => awsKmsProvider(aws.call), ref: { provider: "aws-kms", id: AWS_ARN("ec") }, wrapRef: null, algorithm: "ecdsa-p256-sha256", protection: "hsm", basis: "provider-metadata" },
  { name: "gcp-kms Ed25519 (software)", provider: () => gcpKmsProvider(gcpEd.call), ref: { provider: "gcp-kms", id: GCP_KEY, version: "1" }, wrapRef: { provider: "gcp-kms", id: GCP_KEY }, algorithm: "ed25519", protection: "software", basis: "provider-metadata" },
  { name: "gcp-kms P-256 (HSM)", provider: () => gcpKmsProvider(gcpEc.call), ref: { provider: "gcp-kms", id: GCP_KEY, version: "1" }, wrapRef: null, algorithm: "ecdsa-p256-sha256", protection: "hsm", basis: "provider-metadata" },
  { name: "azure-kv P-256 (EC-HSM)", provider: () => azureKeyVaultProvider(azure.calls), ref: { provider: "azure-kv", id: AZURE_KEY }, wrapRef: { provider: "azure-kv", id: AZURE_WRAP_KEY }, algorithm: "ecdsa-p256-sha256", protection: "hsm", basis: "provider-metadata" },
  { name: "pkcs11 P-256 (in-process token)", provider: () => pkcs11Provider({ module: token.module, env: pkcs11Env }), ref: { provider: "pkcs11", id: "pkcs11:token=amc;object=seal-ec" }, wrapRef: { provider: "pkcs11", id: "pkcs11:token=amc;object=dek-wrap" }, algorithm: "ecdsa-p256-sha256", protection: "software", basis: "configured" },
  { name: "pkcs11 Ed25519 (in-process token)", provider: () => pkcs11Provider({ module: token.module, env: pkcs11Env }), ref: { provider: "pkcs11", id: "pkcs11:token=amc;object=seal-ed" }, wrapRef: null, algorithm: "ed25519", protection: "software", basis: "configured" }
];

/** Node's own verify, in each algorithm's canonical encoding. */
function nodeVerifies(algorithm: Suite["algorithm"], message: Buffer, publicKeyPem: string, signature: Uint8Array): boolean {
  return algorithm === "ed25519" ? verify(null, message, publicKeyPem, signature) : verify("sha256", message, { key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature);
}

describe.each(suites)("key provider contract (P2-08): $name", suite => {
  it("describe returns the public key, its AMC key id, the algorithm and an honest protection label", async () => {
    const description = await suite.provider().describe(suite.ref);
    expect(description).toMatchObject({ ref: suite.ref, algorithm: suite.algorithm, protection: suite.protection, protectionBasis: suite.basis });
    expect(description.keyId).toBe(signingKeyId(description.publicKeyPem));
    expect(description.publicKeyPem).toBe(createPublicKey(description.publicKeyPem).export({ format: "pem", type: "spki" }).toString());
    expect(description.exportable).toBe(suite.ref.provider === "file");
    expect(checkedDescription(description, { allowed: ["ed25519", "ecdsa-p256-sha256"], requireNonExportable: false })).toBe(description);
  });

  it("signatures verify with node crypto.verify in the canonical encoding; another key does not verify them", async () => {
    const provider = suite.provider();
    const description = await provider.describe(suite.ref);
    const other = suite.algorithm === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
    for (const message of [Buffer.alloc(32, 7), Buffer.from(`AMC_KEY_POP_V1\0{"purpose":"artifact-seal"}`)]) {
      const signature = await signChecked(provider, description, message);
      expect(signature).toHaveLength(64);
      expect(nodeVerifies(suite.algorithm, message, description.publicKeyPem, signature)).toBe(true);
      expect(nodeVerifies(suite.algorithm, message, other.publicKey.export({ format: "pem", type: "spki" }).toString(), signature)).toBe(false);
      expect(nodeVerifies(suite.algorithm, Buffer.concat([message, Buffer.from([1])]), description.publicKeyPem, signature)).toBe(false);
    }
  });

  it("wrap and unwrap round-trip a data key; a changed blob does not unwrap", async () => {
    if (suite.wrapRef === null) return;
    const provider = suite.provider();
    const dek = Buffer.alloc(32, 9);
    const wrapped = Buffer.from(await provider.wrapKey!(suite.wrapRef, dek));
    expect(wrapped.includes(dek)).toBe(false);
    expect(Buffer.from(await provider.unwrapKey!(suite.wrapRef, wrapped))).toEqual(dek);
    const tampered = Buffer.from(wrapped);
    tampered[tampered.length - 1]! ^= 1;
    await expect(Promise.resolve().then(() => provider.unwrapKey!(suite.wrapRef!, tampered))).rejects.toThrow();
  });

  it("offers no private-key export", () => {
    const provider = suite.provider();
    expect(Object.keys(provider).sort()).toEqual(["describe", "id", "sign", "unwrapKey", "wrapKey"]);
  });
});

describe("key provider requests and failures (P2-08)", () => {
  it("AWS KMS: Sign is RAW with ED25519_SHA_512 or ECDSA_SHA_256 on the ARN, in the ARN's region", async () => {
    const fake = awsFake({ [AWS_ARN("ed")]: awsEd, [AWS_ARN("ec")]: awsEc });
    const provider = awsKmsProvider(fake.call);
    await provider.sign({ provider: "aws-kms", id: AWS_ARN("ed") }, Buffer.from("m"));
    await provider.sign({ provider: "aws-kms", id: AWS_ARN("ec") }, Buffer.from("m"));
    const signs = fake.requests.filter(row => row.operation === "Sign");
    expect(signs.map(row => [row.input.KeyId, row.input.MessageType, row.input.SigningAlgorithm, row.region])).toEqual([
      [AWS_ARN("ed"), "RAW", "ED25519_SHA_512", "eu-west-1"], [AWS_ARN("ec"), "RAW", "ECDSA_SHA_256", "eu-west-1"]
    ]);
    expect(Buffer.from(signs[0]!.input.Message as Uint8Array).toString()).toBe("m");
  });

  it("Google Cloud KMS: Ed25519 sends the data, P-256 a SHA-256 digest, both to the named key version", async () => {
    await gcpKmsProvider(gcpEd.call).sign({ provider: "gcp-kms", id: GCP_KEY, version: "1" }, Buffer.from("m"));
    await gcpKmsProvider(gcpEc.call).sign({ provider: "gcp-kms", id: GCP_KEY, version: "1" }, Buffer.from("m"));
    const ed = gcpEd.requests.filter(row => row.operation === "asymmetricSign").at(-1)!.request;
    const ec = gcpEc.requests.filter(row => row.operation === "asymmetricSign").at(-1)!.request;
    expect(ed).toEqual({ name: `${GCP_KEY}/cryptoKeyVersions/1`, data: Buffer.from("m") });
    expect(ec).toEqual({ name: `${GCP_KEY}/cryptoKeyVersions/1`, digest: { sha256: createHash("sha256").update("m").digest() } });
  });

  it("Azure: ES256 over a SHA-256 digest; RSA-OAEP-256 to wrap; an exportable key is refused", async () => {
    const fake = azureFake(fakeKey("p256"));
    const provider = azureKeyVaultProvider(fake.calls);
    await provider.sign({ provider: "azure-kv", id: AZURE_KEY }, Buffer.from("m"));
    await provider.wrapKey!({ provider: "azure-kv", id: AZURE_WRAP_KEY }, Buffer.alloc(32));
    expect(fake.requests.find(row => row.operation === "sign")!.args).toEqual([AZURE_KEY, "ES256", createHash("sha256").update("m").digest()]);
    expect(fake.requests.find(row => row.operation === "wrapKey")!.args).toEqual([AZURE_WRAP_KEY, "RSA-OAEP-256"]);
    await expect(azureKeyVaultProvider(azureFake(fakeKey("p256"), { exportable: true }).calls).describe({ provider: "azure-kv", id: AZURE_KEY }))
      .rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    await expect(azureKeyVaultProvider(azureFake(fakeKey("p256"), { kty: "EC" }).calls).describe({ provider: "azure-kv", id: AZURE_KEY }))
      .resolves.toMatchObject({ protection: "software" });
  });

  it("refuses refs that are not the provider's identifiers before any call (no endpoint, host or library from config)", async () => {
    const fake = awsFake({});
    const refused = [
      awsKmsProvider(fake.call).describe({ provider: "aws-kms", id: "https://evil.example/key" }),
      awsKmsProvider(fake.call).describe({ provider: "aws-kms", id: AWS_ARN("ed"), version: "2" }),
      gcpKmsProvider(gcpEd.call).describe({ provider: "gcp-kms", id: GCP_KEY }),
      gcpKmsProvider(gcpEd.call).describe({ provider: "gcp-kms", id: "projects/x/../keys", version: "1" }),
      azureKeyVaultProvider(azure.calls).describe({ provider: "azure-kv", id: "https://amc-test.evil.example/keys/artifact-seal" }),
      pkcs11Provider({ module: token.module, env: pkcs11Env }).describe({ provider: "pkcs11", id: "pkcs11:token=amc;object=seal-ec;module-path=/tmp/x.so" })
    ];
    for (const attempt of refused) await expect(attempt).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(fake.requests).toEqual([]);
  });

  it("maps provider errors to codes and never copies the provider's message", async () => {
    for (const [name, code] of [["AccessDeniedException", "KEY_PROVIDER_AUTH_FAILED"], ["DisabledException", "KEY_PROVIDER_KEY_REFUSED"], ["TimeoutError", "KEY_PROVIDER_UNAVAILABLE"]] as const) {
      const error = await awsKmsProvider(awsFake({}, { fail: name }).call).describe({ provider: "aws-kms", id: AWS_ARN("ed") }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(KeyProviderError);
      expect(error).toMatchObject({ code });
      expect(String((error as Error).message)).not.toMatch(/internal\.example|111122223333|PIN|secret/);
      expect((error as Error).cause).toBeUndefined();
    }
    const disabled = awsFake({ [AWS_ARN("ed")]: { ...awsEd, state: "PendingDeletion" } });
    await expect(awsKmsProvider(disabled.call).describe({ provider: "aws-kms", id: AWS_ARN("ed") })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });

  it("a missing SDK is KEY_PROVIDER_NOT_INSTALLED naming the package", async () => {
    await expect(awsKmsProvider().describe({ provider: "aws-kms", id: AWS_ARN("ed") })).rejects.toMatchObject({ code: "KEY_PROVIDER_NOT_INSTALLED", message: expect.stringContaining("@aws-sdk/client-kms") });
    await expect(gcpKmsProvider().describe({ provider: "gcp-kms", id: GCP_KEY, version: "1" })).rejects.toMatchObject({ code: "KEY_PROVIDER_NOT_INSTALLED", message: expect.stringContaining("@google-cloud/kms") });
    await expect(pkcs11Provider({ env: { AMC_PKCS11_MODULE: "/nonexistent/libsofthsm2.so" } }).describe({ provider: "pkcs11", id: "pkcs11:token=amc;object=k" }))
      .rejects.toMatchObject({ code: "KEY_PROVIDER_NOT_INSTALLED" });
  });

  it("PKCS#11: an extractable or non-sensitive key is refused; Ed25519 only when the token lists CKM_EDDSA", async () => {
    const keys = [{ label: "extractable", key: fakeKey("p256"), extractable: true }, { label: "plain", key: fakeKey("p256"), sensitive: false }, { label: "ed", key: fakeKey("ed25519") }];
    const tokenWithout = pkcs11Fake({ token: "amc", pin: PIN, keys, mechanisms: [CK.CKM_ECDSA] });
    const provider = pkcs11Provider({ module: tokenWithout.module, env: pkcs11Env });
    for (const label of ["extractable", "plain", "ed"]) {
      await expect(provider.describe({ provider: "pkcs11", id: `pkcs11:token=amc;object=${label}` })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    }
  });

  it("PKCS#11: a wrong PIN is KEY_PROVIDER_AUTH_FAILED without the PIN or library path; the PIN comes only from the environment", async () => {
    const wrong = (await pkcs11Provider({ module: pkcs11Fake({ token: "amc", pin: PIN, keys: [] }).module, env: { AMC_PKCS11_PIN: "0000" } })
      .describe({ provider: "pkcs11", id: "pkcs11:token=amc;object=k" }).catch((e: unknown) => e)) as Error;
    expect(wrong).toMatchObject({ code: "KEY_PROVIDER_AUTH_FAILED" });
    expect(wrong.message).not.toMatch(/0000|1234|softhsm/);
    await expect(pkcs11Provider({ module: pkcs11Fake({ token: "amc", pin: PIN, keys: [] }).module, env: {} }).describe({ provider: "pkcs11", id: "pkcs11:token=amc;object=k" }))
      .rejects.toMatchObject({ code: "KEY_PROVIDER_AUTH_FAILED" });
    await expect(pkcs11Provider({ module: token.module, env: pkcs11Env }).describe({ provider: "pkcs11", id: "pkcs11:token=missing;object=seal-ec" }))
      .rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
  });

  it("signChecked refuses a provider signature that does not verify under the described key", async () => {
    const provider = awsKmsProvider(awsFake({ [AWS_ARN("ed")]: awsEd }).call);
    const description = await provider.describe({ provider: "aws-kms", id: AWS_ARN("ed") });
    const liar: KeyProvider = { ...provider, sign: async () => Buffer.alloc(64, 1) };
    await expect(signChecked(liar, description, Buffer.from("m"))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });

  it("checkedDescription refuses a disallowed algorithm, an exportable key under requireNonExportable and a wrong key id", () => {
    const pem = publicPem(fakeKey("p256"));
    const description = { ref: { provider: "aws-kms" as const, id: AWS_ARN("ec") }, algorithm: "ecdsa-p256-sha256" as const, publicKeyPem: pem, keyId: signingKeyId(pem)!, protection: "hsm" as const, protectionBasis: "provider-metadata" as const, exportable: false };
    expect(() => checkedDescription(description, { allowed: ["ed25519"], requireNonExportable: false })).toThrow(/algorithmPolicy/);
    expect(() => checkedDescription({ ...description, exportable: true }, { allowed: ["ecdsa-p256-sha256"], requireNonExportable: true })).toThrow(/requireNonExportable/);
    expect(() => checkedDescription({ ...description, keyId: "0".repeat(64) }, { allowed: ["ecdsa-p256-sha256"], requireNonExportable: false })).toThrow(/key id/);
  });
});
