import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { pathExists } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { sha256Hex } from "../utils/hash.js";
import { leaseRevocationsSchema, type LeaseRevocations } from "./leaseSchema.js";

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function leaseRevocationPaths(workspace: string): { file: string; sig: string } {
  const file = join(workspace, ".amc", "studio", "leases", "revocations.json");
  return {
    file,
    sig: `${file}.sig`
  };
}

function defaultLeaseRevocations(): LeaseRevocations {
  return {
    v: 1,
    updatedTs: Date.now(),
    revocations: []
  };
}

export function loadLeaseRevocations(workspace: string): LeaseRevocations {
  const paths = leaseRevocationPaths(workspace);
  if (!pathExists(paths.file)) {
    return defaultLeaseRevocations();
  }
  return leaseRevocationsSchema.parse(JSON.parse(readFileSync(paths.file, "utf8")) as unknown);
}

/**
 * Sign and publish exact list bytes. Nothing on disk changes unless the prepared signature verifies against the
 * auditor key history (a locked vault or an AMC_NO_SIGN ephemeral key refuses here). Both files are written to
 * temporary names first, then renamed list-first; a crash between the two renames leaves a pair that every
 * consumer refuses until `amc lease resign-revocations` (docs/LEASES.md). Callers hold the revocations lock.
 */
function publishSignedRevocations(workspace: string, bytes: Buffer): void {
  const paths = leaseRevocationPaths(workspace);
  const digest = sha256Hex(bytes);
  const signed: SignedDigest = {
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  if (!verifyHexDigestAny(digest, signed.signature, getPublicKeyHistory(workspace, "auditor"))) {
    throw new Error("lease revocation signature would not verify against the auditor key history; nothing was published");
  }
  mkdirSync(dirname(paths.file), { recursive: true });
  const suffix = `.${randomBytes(6).toString("hex")}.tmp`;
  const temporary = { file: `${paths.file}${suffix}`, sig: `${paths.sig}${suffix}` };
  try {
    writeFileSync(temporary.file, bytes, { mode: 0o644 });
    writeFileSync(temporary.sig, JSON.stringify(signed, null, 2), { mode: 0o644 });
    renameSync(temporary.file, paths.file);
    renameSync(temporary.sig, paths.sig);
  } finally {
    rmSync(temporary.file, { force: true });
    rmSync(temporary.sig, { force: true });
  }
  const published = verifyLeaseRevocationsSignature(workspace);
  if (!published.valid) throw new Error(`lease revocation store does not verify after publishing (${published.reason ?? "unknown"})`);
}

/**
 * First-store bootstrap: publish the default empty list, and only while neither file exists. Both checks run under
 * the lock, so a list dropped after a caller's unlocked check is never signed; returns whether it published.
 */
export function bootstrapLeaseRevocations(workspace: string): boolean {
  const paths = leaseRevocationPaths(workspace);
  return withControlFileLock({ root: dirname(paths.file), name: "revocations", operation: () => {
    if (pathExists(paths.file) || pathExists(paths.sig)) return false;
    publishSignedRevocations(workspace, Buffer.from(JSON.stringify(defaultLeaseRevocations(), null, 2), "utf8"));
    return true;
  } });
}

/**
 * The deliberate repair: sign the list on disk only if its bytes still have the digest the operator reviewed (checked
 * under the lock, on the bytes that are signed). Returns those bytes.
 */
export function signLeaseRevocations(workspace: string, reviewedDigestSha256: string): Buffer {
  const paths = leaseRevocationPaths(workspace);
  return withControlFileLock({ root: dirname(paths.file), name: "revocations", operation: () => {
    if (!pathExists(paths.file)) throw new Error("revocation list missing; restore the reviewed list before re-signing. Nothing was signed.");
    const bytes = readFileSync(paths.file);
    const digest = sha256Hex(bytes);
    if (digest !== reviewedDigestSha256.trim().toLowerCase()) {
      throw new Error(`revocation list sha256 is ${digest}, not the reviewed ${reviewedDigestSha256}; nothing was signed. Review the current list again.`);
    }
    publishSignedRevocations(workspace, bytes);
    return bytes;
  } });
}

export function verifyLeaseRevocationsSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
} {
  const paths = leaseRevocationPaths(workspace);
  if (!pathExists(paths.file)) {
    // An orphaned signature records an existing store, not an empty bootstrap.
    if (pathExists(paths.sig)) {
      return { valid: false, signatureExists: true, reason: "revocation list missing but signature present" };
    }
    return { valid: true, signatureExists: false, reason: null };
  }
  if (!pathExists(paths.sig)) {
    return { valid: false, signatureExists: false, reason: "revocation signature missing" };
  }
  try {
    const payload = JSON.parse(readFileSync(paths.sig, "utf8")) as SignedDigest;
    const digest = sha256Hex(readFileSync(paths.file));
    if (digest !== payload.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch" };
    }
    const valid = verifyHexDigestAny(digest, payload.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed"
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error)
    };
  }
}

