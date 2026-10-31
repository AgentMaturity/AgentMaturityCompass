/**
 * AWS KMS (P2-08). Ed25519 keys (key spec ECC_NIST_EDWARDS25519) sign with ED25519_SHA_512 over the raw message (pure
 * Ed25519); P-256 keys (ECC_NIST_P256) with ECDSA_SHA_256, whose DER answer becomes P1363. GetPublicKey and DescribeKey
 * describe the key; Encrypt and Decrypt wrap data keys under a symmetric key. The SDK (@aws-sdk/client-kms) is an
 * optional peer, loaded on first use; credentials and region come from the SDK's default chain or the key ARN, never
 * from AMC config, and there is no endpoint override.
 */
import { createPublicKey } from "node:crypto";
import { derToP1363, signingKeyId, type SigningAlgorithm } from "../algorithmPolicy.js";
import { attempt, importOptional, KeyProviderError, memoizedDescribe, type KeyDescription, type KeyProtection, type KeyProvider, type KeyRef } from "../provider.js";

export type KmsOperation = "GetPublicKey" | "DescribeKey" | "Sign" | "Encrypt" | "Decrypt";
/** One KMS API call: the operation name, its input and the region (from the ARN; undefined uses the SDK default). */
export type KmsCall = (operation: KmsOperation, input: Record<string, unknown>, region: string | undefined) => Promise<Record<string, unknown>>;

const KEY_ID = /^(?:arn:aws[a-z-]*:kms:([a-z0-9-]+):\d{12}:(?:key|alias)\/[A-Za-z0-9/_+=.@-]{1,256}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|mrk-[0-9a-f]{32}|alias\/[A-Za-z0-9/_-]{1,250})$/;
/** RAW message limit of the Sign operation. */
const MAX_RAW_MESSAGE = 4096;
const SIGNING: Record<string, { algorithm: SigningAlgorithm; kms: string }> = {
  ECC_NIST_EDWARDS25519: { algorithm: "ed25519", kms: "ED25519_SHA_512" },
  ECC_NIST_P256: { algorithm: "ecdsa-p256-sha256", kms: "ECDSA_SHA_256" }
};
const PROTECTION: Record<string, KeyProtection> = { AWS_KMS: "hsm", AWS_CLOUDHSM: "hsm", EXTERNAL_KEY_STORE: "external" };

function refused(detail: string): KeyProviderError {
  return new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "aws-kms", detail);
}

function regionOf(ref: KeyRef): string | undefined {
  const match = KEY_ID.exec(ref.id);
  if (match === null) throw refused("keys ref id must be a KMS key ARN, key id or alias");
  if (ref.version !== undefined) throw refused("KMS asymmetric keys have no versions; drop keys ref version");
  return match[1];
}

async function sdkCall(): Promise<KmsCall> {
  type Sdk = { KMSClient: new (config: { region?: string }) => { send(command: unknown): Promise<Record<string, unknown>> } } & Record<string, unknown>;
  const sdk = await importOptional<Sdk>("aws-kms", "@aws-sdk/client-kms");
  const clients = new Map<string, InstanceType<Sdk["KMSClient"]>>();
  return async (operation, input, region) => {
    const client = clients.get(region ?? "") ?? new sdk.KMSClient(region === undefined ? {} : { region });
    clients.set(region ?? "", client);
    const Command = sdk[`${operation}Command`] as new (input: Record<string, unknown>) => unknown;
    return client.send(new Command(input));
  };
}

/** `call` replaces the SDK (tests inject a fake); otherwise @aws-sdk/client-kms is loaded on first use. */
export function awsKmsProvider(call?: KmsCall): KeyProvider {
  let kms: Promise<KmsCall> | null = call ? Promise.resolve(call) : null;
  const send = (operation: KmsOperation, input: Record<string, unknown>, ref: KeyRef) => {
    const region = regionOf(ref);
    return attempt("aws-kms", operation, async () => (await (kms ??= sdkCall()))(operation, input, region));
  };
  const describe = memoizedDescribe((ref: KeyRef) => attempt<KeyDescription>("aws-kms", "describe", async () => {
    const key = await send("GetPublicKey", { KeyId: ref.id }, ref);
    const meta = ((await send("DescribeKey", { KeyId: ref.id }, ref)).KeyMetadata ?? {}) as Record<string, unknown>;
    const signing = SIGNING[String(key.KeySpec)];
    if (meta.KeyState !== "Enabled") throw refused("the key is not enabled");
    if (key.KeyUsage !== "SIGN_VERIFY" || signing === undefined || !(key.SigningAlgorithms as unknown[] | undefined)?.includes(signing.kms)) {
      throw refused("the key is not an ECC_NIST_EDWARDS25519 or ECC_NIST_P256 signing key");
    }
    const publicKeyPem = createPublicKey({ key: Buffer.from(key.PublicKey as Uint8Array), format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
    return {
      ref, algorithm: signing.algorithm, publicKeyPem, keyId: signingKeyId(publicKeyPem) ?? "",
      protection: PROTECTION[String(meta.Origin)] ?? "unknown", protectionBasis: "provider-metadata", exportable: false
    };
  }));
  return {
    id: "aws-kms",
    describe,
    sign: (ref, message) => attempt("aws-kms", "sign", async () => {
      const { algorithm } = await describe(ref);
      if (message.length > MAX_RAW_MESSAGE) throw refused(`KMS signs raw messages of at most ${MAX_RAW_MESSAGE} bytes`);
      const out = await send("Sign", { KeyId: ref.id, Message: message, MessageType: "RAW", SigningAlgorithm: algorithm === "ed25519" ? "ED25519_SHA_512" : "ECDSA_SHA_256" }, ref);
      const signature = Buffer.from(out.Signature as Uint8Array);
      if (algorithm === "ed25519") return signature;
      try { return derToP1363(signature); } catch { throw refused("KMS answered with a malformed ECDSA signature"); }
    }),
    wrapKey: (ref, plaintextKey) => attempt("aws-kms", "wrapKey", async () => {
      return Buffer.from((await send("Encrypt", { KeyId: ref.id, Plaintext: plaintextKey }, ref)).CiphertextBlob as Uint8Array);
    }),
    unwrapKey: (ref, wrapped) => attempt("aws-kms", "unwrapKey", async () => {
      return Buffer.from((await send("Decrypt", { KeyId: ref.id, CiphertextBlob: wrapped }, ref)).Plaintext as Uint8Array);
    })
  };
}
