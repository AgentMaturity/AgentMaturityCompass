/**
 * Key providers (P2-08): where a signing key lives and how AMC asks it to sign. This is the whole interface P2-09 (data
 * key wrapping) and P2-36 (A4) build on; docs/KEY_PROVIDERS.md documents it.
 *
 * - `describe` returns the public key, its AMC key id (sha256 of the canonical PEM), the algorithm and an honest
 *   protection label: `protectionBasis` says whether it came from the provider's own metadata or from configuration.
 *   Nothing here is ever "attested".
 * - `sign` returns the algorithm's canonical encoding (64 bytes: Ed25519, or ECDSA P-256 in IEEE P1363). AMC checks
 *   every signature against the described public key before using it (signChecked).
 * - `wrapKey`/`unwrapKey` (optional) encrypt a data key under a provider-held key.
 * - No provider has a private-key export. A remote provider describes `exportable: false` or refuses the key.
 *
 * Failures are KeyProviderError: a code and a fixed message, never the provider's own error text, which can carry
 * endpoints, paths, account ids or PINs.
 */
import { canonicalSigningKey, lowS, signingKeyId, verifyCanonical, type SigningAlgorithm } from "./algorithmPolicy.js";

export const KEY_PROVIDER_IDS = ["file", "aws-kms", "gcp-kms", "azure-kv", "pkcs11"] as const;
export type KeyProviderId = (typeof KEY_PROVIDER_IDS)[number];

export interface KeyRef {
  provider: KeyProviderId;
  /** AWS key ARN or id, Google cryptoKey resource name, Azure key URL, PKCS#11 URI, or (file) the vault purpose. */
  id: string;
  version?: string;
}

export type KeyProtection = "software" | "hsm" | "external" | "unknown";

export interface KeyDescription {
  ref: KeyRef;
  algorithm: SigningAlgorithm;
  publicKeyPem: string;
  /** AMC fingerprint: sha256 of the canonical publicKeyPem. */
  keyId: string;
  protection: KeyProtection;
  /** Never "attested": verifying provider key attestations is a follow-up. */
  protectionBasis: "provider-metadata" | "configured";
  /** True only for the development file provider (the vault), which keys.requireNonExportable refuses. */
  exportable: boolean;
}

export interface KeyProvider {
  readonly id: KeyProviderId;
  describe(ref: KeyRef): Promise<KeyDescription>;
  sign(ref: KeyRef, message: Uint8Array): Promise<Uint8Array>;
  wrapKey?(ref: KeyRef, plaintextKey: Uint8Array): Promise<Uint8Array>;
  unwrapKey?(ref: KeyRef, wrapped: Uint8Array): Promise<Uint8Array>;
}

/** Each code and the HTTP status a server should answer with it. */
export const KEY_PROVIDER_ERRORS = {
  /** Unreachable, timed out, slot or token missing, or any provider error not classified below. */
  KEY_PROVIDER_UNAVAILABLE: 503,
  /** Credentials, PIN or login rejected. */
  KEY_PROVIDER_AUTH_FAILED: 503,
  /** The key is missing, disabled, exportable, of a refused algorithm, or not the key the key set binds. */
  KEY_PROVIDER_KEY_REFUSED: 409,
  /** The optional SDK or native module for this provider is not installed. */
  KEY_PROVIDER_NOT_INSTALLED: 501,
  /** The purpose's key is held by a provider: there is no private key to hand to a synchronous signer. */
  KEY_PROVIDER_HELD: 409,
  /** The ledger-row delegate key has no current, valid delegation from the bound provider key. */
  KEY_DELEGATION_INVALID: 409
} as const;
export type KeyProviderErrorCode = keyof typeof KEY_PROVIDER_ERRORS;

export class KeyProviderError extends Error {
  readonly status: number;
  constructor(readonly code: KeyProviderErrorCode, readonly provider: KeyProviderId, detail: string) {
    super(`${code}: ${provider}: ${detail}`);
    this.name = "KeyProviderError";
    this.status = KEY_PROVIDER_ERRORS[code];
  }
}

const FIXED_DETAIL: Record<KeyProviderErrorCode, string> = {
  KEY_PROVIDER_UNAVAILABLE: "the key provider could not be reached or answered with an error",
  KEY_PROVIDER_AUTH_FAILED: "the key provider refused the configured credentials",
  KEY_PROVIDER_KEY_REFUSED: "the key provider refused the key or the request",
  KEY_PROVIDER_NOT_INSTALLED: "the key provider's SDK is not installed",
  KEY_PROVIDER_HELD: "the key is held by the provider",
  KEY_DELEGATION_INVALID: "no valid delegation"
};

/**
 * Classifies a cloud SDK error by its name or code only (AWS exception names, gRPC status codes, HTTP status). The
 * error's text is never copied. The PKCS#11 provider maps its CKR_ return values itself.
 */
