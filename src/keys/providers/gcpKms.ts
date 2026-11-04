/**
 * Google Cloud KMS (P2-08). `asymmetricSign` takes the raw data for EC_SIGN_ED25519 (PureEdDSA; Google lists it for the
 * SOFTWARE protection level only) and a SHA-256 digest for EC_SIGN_P256_SHA256, whose DER answer becomes P1363.
 * `getPublicKey` gives the key and its protection level; `encrypt`/`decrypt` wrap data keys. The ref id is the
 * cryptoKey resource name and `version` its cryptoKeyVersion (required to sign). The SDK (@google-cloud/kms) is an
 * optional peer with Application Default Credentials; AMC config never sets an endpoint.
 */
import { createHash, createPublicKey } from "node:crypto";
import { derToP1363, signingKeyId, type SigningAlgorithm } from "../algorithmPolicy.js";
import { attempt, importOptional, KeyProviderError, memoizedDescribe, type KeyDescription, type KeyProtection, type KeyProvider, type KeyRef } from "../provider.js";

export type GcpKmsOperation = "getPublicKey" | "asymmetricSign" | "encrypt" | "decrypt";
/** One KeyManagementServiceClient call; resolves to the response (the first element of the SDK's tuple). */
export type GcpKmsCall = (operation: GcpKmsOperation, request: Record<string, unknown>) => Promise<Record<string, unknown>>;

const SEGMENT = "[A-Za-z0-9._:-]{1,100}";
const KEY_NAME = new RegExp(`^projects/${SEGMENT}/locations/${SEGMENT}/keyRings/${SEGMENT}/cryptoKeys/${SEGMENT}$`);
const ALGORITHMS: Record<string, SigningAlgorithm> = { EC_SIGN_ED25519: "ed25519", EC_SIGN_P256_SHA256: "ecdsa-p256-sha256" };
const PROTECTION: Record<string, KeyProtection> = { HSM: "hsm", SOFTWARE: "software", EXTERNAL: "external", EXTERNAL_VPC: "external" };

function refused(detail: string): KeyProviderError {
  return new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "gcp-kms", detail);
}

function keyName(ref: KeyRef): string {
  if (!KEY_NAME.test(ref.id)) throw refused("keys ref id must be a cryptoKey resource name (projects/…/cryptoKeys/…)");
  return ref.id;
}

function versionName(ref: KeyRef): string {
  if (ref.version === undefined || !/^[1-9][0-9]{0,9}$/.test(ref.version)) throw refused("keys ref version must name the cryptoKeyVersion to sign with");
  return `${keyName(ref)}/cryptoKeyVersions/${ref.version}`;
}

async function sdkCall(): Promise<GcpKmsCall> {
  type Client = Record<GcpKmsOperation, (request: Record<string, unknown>) => Promise<unknown[]>>;
  const sdk = await importOptional<{ KeyManagementServiceClient: new () => Client }>("gcp-kms", "@google-cloud/kms");
  const client = new sdk.KeyManagementServiceClient();
  return async (operation, request) => (await client[operation](request))[0] as Record<string, unknown>;
}

/** `call` replaces the SDK (tests inject a fake); otherwise @google-cloud/kms is loaded on first use. */
export function gcpKmsProvider(call?: GcpKmsCall): KeyProvider {
  let kms: Promise<GcpKmsCall> | null = call ? Promise.resolve(call) : null;
  const send = (operation: GcpKmsOperation, request: Record<string, unknown>) =>
    attempt("gcp-kms", operation, async () => (await (kms ??= sdkCall()))(operation, request));
  const describe = memoizedDescribe(ref => attempt<KeyDescription>("gcp-kms", "describe", async () => {
    const key = await send("getPublicKey", { name: versionName(ref) });
    const algorithm = ALGORITHMS[String(key.algorithm)];
    if (algorithm === undefined || typeof key.pem !== "string") throw refused("the key version is not an EC_SIGN_ED25519 or EC_SIGN_P256_SHA256 key");
    const publicKeyPem = createPublicKey(key.pem).export({ format: "pem", type: "spki" }).toString();
    return {
      ref, algorithm, publicKeyPem, keyId: signingKeyId(publicKeyPem) ?? "",
      protection: PROTECTION[String(key.protectionLevel)] ?? "unknown", protectionBasis: "provider-metadata", exportable: false
    };
  }));
  return {
    id: "gcp-kms",
    describe,
    sign: (ref, message) => attempt("gcp-kms", "sign", async () => {
      const { algorithm } = await describe(ref);
      const request = algorithm === "ed25519"
        ? { name: versionName(ref), data: Buffer.from(message) }
        : { name: versionName(ref), digest: { sha256: createHash("sha256").update(message).digest() } };
      const signature = Buffer.from((await send("asymmetricSign", request)).signature as Uint8Array);
      if (algorithm === "ed25519") return signature;
      try { return derToP1363(signature); } catch { throw refused("Cloud KMS answered with a malformed ECDSA signature"); }
    }),
    wrapKey: (ref, plaintextKey) => attempt("gcp-kms", "wrapKey", async () => {
      return Buffer.from((await send("encrypt", { name: keyName(ref), plaintext: Buffer.from(plaintextKey) })).ciphertext as Uint8Array);
    }),
    unwrapKey: (ref, wrapped) => attempt("gcp-kms", "unwrapKey", async () => {
      return Buffer.from((await send("decrypt", { name: keyName(ref), ciphertext: Buffer.from(wrapped) })).plaintext as Uint8Array);
    })
  };
}
