import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
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

export function defaultLeaseRevocations(): LeaseRevocations {
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

export function signLeaseRevocations(workspace: string): string {
  const paths = leaseRevocationPaths(workspace);
  if (!pathExists(paths.file)) {
    mkdirSync(dirname(paths.file), { recursive: true });
    writeFileAtomic(paths.file, JSON.stringify(defaultLeaseRevocations(), null, 2), 0o644);
  }
  const digest = sha256Hex(readFileSync(paths.file));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  writeFileAtomic(
    paths.sig,
    JSON.stringify(
      {
        digestSha256: digest,
        signature,
        signedTs: Date.now(),
        signer: "auditor"
      } satisfies SignedDigest,
      null,
      2
    ),
    0o644
  );
  return paths.sig;
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

export function revokeLease(workspace: string, leaseId: string, reason: string): LeaseRevocations {
  const paths = leaseRevocationPaths(workspace);
  let current: LeaseRevocations;
  // Revoke is not the deliberate repair command. Authenticate the exact bytes
  // used for this update, not a later second load of potentially different data.
  if (!pathExists(paths.file) && !pathExists(paths.sig)) current = defaultLeaseRevocations();
  else {
    try {
      const bytes = readFileSync(paths.file);
      const signed = JSON.parse(readFileSync(paths.sig, "utf8")) as SignedDigest;
      const digest = sha256Hex(bytes);
      if (signed.digestSha256 !== digest || !verifyHexDigestAny(digest, signed.signature, getPublicKeyHistory(workspace, "auditor"))) {
        throw new Error("Unverifiable revocation snapshot");
      }
      current = leaseRevocationsSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw new Error("lease revocation store unverifiable; revoke made no changes. Restore and review the approved revocation history before a deliberate repair; revoking another lease must not re-sign damaged state.");
    }
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
  const bytes = JSON.stringify(next, null, 2);
  const digest = sha256Hex(Buffer.from(bytes, "utf8"));
  // Prepare the intended signature before publishing either file. Signer failure
  // must not replace the old list while leaving its previous signature behind.
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const signed: SignedDigest = { digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" };
  mkdirSync(dirname(paths.file), { recursive: true });
  writeFileAtomic(paths.file, bytes, 0o644);
  writeFileAtomic(paths.sig, JSON.stringify(signed, null, 2), 0o644);
  return next;
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
  const verify = verifyLeaseRevocationsSignature(workspace);
  if (!verify.valid) {
    throw new Error(
      `lease revocation store unverifiable (${verify.reason ?? "unknown"}); refusing to treat it as empty`
    );
  }
  const revocations = loadLeaseRevocations(workspace);
  return new Set(revocations.revocations.map((row) => row.leaseId));
}