/**
 * The store, verified and parsed from the same bytes (never verify-then-reread). Empty only when neither the list nor
 * its signature exists; throws the reason otherwise.
 */
function readVerifiedRevocations(workspace: string): LeaseRevocations {
  const paths = leaseRevocationPaths(workspace);
  if (!pathExists(paths.file) && !pathExists(paths.sig)) return defaultLeaseRevocations();
  if (!pathExists(paths.file)) throw new Error("revocation list missing but signature present");
  if (!pathExists(paths.sig)) throw new Error("revocation signature missing");
  const bytes = readFileSync(paths.file);
  const signed = JSON.parse(readFileSync(paths.sig, "utf8")) as SignedDigest;
  const digest = sha256Hex(bytes);
  if (signed.digestSha256 !== digest) throw new Error("digest mismatch");
  if (!verifyHexDigestAny(digest, signed.signature, getPublicKeyHistory(workspace, "auditor"))) throw new Error("signature verification failed");
  return leaseRevocationsSchema.parse(JSON.parse(bytes.toString("utf8")));
}

/**
 * Append one revocation and re-sign. Serialized across processes (Studio retires native task leases on every runtime
 * stop while an operator may run `amc lease revoke`), so a concurrent writer cannot republish a list without this row.
 */
export function revokeLease(workspace: string, leaseId: string, reason: string): LeaseRevocations {
  const paths = leaseRevocationPaths(workspace);
  return withControlFileLock({ root: dirname(paths.file), name: "revocations", operation: () => {
    let current: LeaseRevocations;
    // Revoke is not the deliberate repair command. Authenticate the exact bytes
    // used for this update, not a later second load of potentially different data.
    try {
      current = readVerifiedRevocations(workspace);
    } catch {
      throw new Error("lease revocation store unverifiable; revoke made no changes. Restore and review the approved revocation history before a deliberate repair; revoking another lease must not re-sign damaged state.");
    }
    const next = leaseRevocationsSchema.parse({
      ...current,
      updatedTs: Date.now(),
      revocations: [
        ...current.revocations.filter((row) => row.leaseId !== leaseId),
        {
          leaseId,
          revokedTs: Date.now(),
          reason
        }
      ]
    });
    publishSignedRevocations(workspace, Buffer.from(JSON.stringify(next, null, 2), "utf8"));
    return next;
  } });
}

/**
 * The revoked lease ids from ONE read of the list, verified and parsed from those same bytes, or why that failed.
 * Every consumer decides on this set: a list swapped on disk after the check is never read.
 */
export function readRevokedLeaseIds(workspace: string): { ok: true; ids: Set<string> } | { ok: false; reason: string } {
  try {
    return { ok: true, ids: new Set(readVerifiedRevocations(workspace).revocations.map((row) => row.leaseId)) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The revoked lease ids, from a store whose signature verifies.
 *
 * Throws when it does not. This used to answer an unverifiable store with an
 * EMPTY SET, which reads as "nothing is revoked" -- so tampering with one file
 * un-revoked every lease ever revoked. A revocation list is a security answer;
 * when the question cannot be answered, the only safe response is to refuse,
 * and every caller then refuses every lease until the store is repaired.
 */
export function revokedLeaseIdSet(workspace: string): Set<string> {
  const read = readRevokedLeaseIds(workspace);
  if (!read.ok) throw new Error(`lease revocation store unverifiable (${read.reason}); refusing to treat it as empty`);
  return read.ids;
}
