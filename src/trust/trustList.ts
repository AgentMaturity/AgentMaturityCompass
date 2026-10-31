import { createPublicKey, sign, X509Certificate } from "node:crypto";
import { canonicalSigningKey, SIGNING_ALGORITHMS, signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider } from "../keys/provider.js";
import { z } from "zod";
import { assertNoteKey } from "../transparency/checkpointNote.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { sha256Hex } from "../utils/hash.js";
import { assertNoDuplicateJsonKeys, canonicalize, isCanonicalSignatureBase64 } from "../utils/json.js";
import { KEY_PURPOSES } from "./keyPurposes.js";

export type TrustListErrorCode = "TRUST_LIST_INVALID" | "TRUST_LIST_SIGNATURE_INVALID" | "TRUST_LIST_EXPIRED"
  | "ROLLBACK_DETECTED" | "FORK_DETECTED";

export class TrustListError extends Error {
  constructor(readonly code: TrustListErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TrustListError";
  }
}

export const TRUST_LIST_MAX_BYTES = 1024 * 1024;
const DOMAIN_TAG = "AMC_TRUST_LIST_V1";
const keyIdSchema = z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex");
const utcTimeSchema = z.iso.datetime();

/**
 * The canonical SPKI PEM (Node's export, LF line endings) of an Ed25519 public key. Null for anything else,
 * including private keys and certificates, which createPublicKey would otherwise accept.
 */
export function canonicalEd25519Pem(publicKeyPem: string): string | null {
  if (!publicKeyPem.trimStart().startsWith("-----BEGIN PUBLIC KEY-----")) return null;
  try {
    const key = createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === "ed25519" ? key.export({ format: "pem", type: "spki" }).toString() : null;
  } catch {
    return null;
  }
}

/**
 * AMC fingerprint: sha256 of the UTF-8 PEM text, taken over the canonical PEM so the same key always gets the
 * same id (a CRLF copy cannot slip past a pin or a distrust entry). Null when the PEM is not an Ed25519 public key.
 */
export function ed25519KeyId(publicKeyPem: string): string | null {
  const canonical = canonicalEd25519Pem(publicKeyPem);
  return canonical === null ? null : sha256Hex(Buffer.from(canonical, "utf8"));
}

export const trustListEntrySchema = z.strictObject({
  keyId: keyIdSchema,
  // P2-08: Ed25519, or ECDSA P-256 for keys held where Ed25519 is unavailable (src/keys/algorithmPolicy.ts).
  algorithm: z.enum(SIGNING_ALGORITHMS),
  publicKeyPem: z.string().min(1).max(4096),
  purposes: z.array(z.enum(KEY_PURPOSES)).min(1).refine(purposes => new Set(purposes).size === purposes.length, "purposes must be unique"),
  subject: z.string().min(1),
  validFrom: utcTimeSchema,
  validTo: utcTimeSchema.nullable(),
  revokedAt: utcTimeSchema.optional(),
  revocationReason: z.enum(["superseded", "cessation", "key-compromise", "unspecified"]).optional(),
  allowKeyHistory: z.boolean().optional(),
  source: z.string().regex(/^(operator|amc-project|imported:.+)$/, 'must be "operator", "amc-project" or "imported:<uri>"'),
  authority: z.strictObject({
    producers: z.array(z.string().min(1)).min(1),
    captureMethods: z.array(z.enum(["producer-callback", "governed-capture"])).min(1),
    maxTrustTier: z.enum(["ATTESTED", "OBSERVED"])
  }).optional()
}).superRefine((entry, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const canonical = canonicalSigningKey(entry.publicKeyPem);
  if (canonical?.pem !== entry.publicKeyPem || canonical.algorithm !== entry.algorithm) issue("publicKeyPem must be a canonical SPKI PEM of the entry's algorithm (Ed25519 or ECDSA P-256)");
  else if (signingKeyId(entry.publicKeyPem) !== entry.keyId) issue("sha256 of publicKeyPem must equal keyId");
  if (entry.validTo !== null && Date.parse(entry.validTo) <= Date.parse(entry.validFrom)) issue("validTo must be after validFrom");
  if ((entry.revokedAt === undefined) !== (entry.revocationReason === undefined)) issue("revokedAt and revocationReason go together");
  if (entry.purposes.includes("evidence-authority") && !entry.authority) issue("evidence-authority keys need an authority");
});

export const distrustEntrySchema = z.strictObject({
  keyId: keyIdSchema,
  distrustedFrom: utcTimeSchema.nullable(),
  reason: z.enum(["key-compromise", "exposed-in-public-history", "superseded", "unspecified"]),
  note: z.string(),
  reference: z.string().min(1).optional(),
  source: z.string().min(1)
});

