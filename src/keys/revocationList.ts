/**
 * Single-file signed revocation lists (P1-08): amc.revocation-list v1, one file per list, written atomically. The
 * signature (revocation-list purpose) covers the tag AMC_REVOCATION_LIST_V1, one 0x00 byte and canonicalize(list), so it
 * binds the list id, sequence, previous list digest, issue time and every row. The verifier names the keys it trusts;
 * a key the file names is only looked up among them. A file exists in exactly one byte encoding (canonical JSON,
 * canonical base64), and `anchor`, the transparency entry that logged this sequence, sits outside the signature: it is
 * checked against the log and the machine mark covers the whole file (src/keys/anchors.ts).
 * An optional envelope signatureVersion:2 selects AMC_REVOCATION_LIST_V2_DIGEST + NUL + SHA-256 of that full v1 payload;
 * its absence preserves v1. Every reader selects exactly one form and never retries another tag.
 */
import { sign } from "node:crypto";
import { SIGNING_ALGORITHMS, signingKeyId, verifyWithKey } from "./algorithmPolicy.js";
import { checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider } from "./provider.js";
import { z } from "zod";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { ed25519KeyId } from "../trust/trustList.js";
import { readContainedOrNull, removeContained, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize, isCanonicalSignatureBase64, isExactIsoTime, parseCanonicalJson } from "../utils/json.js";
import { assertNotRolledBack, loggedAnchor, markSequence, type AnchorTarget } from "./anchors.js";

const DOMAIN_TAG = "AMC_REVOCATION_LIST_V1";
const hexSchema = z.string().regex(/^[0-9a-f]{64}$/);
const timeSchema = z.iso.datetime().refine(isExactIsoTime, "time must be in toISOString form");

const REVOCATION_KINDS = ["lease", "key", "certificate", "passport"] as const;

export const revocationListSchema = z.strictObject({
  type: z.literal("amc.revocation-list"),
  version: z.literal(1),
  /** e.g. "leases:<workspaceId>"; never contains "#", which separates the sequence in transparency ids. */
  listId: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,127}$/),
  sequence: z.number().int().positive().safe(),
  previousSha256: hexSchema.nullable(),
  issuedAt: timeSchema,
  revoked: z.array(z.strictObject({
    id: z.string().min(1).max(512),
    kind: z.enum(REVOCATION_KINDS),
    revokedAt: timeSchema,
    reason: z.string().min(1).max(4096),
    /** When the revoked credential expires on its own; a row may be pruned after it. Absent: kept forever. */
    expiresAt: timeSchema.optional()
  })).max(1_000_000)
}).refine(list => new Set(list.revoked.map(row => `${row.kind}:${row.id}`)).size === list.revoked.length, "one row per revoked id");

export const signedRevocationListSchema = z.strictObject({
  signatureVersion: z.literal(2).optional(),
  list: revocationListSchema,
  signature: z.strictObject({
    keyId: hexSchema,
    signature: z.string().refine(isCanonicalSignatureBase64, "signature must be canonical base64 of 64 bytes")
  }),
  anchor: z.strictObject({ transparencyEntryHash: hexSchema }).nullable()
});

export type RevocationListV1 = z.infer<typeof revocationListSchema>;
export type SignedRevocationList = z.infer<typeof signedRevocationListSchema>;

function signedBytes(list: RevocationListV1, signatureVersion: 1 | 2 = 1): Buffer {
  const legacy = Buffer.concat([Buffer.from(DOMAIN_TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(list), "utf8")]);
  return signatureVersion === 2 ? Buffer.concat([Buffer.from("AMC_REVOCATION_LIST_V2_DIGEST\0", "ascii"), Buffer.from(sha256Hex(legacy), "hex")]) : legacy;
}
export { signedBytes as revocationListSigningBytes };

/** The list's identity: what the next list's previousSha256 and its transparency entry name. */
export function revocationListSha256(list: RevocationListV1): string {
  return sha256Hex(canonicalize(revocationListSchema.parse(list)));
}

