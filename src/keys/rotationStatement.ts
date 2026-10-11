/**
 * Key rotation statements (P1-08). One signed, chained statement per rotation of a (workspaceId, purpose) key. It
 * replaces amc.monitor-key-rotation receipts for new rotations; src/crypto/keyRotationReceipt.ts still verifies old ones.
 * A statement never changes a verifier's pins by itself: the trust-list owner publishes a new list that sets the old
 * key's validTo to overlap.notAfter and adds the new key. issuedAt is the signer's claim (P1-25 adds a timestamp token).
 */
import { sign, verify } from "node:crypto";
import { z } from "zod";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { KEY_PURPOSES } from "../trust/keyPurposes.js";
import { ed25519KeyId } from "../trust/trustList.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const ROTATION_REASONS = ["scheduled", "superseded", "purpose-split", "key-compromise"] as const;
export type RotationReason = (typeof ROTATION_REASONS)[number];
/** keys.maxOverlapDays: the longest both keys may be valid at once. */
export const DEFAULT_MAX_OVERLAP_DAYS = 30;
const DOMAIN_TAG = "AMC_KEY_ROTATION_V1";
const DAY_MS = 86_400_000;

const keyIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
const timeSchema = z.iso.datetime();

export const keyRotationStatementSchema = z.strictObject({
  type: z.literal("amc.key-rotation"),
  version: z.literal(1),
  workspaceId: z.string().min(1).max(256),
  purpose: z.enum(KEY_PURPOSES),
  sequence: z.number().int().positive().safe(),
  previousStatementSha256: keyIdSchema.nullable(),
  previousKeyId: keyIdSchema.nullable(),
  nextKeyId: keyIdSchema,
  nextPublicKeyPem: z.string().min(1).max(4096),
  reason: z.enum(ROTATION_REASONS),
  overlap: z.strictObject({ notBefore: timeSchema, notAfter: timeSchema }).nullable(),
  issuedAt: timeSchema
});

export const signedKeyRotationStatementSchema = z.strictObject({
  statement: keyRotationStatementSchema,
  signatures: z.array(z.strictObject({
    by: z.enum(["previous", "next", "root"]),
    keyId: keyIdSchema,
    signature: z.string().min(1).max(256)
  })).min(1).max(64)
});

export type KeyRotationStatementV1 = z.infer<typeof keyRotationStatementSchema>;
export type SignedKeyRotationStatement = z.infer<typeof signedKeyRotationStatementSchema>;
type SignatureRole = SignedKeyRotationStatement["signatures"][number]["by"];

/** The signed bytes: the tag, one 0x00 byte, then canonicalize(statement). Signed directly, never as a digest. */
export function rotationStatementBytes(statement: KeyRotationStatementV1): Buffer {
  return Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(statement), "utf8")]);
}

/** What the next statement's previousStatementSha256 names: sha256 of the whole signed statement, canonicalized. */
export function rotationStatementSha256(signed: SignedKeyRotationStatement): string {
  return sha256Hex(canonicalize(signed));
}

function keyIdOfPrivate(privateKeyPem: string): string {
  const id = ed25519KeyId(publicKeyFromPrivate(privateKeyPem));
  if (id === null) throw new Error("rotation statements are signed with Ed25519 keys only");
  return id;
}

/** Adds one signature; refuses a key that is not the one the statement names for that role. */
export function addRotationSignature(signed: SignedKeyRotationStatement, by: SignatureRole, privateKeyPem: string): SignedKeyRotationStatement {
  const statement = keyRotationStatementSchema.parse(signed.statement);
  const keyId = keyIdOfPrivate(privateKeyPem);
  if (by === "next" && keyId !== statement.nextKeyId) throw new Error("the next signature must come from the statement's next key");
  if (by === "previous" && keyId !== statement.previousKeyId) throw new Error("the previous signature must come from the statement's previous key");
  if (by === "root" && (keyId === statement.previousKeyId || keyId === statement.nextKeyId)) {
    throw new Error("a root signature must come from a root other than the keys being rotated");
  }
  const signature = sign(null, rotationStatementBytes(statement), privateKeyPem).toString("base64");
  return { statement, signatures: [...signed.signatures.filter(row => !(row.by === by && row.keyId === keyId)), { by, keyId, signature }] };
}

export function signRotationStatement(statement: KeyRotationStatementV1, keys: { next: string; previous?: string | null; roots?: readonly string[] }): SignedKeyRotationStatement {
  const parsed = keyRotationStatementSchema.parse(statement);
  if (ed25519KeyId(parsed.nextPublicKeyPem) !== parsed.nextKeyId) throw new Error("nextKeyId must be the key id of nextPublicKeyPem");
  const empty = { statement: parsed, signatures: [] } as unknown as SignedKeyRotationStatement;
  let signed = addRotationSignature(empty, "next", keys.next);
  if (keys.previous) signed = addRotationSignature(signed, "previous", keys.previous);
  for (const root of keys.roots ?? []) signed = addRotationSignature(signed, "root", root);
  return signedKeyRotationStatementSchema.parse(signed);
}