/**
 * P1-25: an RFC 3161 timestamp authority the operator pins. Tokens verify only through a path to one of these
 * certificates (a root, an intermediate, or the TSA certificate itself), never through a certificate a token carries.
 */
export const timestampAuthoritySchema = z.strictObject({
  anchorId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  name: z.string().min(1),
  rootCertificatePem: z.string().min(1).max(16 * 1024),
  policyOids: z.array(z.string().regex(/^[0-2](\.(0|[1-9][0-9]*))+$/)).min(1).optional()
}).superRefine((authority, ctx) => {
  const pemCount = authority.rootCertificatePem.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0;
  let parses = false;
  try { parses = pemCount === 1 && new X509Certificate(authority.rootCertificatePem).raw.length > 0; } catch { /* reported below */ }
  if (!parses) ctx.addIssue({ code: "custom", message: "rootCertificatePem must be exactly one PEM X.509 certificate" });
});

/**
 * P1-26: a public transparency log the operator pins (for example a Rekor v2 shard). Its checkpoints count only when
 * a C2SP signed-note signature under `publicKeyPem` verifies with `origin` as key name and first line; a key a log
 * response carries never counts.
 */
export const transparencyLogSchema = z.strictObject({
  logId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  name: z.string().min(1),
  origin: z.string().max(256).regex(/^[^\s+]+$/, "origin must be non-empty without spaces or plus signs"),
  /** The checkpoint key: an Ed25519 or ECDSA (P-256, P-384, P-521) SPKI public key. */
  publicKeyPem: z.string().min(1).max(4096)
}).superRefine((log, ctx) => {
  let valid = log.publicKeyPem.trimStart().startsWith("-----BEGIN PUBLIC KEY-----");
  try { if (valid) assertNoteKey(log.publicKeyPem); } catch { valid = false; }
  if (!valid) ctx.addIssue({ code: "custom", message: "publicKeyPem must be an Ed25519 or ECDSA P-256, P-384 or P-521 SPKI public key" });
});

export const trustListSchema = z.strictObject({
  type: z.literal("amc.trust-list"),
  version: z.literal(1),
  listId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  sequence: z.number().int().positive().safe(),
  issuedAt: utcTimeSchema,
  expiresAt: utcTimeSchema,
  entries: z.array(trustListEntrySchema).max(4096)
    .refine(entries => new Set(entries.map(entry => entry.keyId)).size === entries.length, "duplicate keyId"),
  distrust: z.array(distrustEntrySchema),
  timestampAuthorities: z.array(timestampAuthoritySchema).max(64)
    .refine(authorities => new Set(authorities.map(authority => authority.anchorId)).size === authorities.length, "duplicate anchorId")
    .optional(),
  transparencyLogs: z.array(transparencyLogSchema).max(64)
    .refine(logs => new Set(logs.map(log => log.logId)).size === logs.length, "duplicate logId")
    .optional(),
  /** P1-08: the list's own m-of-n floor. Verifiers need this many distinct pinned roots whatever their local policy says. */
  rootThreshold: z.number().int().positive().max(64).optional()
});

/** One row per root key, each in its one canonical base64 spelling, so a list has no second encoding of the same signatures. */
export const signedTrustListSchema = z.strictObject({
  signatureVersion: z.literal(2).optional(),
  list: trustListSchema,
  signatures: z.array(z.strictObject({
    keyId: keyIdSchema,
    publicKeyPem: z.string().min(1).max(4096),
    signature: z.string().refine(isCanonicalSignatureBase64, "signature must be canonical base64 of 64 bytes")
  })).max(64).refine(rows => new Set(rows.map(row => row.keyId)).size === rows.length, "one signature per root key")
});

export type TrustListEntry = z.infer<typeof trustListEntrySchema>;
export type DistrustEntry = z.infer<typeof distrustEntrySchema>;
export type TimestampAuthority = z.infer<typeof timestampAuthoritySchema>;
export type TransparencyLog = z.infer<typeof transparencyLogSchema>;
export type TrustList = z.infer<typeof trustListSchema>;
export type SignedTrustList = z.infer<typeof signedTrustListSchema>;

/** Parses with a strict schema, throwing TRUST_LIST_INVALID with the first issue. */
export function parseTrustValue<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TrustListError("TRUST_LIST_INVALID", `${what}: ${first ? `${first.path.join(".") || "(root)"} ${first.message}` : "invalid"}`);
  }
  return parsed.data;
}

/** Absent signatureVersion signs the original v1 bytes; version 2 signs a distinct tag plus SHA-256 of those complete bytes. */
function signedBytes(list: TrustList, signatureVersion: 1 | 2 = 1): Buffer {
  const legacy = Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(list), "utf8")]);
  return signatureVersion === 2 ? Buffer.concat([Buffer.from("AMC_TRUST_LIST_V2_DIGEST\0", "ascii"), Buffer.from(sha256Hex(legacy), "hex")]) : legacy;
}
export { signedBytes as trustListSigningBytes };

