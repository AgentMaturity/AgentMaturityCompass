import { createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { KEY_PURPOSES } from "./keyPurposes.js";

export type TrustListErrorCode = "TRUST_LIST_INVALID" | "TRUST_LIST_SIGNATURE_INVALID" | "TRUST_LIST_EXPIRED";

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

/** AMC fingerprint: sha256 of the UTF-8 PEM text. Null when the PEM is not an Ed25519 public key. */
export function ed25519KeyId(publicKeyPem: string): string | null {
  try {
    return createPublicKey(publicKeyPem).asymmetricKeyType === "ed25519" ? sha256Hex(Buffer.from(publicKeyPem, "utf8")) : null;
  } catch {
    return null;
  }
}

export const trustListEntrySchema = z.strictObject({
  keyId: keyIdSchema,
  algorithm: z.literal("ed25519"),
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
  if (ed25519KeyId(entry.publicKeyPem) === null) issue("publicKeyPem must be an Ed25519 SPKI public key");
  else if (ed25519KeyId(entry.publicKeyPem) !== entry.keyId) issue("sha256 of publicKeyPem must equal keyId");
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

export const trustListSchema = z.strictObject({
  type: z.literal("amc.trust-list"),
  version: z.literal(1),
  listId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  sequence: z.number().int().positive().safe(),
  issuedAt: utcTimeSchema,
  expiresAt: utcTimeSchema,
  entries: z.array(trustListEntrySchema).max(4096)
    .refine(entries => new Set(entries.map(entry => entry.keyId)).size === entries.length, "duplicate keyId"),
  distrust: z.array(distrustEntrySchema)
});

export const signedTrustListSchema = z.strictObject({
  list: trustListSchema,
  signatures: z.array(z.strictObject({ keyId: keyIdSchema, publicKeyPem: z.string().min(1).max(4096), signature: z.string().min(1) }))
});

export type TrustListEntry = z.infer<typeof trustListEntrySchema>;
export type DistrustEntry = z.infer<typeof distrustEntrySchema>;
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

/** Domain-separated bytes, signed directly and never through signHexDigest. */
function signedBytes(list: TrustList): Buffer {
  return Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(list), "utf8")]);
}

export function signTrustList(list: TrustList, rootPrivateKeyPem: string): SignedTrustList {
  const parsed = parseTrustValue(trustListSchema, list, "trust list");
  const publicKeyPem = createPublicKey(rootPrivateKeyPem).export({ format: "pem", type: "spki" }).toString();
  const keyId = ed25519KeyId(publicKeyPem);
  if (keyId === null) throw new TrustListError("TRUST_LIST_INVALID", "the trust-list root key must be Ed25519");
  return { list: parsed, signatures: [{ keyId, publicKeyPem, signature: sign(null, signedBytes(parsed), rootPrivateKeyPem).toString("base64") }] };
}

/** Returns the list when one signature verifies under a pinned root and the list has not expired; throws otherwise. */
export function verifySignedTrustList(signed: unknown, opts: { pinnedRootKeyIds: readonly string[]; now: Date }): TrustList {
  const { list, signatures } = parseTrustValue(signedTrustListSchema, signed, "signed trust list");
  const bytes = signedBytes(list);
  const valid = signatures.some(({ keyId, publicKeyPem, signature }) => {
    if (!opts.pinnedRootKeyIds.includes(keyId) || ed25519KeyId(publicKeyPem) !== keyId) return false;
    try {
      return verify(null, bytes, publicKeyPem, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  });
  if (!valid) {
    throw new TrustListError("TRUST_LIST_SIGNATURE_INVALID",
      `list "${list.listId}" has no valid signature by a pinned root (${opts.pinnedRootKeyIds.length} pinned)`);
  }
  if (opts.now.getTime() >= Date.parse(list.expiresAt)) {
    throw new TrustListError("TRUST_LIST_EXPIRED", `list "${list.listId}" expired at ${list.expiresAt}`);
  }
  return list;
}

/** Reads a JSON file of at most 1 MiB without following a final symlink. */
export function readSignedTrustListFile(path: string): unknown {
  try {
    return JSON.parse(boundedFile(path, TRUST_LIST_MAX_BYTES).toString("utf8")) as unknown;
  } catch (error) {
    throw new TrustListError("TRUST_LIST_INVALID", `${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
