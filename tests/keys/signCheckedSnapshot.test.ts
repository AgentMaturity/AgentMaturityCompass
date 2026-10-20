import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, test } from "vitest";
import { signChecked, type KeyDescription, type KeyProvider } from "../../src/keys/provider.js";
import { signingKeyId, verifyWithKey } from "../../src/keys/algorithmPolicy.js";

function fixture() {
  const keys = generateKeyPairSync("ed25519");
  const pem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const description: KeyDescription = { ref: { provider: "aws-kms", id: "owned-original-ref" }, algorithm: "ed25519", publicKeyPem: pem,
    keyId: signingKeyId(pem)!, protection: "software", protectionBasis: "provider-metadata", exportable: false };
  return { keys, description };
}
const provider = (description: KeyDescription, operation: KeyProvider["sign"]): KeyProvider => ({ id: "aws-kms", describe: async () => description, sign: operation });
const publicPem = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();

describe("signChecked pins its received authorization and message before awaiting an untrusted provider", () => {
  test.each(["provider", "key-id"] as const)("an inconsistent %s description refuses before the provider is asked to sign", async (kind) => {
    const { keys, description } = fixture(); let calls = 0;
    if (kind === "provider") description.ref.provider = "gcp-kms";
    else description.keyId = "0".repeat(64);
    const holder = provider(description, async (_ref, message) => { ++calls; return sign(null, message, keys.privateKey); });
    await expect(signChecked(holder, description, Buffer.from("owned bytes"))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(calls).toBe(0);
  });

  test("a provider cannot mutate the caller's signed message and obtain success for substituted bytes", async () => {
    const { keys, description } = fixture(), message = Buffer.from("original authorized bytes"), original = Buffer.from(message);
    const holder = provider(description, async (_ref, bytes) => { bytes[0] = bytes[0]! ^ 1; return sign(null, bytes, keys.privateKey); });
    await expect(signChecked(holder, description, message)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(message).toEqual(original);
  });

  test("a provider cannot replace its original public description with the key that made its answer", async () => {
    const { description } = fixture(), replacement = generateKeyPairSync("ed25519"), bytes = Buffer.from("authorized original signer");
    const holder = provider(description, async (_ref, message) => {
      description.publicKeyPem = publicPem(replacement.publicKey); description.keyId = signingKeyId(description.publicKeyPem)!;
      return sign(null, message, replacement.privateKey);
    });
    await expect(signChecked(holder, description, bytes)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });

  test("a valid answer retains the caller's ref even when the provider changes its received request", async () => {
    const { keys, description } = fixture(), bytes = Buffer.from("authorized original ref");
    const holder = provider(description, async (ref, message) => { ref.id = "provider-mutated-ref"; return sign(null, message, keys.privateKey); });
    const signature = await signChecked(holder, description, bytes);
    expect(description.ref).toEqual({ provider: "aws-kms", id: "owned-original-ref" });
    expect(verifyWithKey(bytes, description.publicKeyPem, signature)).toBe(true);
  });
});