function classify(error: unknown): KeyProviderErrorCode {
  const value = (error ?? {}) as { name?: unknown; code?: unknown; statusCode?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const name = `${typeof value.name === "string" ? value.name : ""} ${typeof value.code === "string" ? value.code : ""}`;
  const status = typeof value.statusCode === "number" ? value.statusCode : value.$metadata?.httpStatusCode;
  const grpc = typeof value.code === "number" ? value.code : null;
  if (/AccessDenied|UnrecognizedClient|InvalidSignature|ExpiredToken|IncompleteSignature|CredentialsProvider|CredentialUnavailable|AuthenticationRequired|Unauthorized|Forbidden/i.test(name)
    || grpc === 7 || grpc === 16 || status === 401 || status === 403) return "KEY_PROVIDER_AUTH_FAILED";
  if (/NotFound|Disabled|InvalidState|KeyUnavailable|InvalidKeyUsage|UnsupportedOperation|InvalidKeyId|IncorrectKey/i.test(name)
    || grpc === 5 || grpc === 9 || status === 404) return "KEY_PROVIDER_KEY_REFUSED";
  return "KEY_PROVIDER_UNAVAILABLE";
}

/** A KeyProviderError as is; anything else classified, with a fixed message. */
export function providerFailure(provider: KeyProviderId, error: unknown, action: string): KeyProviderError {
  if (error instanceof KeyProviderError) return error;
  const code = classify(error);
  return new KeyProviderError(code, provider, `${action}: ${FIXED_DETAIL[code]}`);
}

/** Runs one provider call; any failure becomes a KeyProviderError with a fixed message. */
export async function attempt<T>(provider: KeyProviderId, action: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw providerFailure(provider, error, action);
  }
}

/** `describe`, memoized per ref for the provider's lifetime (a failed describe is tried again next time). */
export function memoizedDescribe(describe: (ref: KeyRef) => Promise<KeyDescription>): (ref: KeyRef) => Promise<KeyDescription> {
  const cache = new Map<string, Promise<KeyDescription>>();
  return ref => {
    const key = JSON.stringify([ref.provider, ref.id, ref.version ?? null]);
    const cached = cache.get(key);
    if (cached) return cached;
    const fresh = describe(ref);
    cache.set(key, fresh);
    fresh.catch(() => cache.delete(key));
    return fresh;
  };
}

/** Loads an optional SDK by name; a missing one is KEY_PROVIDER_NOT_INSTALLED naming the package to install. */
export async function importOptional<T>(provider: KeyProviderId, specifier: string): Promise<T> {
  try {
    return await import(specifier) as T;
  } catch {
    throw new KeyProviderError("KEY_PROVIDER_NOT_INSTALLED", provider, `install ${specifier} to use keys provider ${provider}`);
  }
}

export interface KeyPolicy {
  allowed: readonly SigningAlgorithm[];
  requireNonExportable: boolean;
}

/** The description, after checking it names a supported key, its own key id and an algorithm the policy allows. */
export function checkedDescription(description: KeyDescription, policy: KeyPolicy): KeyDescription {
  const provider = description.ref.provider;
  const canonical = canonicalSigningKey(description.publicKeyPem);
  if (canonical === null || canonical.pem !== description.publicKeyPem || canonical.algorithm !== description.algorithm
    || description.keyId !== signingKeyId(description.publicKeyPem)) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, "the provider described a key that is not a canonical Ed25519 or P-256 public key of its stated algorithm and key id");
  }
  if (!policy.allowed.includes(description.algorithm)) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, `${description.algorithm} is not allowed by keys.algorithmPolicy`);
  }
  if (description.exportable && policy.requireNonExportable) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, "keys.requireNonExportable refuses an exportable key");
  }
  return description;
}

/**
 * Signs through the provider and returns the signature only when it verifies under the described public key, in the
 * key's own algorithm (never the provider's word for it) and its one canonical encoding: an ECDSA answer is brought to
 * low S first, the same signature in canonical form.
 */
export async function signChecked(provider: KeyProvider, description: KeyDescription, message: Uint8Array): Promise<Buffer> {
  const algorithm = canonicalSigningKey(description.publicKeyPem)?.algorithm;
  if (algorithm === undefined || algorithm !== description.algorithm) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider.id, "the described algorithm is not the algorithm of the described key");
  }
  const answer = await attempt(provider.id, "sign", () => provider.sign(description.ref, message));
  const signature = algorithm === "ecdsa-p256-sha256" ? lowS(answer) : Buffer.from(answer);
  if (!verifyCanonical(algorithm, message, description.publicKeyPem, signature)) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider.id, "the provider's signature does not verify under the described public key");
  }
  return signature;
}
