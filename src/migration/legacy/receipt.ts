/**
 * The migration receipt (P1-35; the format-evolution receipt AMC-1511 left open): what one relabel run scanned and
 * recorded, the relabel log head it left, and a digest of the original artifacts' hashes. Signed as
 * MIGRATION_RECEIPT and written to .amc/migrations/receipts/<UTC timestamp>.json beside its .sig.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SignedDigest } from "../../crypto/signing/signerTypes.js";
import { sha256Hex } from "../../utils/hash.js";
import type { LegacyArtifactKind } from "./classify.js";

const RECEIPTS_DIR = ".amc/migrations/receipts";

export interface MigrationReceipt {
  v: 1;
  noticeId: string;
  noticeVersion: number;
  startedAt: string;
  finishedAt: string;
  scanned: Record<LegacyArtifactKind, number>;
  relabelled: Record<LegacyArtifactKind, number>;
  skipped: Array<{ locator: string; reason: string }>;
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
