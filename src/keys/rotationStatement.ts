/**
 * Key rotation statements (P1-08). One signed, chained statement per rotation of a (workspaceId, purpose) key. It
 * replaces amc.monitor-key-rotation receipts for new rotations; src/crypto/keyRotationReceipt.ts still verifies old ones.
 * A statement never changes a verifier's pins by itself: the trust-list owner publishes a new list that sets the old
 * key's validTo to overlap.notAfter and adds the new key. issuedAt is the signer's claim (P1-25 adds a timestamp token).
 *
 * Authority never comes from the statement's own fields. The key it rotates FROM is the one the verifier already
 * trusts (its verified chain, or the purpose's current key); the `next` signature only proves possession of the new key.
 * A signed statement exists in exactly one byte encoding (canonical JSON, sorted unique signature rows, canonical
 * base64, PEM and timestamps), so two different byte strings never verify as the same statement.
 */
import { sign, verify } from "node:crypto";
import { z } from "zod";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { KEY_PURPOSES, type KeyPurpose } from "../trust/keyPurposes.js";
import { canonicalEd25519Pem, ed25519KeyId } from "../trust/trustList.js";
import { sha256Hex } from "../utils/hash.js";
import { isExactIsoTime } from "../utils/time.js";
import { canonicalize, isCanonicalSignatureBase64, parseCanonicalJson } from "../utils/json.js";

export const ROTATION_REASONS = ["scheduled", "superseded", "purpose-split", "key-compromise"] as const;
export type RotationReason = (typeof ROTATION_REASONS)[number];
/** keys.maxOverlapDays: the longest both keys may be valid at once. */
export const DEFAULT_MAX_OVERLAP_DAYS = 30;
const DOMAIN_TAG = "AMC_KEY_ROTATION_V1";
const DAY_MS = 86_400_000;
const ROLE_ORDER = ["previous", "next", "root"] as const;

const keyIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
/** One spelling per instant: the toISOString form, so a re-spelled time is a different (unsigned) statement. */
const timeSchema = z.iso.datetime().refine(isExactIsoTime, "time must be in toISOString form");

const keyRotationStatementSchema = z.strictObject({
  type: z.literal("amc.key-rotation"),
  version: z.literal(1),
  workspaceId: z.string().min(1).max(256),
  // A trust-list root set rotates with an amc.root-rotation statement (src/trust/rootRotation.ts), never this one.
  purpose: z.enum(KEY_PURPOSES).refine(purpose => purpose !== "trust-list-root", "trust-list roots rotate with amc.root-rotation"),
  sequence: z.number().int().positive().safe(),
  previousStatementSha256: keyIdSchema.nullable(),
  previousKeyId: keyIdSchema.nullable(),
  nextKeyId: keyIdSchema,
  nextPublicKeyPem: z.string().min(1).max(4096).refine(pem => canonicalEd25519Pem(pem) === pem, "nextPublicKeyPem must be a canonical Ed25519 SPKI PEM"),
  reason: z.enum(ROTATION_REASONS),
  overlap: z.strictObject({ notBefore: timeSchema, notAfter: timeSchema }).nullable(),
  issuedAt: timeSchema
});

const signatureRowSchema = z.strictObject({
  by: z.enum(ROLE_ORDER),
  keyId: keyIdSchema,
  signature: z.string().refine(isCanonicalSignatureBase64, "signature must be canonical base64 of 64 bytes")
});
type SignatureRow = z.infer<typeof signatureRowSchema>;
const rowOrder = (a: SignatureRow, b: SignatureRow) => ROLE_ORDER.indexOf(a.by) - ROLE_ORDER.indexOf(b.by) || a.keyId.localeCompare(b.keyId);

export const signedKeyRotationStatementSchema = z.strictObject({
  statement: keyRotationStatementSchema,
  signatures: z.array(signatureRowSchema).min(1).max(64).refine(
    rows => rows.every((row, index) => index === 0 || rowOrder(rows[index - 1]!, row) < 0),
    "signatures must be sorted by role then keyId, one per key and role")
});

export type KeyRotationStatementV1 = z.infer<typeof keyRotationStatementSchema>;
export type SignedKeyRotationStatement = z.infer<typeof signedKeyRotationStatementSchema>;

/** The signed bytes: the tag, one 0x00 byte, then canonicalize(statement). Signed directly, never as a digest. */
export function rotationStatementBytes(statement: KeyRotationStatementV1): Buffer {
  return Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(statement), "utf8")]);
}

/** The only accepted file and wire form of a signed statement. */
export function encodeRotationStatement(signed: SignedKeyRotationStatement): Buffer {
  return Buffer.from(canonicalize(signedKeyRotationStatementSchema.parse(signed)), "utf8");
}

