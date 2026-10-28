/**
 * Signed receipts for evidence-store migrations (`amc evidence-stores encrypt`,
 * `amc evidence-stores migrate`): the canonical JSON digest signed with the
 * workspace's config-signature key, verified against its auditor key history.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPublicKeyHistory, getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

/** Writes `.amc/<dir>/<fileName>` and returns its path. */
export function writeSignedMigrationReceipt(workspace: string, dir: string, fileName: string, receipt: object): string {
  const full = join(workspace, ".amc", dir);
  mkdirSync(full, { recursive: true });
  const digest = sha256Hex(canonicalize(receipt));
  const path = join(full, fileName);
  writeFileSync(path, JSON.stringify({ receipt, digestSha256: digest, signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")) }, null, 2), { mode: 0o644 });
  return path;
}

/** True when the receipt file's signature verifies under the workspace's auditor key history. */
export function verifySignedMigrationReceipt(workspace: string, path: string): boolean {
  const signed = JSON.parse(readFileSync(path, "utf8")) as { receipt: unknown; digestSha256: string; signature: string };
  const digest = sha256Hex(canonicalize(signed.receipt));
  return digest === signed.digestSha256 && verifyHexDigestAny(digest, signed.signature, getPublicKeyHistory(workspace, "auditor"));
}
