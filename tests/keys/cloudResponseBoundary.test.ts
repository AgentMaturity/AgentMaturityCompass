/** P2-08 provider boundary regression; injected clients and token fakes never use real services. */
import { describe, expect, it } from "vitest";
import { awsKmsProvider, type KmsCall } from "../../src/keys/providers/awsKms.js";
import { gcpKmsProvider, type GcpKmsCall } from "../../src/keys/providers/gcpKms.js";
import { azureKeyVaultProvider, type AzureKeyVaultCalls } from "../../src/keys/providers/azureKeyVault.js";
import { KeyProviderError, type KeyProvider, type KeyProviderId, type KeyRef } from "../../src/keys/provider.js";
import { AWS_ARN, AZURE_KEY, AZURE_WRAP_KEY, GCP_KEY, awsFake, azureFake, fakeKey, gcpFake } from "./providerFakes.js";

type Operation = "describe" | "sign" | "wrapKey" | "unwrapKey";
const operations: Operation[] = ["describe", "sign", "wrapKey", "unwrapKey"];
const secret = "PIN=642807 https://private-kms.example /private/token/module.so account-998877";
const message = Buffer.from("AMC_P2_08_PUBLIC_PROVIDER_FAILURE_V1");

/** Getters model a decoder failing while inspecting a reply, after the SDK promise resolved successfully. */
function poisoned(field: string): Record<string, unknown> {
  return Object.defineProperty({}, field, { enumerable: true, get() { throw new Error(secret); } });
}

function scenario(providerId: KeyProviderId, operation: Operation, throwsWhileDecoding: boolean): { provider: KeyProvider; ref: KeyRef } {
  if (providerId === "aws-kms") {
    const fake = awsFake({ [AWS_ARN("ed")]: fakeKey("ed25519") });
    const operationName = { describe: "GetPublicKey", sign: "Sign", wrapKey: "Encrypt", unwrapKey: "Decrypt" }[operation];
    const field = { describe: "PublicKey", sign: "Signature", wrapKey: "CiphertextBlob", unwrapKey: "Plaintext" }[operation];
    // Preserve the throwing getter itself; spreading a poisoned reply would throw inside the mock SDK instead.
    const preservingCall: KmsCall = async (name, input, region) => {
      if (name !== operationName) return fake.call(name, input, region);
      const valid = name === "GetPublicKey" ? await fake.call(name, input, region) : {};
      return Object.defineProperty(valid, field, throwsWhileDecoding
        ? { configurable: true, get() { throw new Error(secret); } }
        : { configurable: true, value: undefined });
    };
    return { provider: awsKmsProvider(preservingCall), ref: { provider: providerId, id: AWS_ARN("ed") } };
  }
  if (providerId === "gcp-kms") {
    const fake = gcpFake(fakeKey("ed25519"), "SOFTWARE");
    const operationName = { describe: "getPublicKey", sign: "asymmetricSign", wrapKey: "encrypt", unwrapKey: "decrypt" }[operation];
    const field = { describe: "pem", sign: "signature", wrapKey: "ciphertext", unwrapKey: "plaintext" }[operation];
    const call: GcpKmsCall = async (name, request) => {
      if (name !== operationName) return fake.call(name, request);
      const valid = name === "getPublicKey" ? await fake.call(name, request) : {};
      return Object.defineProperty(valid, field, throwsWhileDecoding
        ? { configurable: true, get() { throw new Error(secret); } }
        : { configurable: true, value: operation === "describe" ? "malformed public key" : undefined });
    };
    return { provider: gcpKmsProvider(call), ref: { provider: providerId, id: operation === "wrapKey" || operation === "unwrapKey" ? GCP_KEY.replace("artifact-seal", "data-key") : GCP_KEY, version: "1" } };
  }
  const fake = azureFake(fakeKey("p256"));
  const calls: AzureKeyVaultCalls = {
    ...fake.calls,
    getKey: async (...args) => {
      if (operation !== "describe") return fake.calls.getKey(...args);
      if (throwsWhileDecoding) return poisoned("key");
      return { key: { kty: "EC-HSM", crv: "P-256", x: Buffer.alloc(32), y: Buffer.alloc(32) }, properties: { enabled: true } };
    },
    sign: async (...args) => operation === "sign" ? (throwsWhileDecoding ? poisoned("result") : {}) as { result: Uint8Array } : fake.calls.sign(...args),
    wrapKey: async (...args) => operation === "wrapKey" ? (throwsWhileDecoding ? poisoned("result") : {}) as { result: Uint8Array } : fake.calls.wrapKey(...args),
    unwrapKey: async (...args) => operation === "unwrapKey" ? (throwsWhileDecoding ? poisoned("result") : {}) as { result: Uint8Array } : fake.calls.unwrapKey(...args)
  };
  return { provider: azureKeyVaultProvider(calls), ref: { provider: "azure-kv", id: operation === "wrapKey" || operation === "unwrapKey" ? AZURE_WRAP_KEY : AZURE_KEY } };
}

function invoke(provider: KeyProvider, ref: KeyRef, operation: Operation): Promise<unknown> {
  if (operation === "describe") return provider.describe(ref);
  if (operation === "sign") return provider.sign(ref, message);
  if (operation === "wrapKey") return provider.wrapKey!(ref, Buffer.alloc(32, 7));
  return provider.unwrapKey!(ref, Buffer.alloc(32, 8));
}

describe.each(["aws-kms", "gcp-kms", "azure-kv"] as const)("%s direct public-operation response boundary", providerId => {
  it.each(operations)("maps malformed %s replies to fixed typed errors", async operation => {
    const { provider, ref } = scenario(providerId, operation, false);
    const error: unknown = await invoke(provider, ref, operation).then(() => null, failure => failure);
    expect(error).toBeInstanceOf(KeyProviderError);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", provider: providerId, status: 503 });
  });

  it.each(operations)("redacts a decoder's raw error from direct %s", async operation => {
    const { provider, ref } = scenario(providerId, operation, true);
    const error: unknown = await invoke(provider, ref, operation).then(() => null, failure => failure);
    expect(error).toBeInstanceOf(KeyProviderError);
    expect(error).toMatchObject({
      code: "KEY_PROVIDER_UNAVAILABLE", provider: providerId, status: 503,
      message: `KEY_PROVIDER_UNAVAILABLE: ${providerId}: ${operation}: the key provider could not be reached or answered with an error`
    });
    expect(String(error)).not.toContain(secret);
  });
});