/** Strict parse: refuses any bytes that are not exactly the canonical encoding of a well-formed signed statement. */
export function parseRotationStatement(bytes: Buffer): SignedKeyRotationStatement {
  return signedKeyRotationStatementSchema.parse(parseCanonicalJson(bytes));
}

/** What the next statement's previousStatementSha256 names: sha256 of the signed statement's canonical bytes. */
export function rotationStatementSha256(signed: SignedKeyRotationStatement): string {
  return sha256Hex(encodeRotationStatement(signed));
}

function keyIdOfPrivate(privateKeyPem: string): string {
  const id = ed25519KeyId(publicKeyFromPrivate(privateKeyPem));
  if (id === null) throw new Error("rotation statements are signed with Ed25519 keys only");
  return id;
}

/** Adds one signature; refuses a key that is not the one the statement names for that role. */
export function addRotationSignature(signed: { statement: KeyRotationStatementV1; signatures: readonly SignatureRow[] }, by: SignatureRow["by"], privateKeyPem: string): SignedKeyRotationStatement {
  const statement = keyRotationStatementSchema.parse(signed.statement);
  const keyId = keyIdOfPrivate(privateKeyPem);
  if (by === "next" && keyId !== statement.nextKeyId) throw new Error("the next signature must come from the statement's next key");
  if (by === "previous" && keyId !== statement.previousKeyId) throw new Error("the previous signature must come from the statement's previous key");
  if (by === "root" && (keyId === statement.previousKeyId || keyId === statement.nextKeyId)) {
    throw new Error("a root signature must come from a root other than the keys being rotated");
  }
  const signature = sign(null, rotationStatementBytes(statement), privateKeyPem).toString("base64");
  const rows = [...signed.signatures.filter(row => !(row.by === by && row.keyId === keyId)), { by, keyId, signature }].sort(rowOrder);
  return signedKeyRotationStatementSchema.parse({ statement, signatures: rows });
}

export function signRotationStatement(statement: KeyRotationStatementV1, keys: { next: string; previous?: string | null; roots?: readonly string[] }): SignedKeyRotationStatement {
  const parsed = keyRotationStatementSchema.parse(statement);
  if (ed25519KeyId(parsed.nextPublicKeyPem) !== parsed.nextKeyId) throw new Error("nextKeyId must be the key id of nextPublicKeyPem");
  let signed = addRotationSignature({ statement: parsed, signatures: [] }, "next", keys.next);
  if (keys.previous) signed = addRotationSignature(signed, "previous", keys.previous);
  for (const root of keys.roots ?? []) signed = addRotationSignature(signed, "root", root);
  return signed;
}

export interface VerifyRotationOptions {
  /** The chain this statement must belong to; a statement for another workspace or purpose never verifies here. */
  expected: { workspaceId: string; purpose: KeyPurpose };
  /**
   * The key the statement rotates FROM, as this verifier already trusts it: the purpose's current key or the last
   * verified statement's next key. Null only when the verifier knows the purpose has no key yet. Never read from the
   * statement itself.
   */
  trustedCurrentPublicKeyPem: string | null;
  /** The verified chain predecessor; null for the chain's first statement. */
  previous: SignedKeyRotationStatement | null;
  /** Pinned trust-list roots that may authorize a key-compromise, first-key or root rotation. */
  roots?: { publicKeyPems: readonly string[]; threshold?: number };
  maxOverlapDays?: number;
}

export type RotationVerdict = { valid: true; signed: SignedKeyRotationStatement } | { valid: false; reason: string };

