/**
 * P1-08's signed statements: key rotation (src/keys/rotationStatement.ts), trust-list root-set rotation
 * (src/trust/rootRotation.ts) and revocation lists (src/keys/revocationList.ts). Each exists in exactly one byte
 * encoding (canonical JSON), which the verifier checks separately.
 */
import { canonicalSigningPem, signingKeyId, isCanonicalSignatureBase64 } from "../bytes.js";
import { KEY_PURPOSES } from "../codes.js";
import { arr, bool, int, isoTimeExact, lit, nullable, obj, oneOf, opt, refine, sha256, str } from "../schema.js";

const signature = str({ check: isCanonicalSignatureBase64, what: "canonical base64 of 64 bytes" });
const canonicalPem = str({ min: 1, max: 4096, check: pem => canonicalSigningPem(pem)?.pem === pem, what: "a canonical Ed25519 or P-256 SPKI PEM" });
const unique = (items: string[]) => new Set(items).size === items.length;

/** Rows sorted by role (in `roles` order) then keyId, one per (role, key). Same comparison as AMC (localeCompare). */
function sortedRows<R extends string>(roles: readonly R[]) {
  return (rows: Array<{ by: R; keyId: string }>) => rows.every((row, index) => {
    if (index === 0) return true;
    const prior = rows[index - 1]!;
    return (roles.indexOf(prior.by) - roles.indexOf(row.by) || prior.keyId.localeCompare(row.keyId)) < 0;
  });
}

export const ROTATION_REASONS = ["scheduled", "superseded", "purpose-split", "key-compromise"] as const;
const ROTATION_ROLES = ["previous", "next", "root"] as const;

export const signedKeyRotation = obj({
  signatureVersion: opt(lit(2, "UNSUPPORTED_VERSION")),
  statement: obj({
    type: lit("amc.key-rotation"),
    version: lit(1, "UNSUPPORTED_VERSION"),
    workspaceId: str({ min: 1, max: 256 }),
    purpose: refine(oneOf(KEY_PURPOSES), purpose => purpose !== "trust-list-root", "trust-list roots rotate with amc.root-rotation"),
    sequence: int({ min: 1 }),
    previousStatementSha256: nullable(sha256),
    previousKeyId: nullable(sha256),
    nextKeyId: sha256,
    nextPublicKeyPem: canonicalPem,
    reason: oneOf(ROTATION_REASONS),
    overlap: nullable(obj({ notBefore: isoTimeExact, notAfter: isoTimeExact })),
    issuedAt: isoTimeExact
  }),
  signatures: refine(arr(obj({ by: oneOf(ROTATION_ROLES), keyId: sha256, signature }), { min: 1, max: 64 }),
    sortedRows(ROTATION_ROLES), "signatures must be sorted by role then keyId, one per key and role")
});
export type SignedKeyRotation = ReturnType<typeof signedKeyRotation>;

const ROOT_ROLES = ["current", "new"] as const;
const rootStatement = refine(obj({
  type: lit("amc.root-rotation"),
  version: lit(1, "UNSUPPORTED_VERSION"),
  rootSetId: str({ regex: /^[a-z0-9][a-z0-9._-]{0,63}$/, what: "a root set id" }),
  sequence: int({ min: 1 }),
  previousSha256: nullable(sha256),
  previousRoots: refine(arr(sha256, { min: 1, max: 64 }), unique, "roots must be unique"),
  previousThreshold: int({ min: 1 }),
  newRoots: refine(arr(sha256, { min: 2, max: 64 }), unique, "roots must be unique"),
  newThreshold: int({ min: 2, max: 64 }),
  newRootPublicKeyPems: arr(canonicalPem, { max: 64 }),
  allowDecrease: bool,
  issuedAt: isoTimeExact
}), value => value.newThreshold <= value.newRoots.length && value.newRootPublicKeyPems.length === value.newRoots.length
  && value.newRootPublicKeyPems.every((pem, index) => signingKeyId(pem) === value.newRoots[index]),
"newThreshold within the new roots, and newRootPublicKeyPems are the new roots' keys in order");

export const signedRootRotation = obj({
  signatureVersion: opt(lit(2, "UNSUPPORTED_VERSION")),
  statement: rootStatement,
  signatures: refine(arr(obj({ by: oneOf(ROOT_ROLES), keyId: sha256, signature }), { max: 128 }),
    sortedRows(ROOT_ROLES), "signatures sorted by role then key id, one per key and role")
});
export type SignedRootRotation = ReturnType<typeof signedRootRotation>;

const revocationList = refine(obj({
  type: lit("amc.revocation-list"),
  version: lit(1, "UNSUPPORTED_VERSION"),
  listId: str({ regex: /^[a-z0-9][a-z0-9:._-]{0,127}$/, what: "a revocation list id" }),
  sequence: int({ min: 1 }),
  previousSha256: nullable(sha256),
  issuedAt: isoTimeExact,
  revoked: arr(obj({
    id: str({ min: 1, max: 512 }),
    kind: oneOf(["lease", "key", "certificate", "passport"] as const),
    revokedAt: isoTimeExact,
    reason: str({ min: 1, max: 4096 }),
    expiresAt: opt(isoTimeExact)
  }), { max: 1_000_000 })
}), value => new Set(value.revoked.map(row => `${row.kind}:${row.id}`)).size === value.revoked.length, "one row per revoked id");

export const signedRevocationList = obj({
  signatureVersion: opt(lit(2, "UNSUPPORTED_VERSION")),
  list: revocationList,
  signature: obj({ keyId: sha256, signature }),
  anchor: nullable(obj({ transparencyEntryHash: sha256 }))
});
export type SignedRevocationList = ReturnType<typeof signedRevocationList>;