export function signTrustList(list: TrustList, rootPrivateKeyPem: string, opts: { signatureVersion?: 1 | 2 } = {}): SignedTrustList {
  const parsed = parseTrustValue(trustListSchema, list, "trust list");
  const publicKeyPem = createPublicKey(rootPrivateKeyPem).export({ format: "pem", type: "spki" }).toString();
  const keyId = ed25519KeyId(publicKeyPem);
  if (keyId === null) throw new TrustListError("TRUST_LIST_INVALID", "the trust-list root key must be Ed25519");
  return { ...(opts.signatureVersion === 2 ? { signatureVersion: 2 as const } : {}), list: parsed,
    signatures: [{ keyId, publicKeyPem, signature: sign(null, signedBytes(parsed, opts.signatureVersion), rootPrivateKeyPem).toString("base64") }] };
}

/** An external root holder supplies its provider and independently pinned public description; no workspace key is selected. */
export async function signTrustListWithProvider(list: TrustList, provider: KeyProvider, description: KeyDescription, opts: { signatureVersion?: 1 | 2 } = {}): Promise<SignedTrustList> {
  const parsed = parseTrustValue(trustListSchema, list, "trust list");
  const key = checkedDescription({ ...description, ref: { ...description.ref } }, { allowed: SIGNING_ALGORITHMS, requireNonExportable: false });
  if (provider.id !== key.ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider.id, "the pinned description belongs to another provider");
  const signatureVersion = opts.signatureVersion ?? 1;
  const signature = await signChecked(provider, key, signedBytes(parsed, signatureVersion));
  return { ...(signatureVersion === 2 ? { signatureVersion: 2 as const } : {}), list: parsed,
    signatures: [{ keyId: key.keyId, publicKeyPem: key.publicKeyPem, signature: signature.toString("base64") }] };
}

/**
 * Returns the list when `threshold` (default 1) distinct pinned roots signed it and it has not expired; throws otherwise.
 * Every signature row must verify under the key it names, pinned or not, so a list carries no unverifiable extra rows.
 */
export function verifySignedTrustList(signed: unknown, opts: { pinnedRootKeyIds: readonly string[]; now: Date; threshold?: number }): TrustList {
  const { list, signatures, signatureVersion } = parseTrustValue(signedTrustListSchema, signed, "signed trust list");
  const bytes = signedBytes(list, signatureVersion);
  // Never below the floor the signed list declares: a weaker local policy cannot downgrade m-of-n.
  const threshold = Math.max(1, opts.threshold ?? 1, list.rootThreshold ?? 1);
  // A root may be Ed25519 or ECDSA P-256 (P1363 only, P2-08).
  const bad = signatures.find(({ keyId, publicKeyPem, signature }) => signingKeyId(publicKeyPem) !== keyId || !verifyWithKey(bytes, publicKeyPem, Buffer.from(signature, "base64")));
  if (bad) throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID", `list "${list.listId}" carries a signature by ${bad.keyId} that does not verify`);
  const pinned = signatures.filter(({ keyId }) => opts.pinnedRootKeyIds.includes(keyId)).length;
  if (pinned < threshold) {
    throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID",
      `list "${list.listId}" has ${pinned} valid signature(s) by pinned roots; ${threshold} required (${opts.pinnedRootKeyIds.length} pinned)`);
  }
  if (opts.now.getTime() >= Date.parse(list.expiresAt)) {
    throw new TrustListError("TRUST_LIST_EXPIRED", `list "${list.listId}" expired at ${list.expiresAt}`);
  }
  return list;
}

/**
 * Reads a JSON file of at most 1 MiB without following a final symlink. A "__proto__" key is refused: the strict
 * schemas would silently drop it, so a signed file could carry it without breaking its signature. A repeated key is
 * refused too: JSON.parse keeps the last one, and another verifier's parser may keep the first.
 */
export function readSignedTrustListFile(path: string): unknown {
  let bytes: Buffer;
  try {
    bytes = boundedFile(path, TRUST_LIST_MAX_BYTES);
  } catch (error) {
    throw new TrustListError("TRUST_LIST_INVALID", `${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseTrustJson(bytes, path);
}

/** JSON for trust files: refuses `__proto__` and repeated keys, throwing TRUST_LIST_INVALID. */
export function parseTrustJson(bytes: Buffer, what: string): unknown {
  try {
    const text = bytes.toString("utf8");
    const value = JSON.parse(text, (key, value: unknown) => {
      if (key === "__proto__") throw new Error("unknown field __proto__");
      return value;
    }) as unknown;
    assertNoDuplicateJsonKeys(text);
    return value;
  } catch (error) {
    throw new TrustListError("TRUST_LIST_INVALID", `${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