function verifies(bytes: Buffer, publicKeyPem: string, signature: string): boolean {
  try {
    // OpenSSL's Ed25519 verify refuses a non-canonical S (S >= L); tests/keys/rotationStatement.test.ts pins that.
    return verify(null, bytes, publicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function bindingProblem(statement: KeyRotationStatementV1, opts: VerifyRotationOptions): string | null {
  if (statement.workspaceId !== opts.expected.workspaceId || statement.purpose !== opts.expected.purpose) {
    return `statement is for ${statement.workspaceId}/${statement.purpose}, not ${opts.expected.workspaceId}/${opts.expected.purpose}`;
  }
  const trustedId = opts.trustedCurrentPublicKeyPem === null ? null : ed25519KeyId(opts.trustedCurrentPublicKeyPem);
  if (opts.trustedCurrentPublicKeyPem !== null && trustedId === null) return "the trusted current key is not an Ed25519 public key";
  if (statement.previousKeyId !== trustedId) return "previousKeyId is not the key this verifier trusts for the purpose";
  const prior = opts.previous;
  if (prior === null) {
    return statement.sequence === 1 && statement.previousStatementSha256 === null ? null : "a first statement must have sequence 1 and no previous statement";
  }
  if (prior.statement.nextKeyId !== trustedId) return "the trusted current key is not the previous statement's next key";
  if (prior.statement.workspaceId !== statement.workspaceId || prior.statement.purpose !== statement.purpose) return "statement belongs to another chain";
  if (statement.sequence !== prior.statement.sequence + 1) return `sequence ${statement.sequence} does not follow ${prior.statement.sequence}`;
  if (statement.previousStatementSha256 !== rotationStatementSha256(prior)) return "previousStatementSha256 does not name the previous statement";
  return null;
}

function overlapProblem(statement: KeyRotationStatementV1, maxDays: number): string | null {
  if (statement.reason === "key-compromise") return statement.overlap === null ? null : "a key-compromise rotation has no overlap";
  if (statement.overlap === null) return null;
  const span = Date.parse(statement.overlap.notAfter) - Date.parse(statement.overlap.notBefore);
  if (span <= 0) return "overlap.notAfter must be after overlap.notBefore";
  if (span > maxDays * DAY_MS) return `overlap of ${(span / DAY_MS).toFixed(1)} days exceeds keys.maxOverlapDays (${maxDays})`;
  return null;
}

/**
 * Valid only when the bytes are the canonical encoding, the statement binds to the expected chain and to the key the
 * verifier trusts, every signature verifies under the key its role names, and the statement has authority: `next`
 * always (possession); `previous` (the trusted current key) for scheduled, superseded and purpose-split. For
 * key-compromise, and for a purpose's first key, the previous key has no authority and `threshold` (default 1) pinned
 * roots must sign.
 */
export function verifyRotationStatement(bytes: Buffer, opts: VerifyRotationOptions): RotationVerdict {
  const fail = (reason: string): RotationVerdict => ({ valid: false, reason });
  let signed: SignedKeyRotationStatement;
  try {
    signed = parseRotationStatement(bytes);
  } catch (error) {
    const detail = error instanceof z.ZodError ? `${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}` : error instanceof Error ? error.message : String(error);
    return fail(`not a canonical signed amc.key-rotation statement (${detail})`);
  }
  const { statement, signatures } = signed;
  if (ed25519KeyId(statement.nextPublicKeyPem) !== statement.nextKeyId) return fail("nextKeyId is not the key id of nextPublicKeyPem");
  const binding = bindingProblem(statement, opts);
  if (binding) return fail(binding);
  const overlap = overlapProblem(statement, opts.maxOverlapDays ?? DEFAULT_MAX_OVERLAP_DAYS);
  if (overlap) return fail(overlap);

  const roots = new Map((opts.roots?.publicKeyPems ?? []).flatMap(pem => { const id = ed25519KeyId(pem); return id ? [[id, pem] as const] : []; }));
  const payload = rotationStatementBytes(statement);
  const seen = { next: false, previous: false, roots: new Set<string>() };
  for (const row of signatures) {
    const pem = row.by === "next" ? (row.keyId === statement.nextKeyId ? statement.nextPublicKeyPem : null)
      : row.by === "previous" ? (row.keyId === statement.previousKeyId ? opts.trustedCurrentPublicKeyPem : null)
        : (row.keyId !== statement.previousKeyId && row.keyId !== statement.nextKeyId ? roots.get(row.keyId) ?? null : null);
    if (pem === null) return fail(`${row.by} signature by ${row.keyId} is not by a key this verifier trusts for that role`);
    if (!verifies(payload, pem, row.signature)) return fail(`${row.by} signature by ${row.keyId} does not verify`);
    if (row.by === "root") seen.roots.add(row.keyId);
    else seen[row.by] = true;
  }
  if (!seen.next) return fail("no next signature: possession of the new key is not proven");
  const threshold = Math.max(1, opts.roots?.threshold ?? 1);
  const rootAuthority = seen.roots.size >= threshold;
  if (statement.reason === "key-compromise" || statement.previousKeyId === null) {
    return rootAuthority ? { valid: true, signed } : fail(`needs ${threshold} pinned root signature(s): the previous key has no authority here`);
  }
  if (seen.previous) return { valid: true, signed };
  return fail("no previous signature: the rotation is not authorized by the key it replaces");
}

/** Walks a whole chain in order from the key the verifier trusted before the first statement. */
export function verifyRotationChain(statements: readonly Buffer[], opts: Omit<VerifyRotationOptions, "previous" | "trustedCurrentPublicKeyPem"> & { initialPublicKeyPem: string | null }): RotationVerdict & { index?: number } {
  let previous: SignedKeyRotationStatement | null = null;
  let trusted = opts.initialPublicKeyPem;
  let last: RotationVerdict = { valid: false, reason: "empty chain" };
  for (const [index, bytes] of statements.entries()) {
    last = verifyRotationStatement(bytes, { ...opts, previous, trustedCurrentPublicKeyPem: trusted });
    if (!last.valid) return { ...last, index };
    previous = last.signed;
    trusted = last.signed.statement.nextPublicKeyPem;
  }
  return last;
}