export interface VerifyRotationOptions {
  /** The chain predecessor; null for a purpose's first statement. */
  previous: SignedKeyRotationStatement | null;
  /** For a first statement only: the public key it replaces (the key previousKeyId names). */
  previousPublicKeyPem?: string | null;
  /** Pinned trust-list roots that may authorize a key-compromise or root rotation. */
  roots?: { publicKeyPems: readonly string[]; threshold?: number };
  maxOverlapDays?: number;
}

export type RotationVerdict = { valid: true; statement: KeyRotationStatementV1 } | { valid: false; reason: string };

function verifies(bytes: Buffer, publicKeyPem: string, signature: string): boolean {
  try {
    return verify(null, bytes, publicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function chainProblem(statement: KeyRotationStatementV1, opts: VerifyRotationOptions): string | null {
  const prior = opts.previous;
  if (prior === null) {
    if (statement.sequence !== 1 || statement.previousStatementSha256 !== null) return "a first statement must have sequence 1 and no previous statement";
    return null;
  }
  const before = prior.statement;
  if (statement.workspaceId !== before.workspaceId || statement.purpose !== before.purpose) return "statement belongs to another chain";
  if (statement.sequence !== before.sequence + 1) return `sequence ${statement.sequence} does not follow ${before.sequence}`;
  if (statement.previousStatementSha256 !== rotationStatementSha256(prior)) return "previousStatementSha256 does not name the previous statement";
  if (statement.previousKeyId !== before.nextKeyId) return "previousKeyId is not the previous statement's next key";
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
 * Valid only when every signature verifies under the key its role names and the statement has authority:
 * `next` always (possession of the new key); `previous` for scheduled, superseded and purpose-split; for key-compromise
 * the previous key has no authority and `threshold` (default 1) pinned roots must sign. A trust-list-root rotation may
 * instead carry `threshold` signatures from other pinned roots.
 */
export function verifyRotationStatement(value: unknown, opts: VerifyRotationOptions): RotationVerdict {
  const fail = (reason: string): RotationVerdict => ({ valid: false, reason });
  const parsed = signedKeyRotationStatementSchema.safeParse(value);
  if (!parsed.success) return fail("not a valid signed amc.key-rotation statement");
  const { statement, signatures } = parsed.data;
  if (ed25519KeyId(statement.nextPublicKeyPem) !== statement.nextKeyId) return fail("nextKeyId is not the key id of nextPublicKeyPem");
  const chain = chainProblem(statement, opts);
  if (chain) return fail(chain);
  const overlap = overlapProblem(statement, opts.maxOverlapDays ?? DEFAULT_MAX_OVERLAP_DAYS);
  if (overlap) return fail(overlap);

  const previousPem = opts.previous ? opts.previous.statement.nextPublicKeyPem : opts.previousPublicKeyPem ?? null;
  if (statement.previousKeyId !== null && previousPem !== null && ed25519KeyId(previousPem) !== statement.previousKeyId) {
    return fail("the previous public key does not match previousKeyId");
  }
  const roots = new Map((opts.roots?.publicKeyPems ?? []).flatMap(pem => { const id = ed25519KeyId(pem); return id ? [[id, pem] as const] : []; }));
  const bytes = rotationStatementBytes(statement);
  const seen = { next: false, previous: false, roots: new Set<string>() };
  for (const row of signatures) {
    const pem = row.by === "next" ? (row.keyId === statement.nextKeyId ? statement.nextPublicKeyPem : null)
      : row.by === "previous" ? (row.keyId === statement.previousKeyId ? previousPem : null)
        : (row.keyId !== statement.previousKeyId && row.keyId !== statement.nextKeyId ? roots.get(row.keyId) ?? null : null);
    if (pem === null) return fail(`${row.by} signature by ${row.keyId} is not by a key this verifier can check for that role`);
    if (!verifies(bytes, pem, row.signature)) return fail(`${row.by} signature by ${row.keyId} does not verify`);
    if (row.by === "root") seen.roots.add(row.keyId);
    else seen[row.by] = true;
  }
  if (!seen.next) return fail("no next signature: possession of the new key is not proven");
  const threshold = Math.max(1, opts.roots?.threshold ?? 1);
  const rootAuthority = seen.roots.size >= threshold;
  if (statement.reason === "key-compromise") {
    return rootAuthority ? { valid: true, statement } : fail(`key-compromise needs ${threshold} root signature(s); the previous key has no authority`);
  }
  if (statement.previousKeyId === null || seen.previous) return { valid: true, statement };
  if (statement.purpose === "trust-list-root" && rootAuthority) return { valid: true, statement };
  return fail("no previous signature: the rotation is not authorized by the key it replaces");
}

/** Walks a whole chain in order; the first statement replaces `initialPublicKeyPem`. */
export function verifyRotationChain(statements: readonly unknown[], opts: Omit<VerifyRotationOptions, "previous"> & { initialPublicKeyPem?: string | null }): RotationVerdict & { index?: number } {
  let previous: SignedKeyRotationStatement | null = null;
  let last: RotationVerdict = { valid: false, reason: "empty chain" };
  for (const [index, value] of statements.entries()) {
    last = verifyRotationStatement(value, { ...opts, previous, previousPublicKeyPem: previous ? null : opts.initialPublicKeyPem ?? null });
    if (!last.valid) return { ...last, index };
    previous = value as SignedKeyRotationStatement;
  }
  return last;
}
