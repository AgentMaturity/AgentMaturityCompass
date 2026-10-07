/**
 * The migration receipt (P1-35; the format-evolution receipt AMC-1511 left open): what one relabel run scanned and
 * recorded, how many relabel log lines it attests and their head, and a digest of the original artifacts' hashes.
 * Signed as MIGRATION_RECEIPT and written to .amc/migrations/receipts/<UTC timestamp>.json beside its .sig.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifySignedDigest } from "../../crypto/signing/signer.js";
import type { SignedDigest } from "../../crypto/signing/signerTypes.js";
import { sha256Hex } from "../../utils/hash.js";
import type { LegacyArtifactKind } from "./classify.js";

export const RECEIPTS_DIR = ".amc/migrations/receipts";

export interface MigrationReceipt {
  v: 1;
  noticeId: string;
  noticeVersion: number;
  startedAt: string;
  finishedAt: string;
  scanned: Record<LegacyArtifactKind, number>;
  relabelled: Record<LegacyArtifactKind, number>;
  skipped: Array<{ locator: string; reason: string }>;
  /** The relabel log's line count after this run, and the sha256 of its last line (64 zeros when empty). */
  relabelLogLines: number;
  relabelLogHead: string;
  /** sha256 over the sorted sha256 of every artifact scanned, one per line. */
  originalsDigest: string;
}

export function originalsDigest(hashes: readonly string[]): string {
  return sha256Hex([...hashes].sort().join("\n"));
}

/** The receipt's bytes, its path and its signature. Call before anything is written: a failed signature stops the run. */
export function signReceipt(workspace: string, receipt: MigrationReceipt, sign: (digestHex: string) => SignedDigest):
  { path: string; json: string; signed: SignedDigest } {
  const path = join(RECEIPTS_DIR, `${receipt.finishedAt.replace(/[-:.]/g, "")}.json`);
  if (existsSync(join(workspace, path))) throw new Error(`receipt already exists: ${path}`);
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  return { path, json, signed: sign(sha256Hex(json)) };
}

/** Signature first, as the repair receipt does, so a receipt on disk always has its signature beside it. Never overwrites. */
export function writeReceipt(workspace: string, out: { path: string; json: string; signed: SignedDigest }): void {
  mkdirSync(join(workspace, RECEIPTS_DIR), { recursive: true });
  writeFileSync(join(workspace, `${out.path}.sig`), `${JSON.stringify(out.signed, null, 2)}\n`, { flag: "wx" });
  writeFileSync(join(workspace, out.path), out.json, { flag: "wx" });
}

/** Receipt file names, oldest first (names are UTC timestamps). */
export function receiptNames(workspace: string): string[] {
  const dir = join(workspace, RECEIPTS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort() : [];
}

/**
 * The log line count and head a receipt attests, once its signature verifies under the policy MIGRATION_RECEIPT is
 * signed with (verifySignedDigest: the workspace auditor key history); otherwise why it does not.
 */
export function attestedLogHead(workspace: string, name: string): { lines: number; head: string } | { error: string } {
  const path = join(workspace, RECEIPTS_DIR, name);
  try {
    const json = readFileSync(path, "utf8");
    const signed = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as SignedDigest;
    const digestHex = sha256Hex(json);
    if (signed?.digestSha256 !== digestHex || typeof signed.signature !== "string"
      || !verifySignedDigest({ workspace, digestHex, signed })) {
      return { error: "its MIGRATION_RECEIPT signature does not verify" };
    }
    const receipt = JSON.parse(json) as Partial<MigrationReceipt>;
    if (!Number.isInteger(receipt.relabelLogLines) || typeof receipt.relabelLogHead !== "string") {
      return { error: "it records no relabel log line count and head" };
    }
    return { lines: receipt.relabelLogLines as number, head: receipt.relabelLogHead };
  } catch (error) {
    return { error: `unreadable or unsigned (${error instanceof Error ? error.message : String(error)})` };
  }
}