export function signRevocationList(list: RevocationListV1, privateKeyPem: string, opts: { signatureVersion?: 1 | 2 } = {}): SignedRevocationList {
  const parsed = revocationListSchema.parse(list);
  const keyId = ed25519KeyId(publicKeyFromPrivate(privateKeyPem));
  if (keyId === null) throw new Error("revocation lists are signed with Ed25519 keys only");
  return { ...(opts.signatureVersion === 2 ? { signatureVersion: 2 as const } : {}), list: parsed,
    signature: { keyId, signature: sign(null, signedBytes(parsed, opts.signatureVersion), privateKeyPem).toString("base64") }, anchor: null };
}

/** The caller supplies the purpose's authenticated, pinned provider description; signing itself never grants admission. */
export async function signRevocationListWithProvider(list: RevocationListV1, provider: KeyProvider, description: KeyDescription, opts: { signatureVersion?: 1 | 2 } = {}): Promise<SignedRevocationList> {
  const parsed = revocationListSchema.parse(list);
  const key = checkedDescription({ ...description, ref: { ...description.ref } }, { allowed: SIGNING_ALGORITHMS, requireNonExportable: false });
  if (provider.id !== key.ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider.id, "the pinned description belongs to another provider");
  const signatureVersion = opts.signatureVersion ?? 1;
  const signature = await signChecked(provider, key, signedBytes(parsed, signatureVersion));
  return { ...(signatureVersion === 2 ? { signatureVersion: 2 as const } : {}), list: parsed,
    signature: { keyId: key.keyId, signature: signature.toString("base64") }, anchor: null };
}

/** The only accepted file form. */
export function encodeSignedRevocationList(signed: SignedRevocationList): Buffer {
  return Buffer.from(canonicalize(signedRevocationListSchema.parse(signed)), "utf8");
}

/**
 * Parses and verifies one file's bytes: canonical encoding, the expected list id, and a signature by one of
 * `trustedPublicKeyPems` (the verifier's own key history for the revocation-list purpose). Throws the reason.
 */
function verifySignedRevocationListBytes(bytes: Buffer, opts: { listId: string; trustedPublicKeyPems: readonly string[] }): SignedRevocationList {
  let signed: SignedRevocationList;
  try {
    signed = signedRevocationListSchema.parse(parseCanonicalJson(bytes));
  } catch (error) {
    const detail = error instanceof z.ZodError ? `${error.issues[0]?.path.join(".")}: ${error.issues[0]?.message}` : error instanceof Error ? error.message : String(error);
    throw new Error(`not a canonical signed amc.revocation-list (${detail})`);
  }
  if (signed.list.listId !== opts.listId) throw new Error(`revocation list is ${signed.list.listId}, not ${opts.listId}`);
  const key = opts.trustedPublicKeyPems.find(pem => signingKeyId(pem) === signed.signature.keyId);
  if (key === undefined) throw new Error(`revocation list signer ${signed.signature.keyId} is not a trusted revocation-list key`);
  let valid = false;
  try {
    valid = verifyWithKey(signedBytes(signed.list, signed.signatureVersion), key, Buffer.from(signed.signature.signature, "base64"));
  } catch { /* reported below */ }
  if (!valid) throw new Error("revocation list signature verification failed");
  return signed;
}

/** Where one anchored list lives (relative to the workspace) and which keys may sign it (the verifier's own history). */
export interface AnchoredListLocation {
  workspace: string;
  rel: string;
  listId: string;
  trustedPublicKeyPems: readonly string[];
}

export const MAX_REVOCATION_LIST_BYTES = 64 * 1024 * 1024;
const ANCHOR = "REVOCATION_LIST" as const;

function anchorOf(location: AnchoredListLocation, signed: SignedRevocationList, bytes: Buffer) {
  return { workspace: location.workspace, type: ANCHOR, id: location.listId, sequence: signed.list.sequence,
    sha256: revocationListSha256(signed.list), fileSha256: sha256Hex(bytes), entryHash: signed.anchor?.transparencyEntryHash ?? null };
}

/** One verified, rollback-checked read; null only when the file does not exist (the caller decides what absence means). */
export function readAnchoredRevocationList(location: AnchoredListLocation): SignedRevocationList | null {
  const bytes = readContainedOrNull(location.workspace, location.rel, MAX_REVOCATION_LIST_BYTES);
  if (bytes === null) return null;
  const signed = verifySignedRevocationListBytes(bytes, location);
  assertNotRolledBack(anchorOf(location, signed, bytes));
  return signed;
}

