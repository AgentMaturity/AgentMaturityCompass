/**
 * Azure Key Vault and Managed HSM (P2-08). Azure has no Ed25519, so signing keys are EC P-256 (`EC`, or `EC-HSM` for
 * HSM protection) signing ES256 over a SHA-256 digest; the result is already r||s (P1363). KeyClient.getKey describes
 * the key; CryptographyClient wrapKey/unwrapKey wrap data keys under an RSA (RSA-OAEP-256) or Managed HSM AES (A256KW)
 * key. The ref id is the key URL on an Azure Key Vault or Managed HSM host; nothing else is accepted, so a token is never
 * offered to another host. The SDKs (@azure/keyvault-keys, @azure/identity with DefaultAzureCredential) are optional peers.
 */
import { createHash, createPublicKey } from "node:crypto";
import { signingKeyId } from "../algorithmPolicy.js";
import { attempt, importOptional, KeyProviderError, memoizedDescribe, type KeyDescription, type KeyProvider, type KeyRef } from "../provider.js";

export interface AzureKey {
  key?: { kty?: string; crv?: string; x?: Uint8Array; y?: Uint8Array };
  properties?: { enabled?: boolean; exportable?: boolean };
}
/** The four Key Vault calls AMC makes; tests inject a fake. */
export interface AzureKeyVaultCalls {
  getKey(vaultUrl: string, name: string, version: string | undefined): Promise<AzureKey>;
  sign(keyUrl: string, algorithm: "ES256", digest: Uint8Array): Promise<{ result: Uint8Array }>;
  wrapKey(keyUrl: string, algorithm: string, key: Uint8Array): Promise<{ result: Uint8Array }>;
  unwrapKey(keyUrl: string, algorithm: string, wrapped: Uint8Array): Promise<{ result: Uint8Array }>;
}

const KEY_URL = /^(https:\/\/[a-z0-9-]{3,24}\.(?:vault\.azure\.net|managedhsm\.azure\.net|vault\.azure\.cn|managedhsm\.azure\.cn|vault\.usgovcloudapi\.net|managedhsm\.usgovcloudapi\.net))\/keys\/([A-Za-z0-9-]{1,127})(?:\/([0-9a-f]{32}))?$/;
const WRAP_ALGORITHMS: Record<string, string> = { RSA: "RSA-OAEP-256", "RSA-HSM": "RSA-OAEP-256", "oct-HSM": "A256KW" };

function refused(detail: string): KeyProviderError {
  return new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "azure-kv", detail);
}

function parsed(ref: KeyRef): { vaultUrl: string; name: string; version: string | undefined; keyUrl: string } {
  const match = KEY_URL.exec(ref.id);
  if (match === null) throw refused("keys ref id must be a key URL on an Azure Key Vault or Managed HSM host");
  const version = ref.version ?? match[3];
  return { vaultUrl: match[1]!, name: match[2]!, version, keyUrl: `${match[1]}/keys/${match[2]}${version ? `/${version}` : ""}` };
}

async function sdkCalls(): Promise<AzureKeyVaultCalls> {
  type Crypto = { sign(a: string, d: Uint8Array): Promise<{ result: Uint8Array }>; wrapKey(a: string, k: Uint8Array): Promise<{ result: Uint8Array }>; unwrapKey(a: string, k: Uint8Array): Promise<{ result: Uint8Array }> };
  const keys = await importOptional<{
    KeyClient: new (url: string, credential: unknown) => { getKey(name: string, options: { version?: string }): Promise<AzureKey> };
    CryptographyClient: new (keyUrl: string, credential: unknown) => Crypto;
  }>("azure-kv", "@azure/keyvault-keys");
  const identity = await importOptional<{ DefaultAzureCredential: new () => unknown }>("azure-kv", "@azure/identity");
  const credential = new identity.DefaultAzureCredential();
  const crypto = (keyUrl: string) => new keys.CryptographyClient(keyUrl, credential);
  return {
    getKey: (vaultUrl, name, version) => new keys.KeyClient(vaultUrl, credential).getKey(name, version === undefined ? {} : { version }),
    sign: (keyUrl, algorithm, digest) => crypto(keyUrl).sign(algorithm, digest),
    wrapKey: (keyUrl, algorithm, key) => crypto(keyUrl).wrapKey(algorithm, key),
    unwrapKey: (keyUrl, algorithm, wrapped) => crypto(keyUrl).unwrapKey(algorithm, wrapped)
  };
}

/** `calls` replaces the SDKs (tests inject a fake); otherwise they are loaded on first use. */
export function azureKeyVaultProvider(calls?: AzureKeyVaultCalls): KeyProvider {
  let azure: Promise<AzureKeyVaultCalls> | null = calls ? Promise.resolve(calls) : null;
  const run = <T>(action: string, call: (client: AzureKeyVaultCalls) => Promise<T>) => attempt("azure-kv", action, async () => call(await (azure ??= sdkCalls())));
  const getKey = (ref: KeyRef) => {
    const { vaultUrl, name, version } = parsed(ref);
    return run("getKey", client => client.getKey(vaultUrl, name, version));
  };
  const wrapAlgorithm = async (ref: KeyRef) => {
    const algorithm = WRAP_ALGORITHMS[String((await getKey(ref)).key?.kty)];
    if (algorithm === undefined) throw refused("only RSA keys or Managed HSM AES keys wrap data keys");
    return algorithm;
  };
  const describe = memoizedDescribe(ref => attempt<KeyDescription>("azure-kv", "describe", async () => {
    const found = await getKey(ref);
    const { kty, crv, x, y } = found.key ?? {};
    if ((kty !== "EC" && kty !== "EC-HSM") || crv !== "P-256" || !x || !y) throw refused("the key is not an EC P-256 key");
    if (found.properties?.enabled === false) throw refused("the key is disabled");
    if (found.properties?.exportable === true) throw refused("the key is marked exportable");
    const jwk = { kty: "EC", crv: "P-256", x: Buffer.from(x).toString("base64url"), y: Buffer.from(y).toString("base64url") };
    const publicKeyPem = createPublicKey({ key: jwk, format: "jwk" }).export({ format: "pem", type: "spki" }).toString();
    return {
      ref, algorithm: "ecdsa-p256-sha256", publicKeyPem, keyId: signingKeyId(publicKeyPem) ?? "",
      protection: kty === "EC-HSM" ? "hsm" : "software", protectionBasis: "provider-metadata", exportable: false
    };
  }));
  return {
    id: "azure-kv",
    describe,
    sign: (ref, message) => attempt("azure-kv", "sign", async () => {
      await describe(ref);
      const digest = createHash("sha256").update(message).digest();
      const { result } = await run("sign", client => client.sign(parsed(ref).keyUrl, "ES256", digest));
      return Buffer.from(result);
    }),
    wrapKey: (ref, plaintextKey) => attempt("azure-kv", "wrapKey", async () => {
      const algorithm = await wrapAlgorithm(ref);
      return Buffer.from((await run("wrapKey", client => client.wrapKey(parsed(ref).keyUrl, algorithm, plaintextKey))).result);
    }),
    unwrapKey: (ref, wrapped) => attempt("azure-kv", "unwrapKey", async () => {
      const algorithm = await wrapAlgorithm(ref);
      return Buffer.from((await run("unwrapKey", client => client.unwrapKey(parsed(ref).keyUrl, algorithm, wrapped))).result);
    })
  };
}
