/** P2-08 provider boundary regression; injected clients and token fakes never use real services. */
import { describe, expect, it } from "vitest";
import { gcpKmsProvider } from "../../src/keys/providers/gcpKms.js";
import { signChecked, type KeyRef } from "../../src/keys/provider.js";
import { GCP_KEY, GCP_WRAP_KEY, fakeKey, gcpFake } from "./providerFakes.js";

const signing: KeyRef = { provider: "gcp-kms", id: GCP_KEY, version: "1" };
const wrapping: KeyRef = { provider: "gcp-kms", id: GCP_WRAP_KEY };

describe("Google KMS fake preserves a cryptoKey's immutable purpose", () => {
  it("signs with the signing key and round-trips a DEK under a distinct encryption resource", async () => {
    const fake = gcpFake(fakeKey("ed25519"), "SOFTWARE");
    const provider = gcpKmsProvider(fake.call);
    const description = await provider.describe(signing);
    expect(await signChecked(provider, description, Buffer.from("AMC_GOOGLE_KEY_PURPOSE_V1"))).toHaveLength(64);
    const dek = Buffer.alloc(32, 7);
    const sealed = await provider.wrapKey!(wrapping, dek);
    expect(Buffer.from(await provider.unwrapKey!(wrapping, sealed))).toEqual(dek);
    const requests = fake.requests.filter(row => row.operation === "encrypt" || row.operation === "decrypt");
    expect(requests.map(row => row.request.name)).toEqual([GCP_WRAP_KEY, GCP_WRAP_KEY]);
    expect(GCP_WRAP_KEY).not.toBe(GCP_KEY);
  });

  it("refuses use of the signing resource for encryption or decryption", async () => {
    const provider = gcpKmsProvider(gcpFake(fakeKey("ed25519"), "SOFTWARE").call);
    await expect(provider.wrapKey!(signing, Buffer.alloc(32, 7))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    await expect(provider.unwrapKey!(signing, Buffer.alloc(32))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });

  it("refuses use of an encryption key version for signing or public-key description", async () => {
    const provider = gcpKmsProvider(gcpFake(fakeKey("ed25519"), "SOFTWARE").call);
    const encryptionVersion: KeyRef = { ...wrapping, version: "1" };
    await expect(provider.describe(encryptionVersion)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    await expect(provider.sign(encryptionVersion, Buffer.from("m"))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });
});
