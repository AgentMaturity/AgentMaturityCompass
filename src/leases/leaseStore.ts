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
  const current = loadLeaseRevocations(workspace);
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
  const paths = leaseRevocationPaths(workspace);
  mkdirSync(dirname(paths.file), { recursive: true });
  writeFileAtomic(paths.file, JSON.stringify(next, null, 2), 0o644);
  signLeaseRevocations(workspace);
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