/** The staged next list of an in-progress or interrupted write, verified like the list itself (no anchors: it is not final). */
export function readStagedRevocationList(location: AnchoredListLocation): SignedRevocationList | null {
  const bytes = readContainedOrNull(location.workspace, `${location.rel}.pending`, MAX_REVOCATION_LIST_BYTES);
  return bytes === null ? null : verifySignedRevocationListBytes(bytes, location);
}

function writeFinal(location: AnchoredListLocation, signed: SignedRevocationList): void {
  const bytes = encodeSignedRevocationList(signed);
  writeContained(location.workspace, location.rel, bytes, 0o644);
  markSequence(anchorOf(location, signed, bytes));
}

/**
 * Completes or discards a write interrupted after its list was staged: rolls forward only when the transparency log
 * already holds that exact sequence and content; otherwise the write never committed and the stage is removed.
 * Caller holds the list's lock.
 */
export function recoverPendingRevocationList(location: AnchoredListLocation): void {
  const staged = readStagedRevocationList(location);
  if (staged === null) return;
  const logged = loggedAnchor(location.workspace, ANCHOR, location.listId);
  if (logged !== null && logged.sequence === staged.list.sequence && logged.sha256 === revocationListSha256(staged.list)) {
    writeFinal(location, { ...staged, anchor: { transparencyEntryHash: logged.entryHash } });
  }
  removeContained(location.workspace, `${location.rel}.pending`);
}

/**
 * Signs, stages, logs and publishes `list`. Nothing is written unless the signature verifies against the trusted keys
 * (a locked vault or an AMC_NO_SIGN ephemeral key refuses here). The stage lands before the log entry, so a crash after
 * logging rolls forward instead of leaving the anchor ahead of the file. Caller holds the list's lock. `logSequence` is
 * src/keys/anchorLog.ts's, passed in so that reading a list never loads the log writer.
 */
export function publishRevocationList(location: AnchoredListLocation, list: RevocationListV1, privateKeyPem: string,
  logSequence: (target: Omit<AnchorTarget, "fileSha256" | "entryHash">) => string): SignedRevocationList {
  return publishSignedRevocationList(location, signRevocationList(list, privateKeyPem), logSequence);
}

/** The owner holds the list lock and has revalidated predecessor and current signer after any asynchronous signing. */
export function publishSignedRevocationList(location: AnchoredListLocation, signed: SignedRevocationList,
  logSequence: (target: Omit<AnchorTarget, "fileSha256" | "entryHash">) => string): SignedRevocationList {
  if (signed.anchor !== null) throw new Error("a new revocation list must not carry a prior anchor");
  const staged = encodeSignedRevocationList(signed);
  try {
    verifySignedRevocationListBytes(staged, location);
  } catch (error) {
    throw new Error(`revocation list signature would not verify against the trusted key history; nothing was published (${error instanceof Error ? error.message : String(error)})`);
  }
  writeContained(location.workspace, `${location.rel}.pending`, staged, 0o644);
  const entryHash = logSequence({ workspace: location.workspace, type: ANCHOR, id: signed.list.listId, sequence: signed.list.sequence, sha256: revocationListSha256(signed.list) });
  const published = { ...signed, anchor: { transparencyEntryHash: entryHash } };
  writeFinal(location, published);
  removeContained(location.workspace, `${location.rel}.pending`);
  return published;
}

/** The next list after `previous` (sequence + 1, previousSha256 its digest), issued now, without rows past their expiry. */
export function nextRevocationList(listId: string, previous: { sequence: number; sha256: string } | null, rows: RevocationListV1["revoked"], pruneGraceMs: number): RevocationListV1 {
  const now = Date.now();
  return {
    type: "amc.revocation-list", version: 1, listId,
    sequence: (previous?.sequence ?? 0) + 1,
    previousSha256: previous?.sha256 ?? null,
    issuedAt: new Date(now).toISOString(),
    revoked: rows.filter(row => row.expiresAt === undefined || Date.parse(row.expiresAt) > now - pruneGraceMs)
  };
}
