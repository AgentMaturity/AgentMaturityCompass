/**
 * The relabel log (P1-35): append-only JSON Lines at .amc/migrations/relabel.jsonl. Each line records the legacy
 * claim one 1.x result is read under, chained to the line before it by SHA-256, and every line is attested by a
 * signed migration receipt. The originals are never written; a record cites them by locator and hash.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import type { LegacyArtifactKind, LegacyOriginal } from "./classify.js";
import type { LegacyClaimKind } from "./notices.js";
import { attestedLogHead, receiptNames, RECEIPTS_DIR } from "./receipt.js";

export const RELABEL_LOG = ".amc/migrations/relabel.jsonl";
const GENESIS_HASH = "0".repeat(64);

export interface RelabelRecord {
  v: 1;
  seq: number;
  /** sha256 of the previous line; 64 zeros for the first. */
  prevHash: string;
  noticeId: string;
  noticeVersion: number;
  /** `locator` is "ledger-session:<id>" or a path; `sha256` covers the bytes (a session: its ordered event hashes). */
  artifact: { kind: LegacyArtifactKind; locator: string; sha256: string };
  original: LegacyOriginal;
  assigned: { claimKind: LegacyClaimKind; legacy: true; levelCap: "L1" | null };
  /**
   * The artifact's own verifier verdict where AMC has one (ledger check, run seal, bundle or certificate verifier).
   * `integrityFailed` is still a legacy relabel; no verdict ever raises the assigned claim.
   */
  integrity: { status: "verified" | "integrityFailed" | "notChecked"; trusted: boolean | null; reasons: string[] };
  rule: string;
  recordedAt: string;
  recordedBy: { tool: "agent-maturity-compass"; version: string };
}

export type RelabelLogCheck = { ok: true; records: RelabelRecord[]; head: string }
  | { ok: false; line: number | null; reason: string };

function readLines(workspace: string): string[] {
  const path = join(workspace, RELABEL_LOG);
  if (!existsSync(path)) return [];
  const body = readFileSync(path, "utf8");
  return body === "" ? [] : body.replace(/\n$/, "").split("\n");
}

/**
 * The only way to read relabel records. Checks every line's sequence number and link to the line before it, then
 * binds the chain to the signed receipts: each receipt's MIGRATION_RECEIPT signature must verify and its
 * relabelLogHead must equal the chain head at the line count it records, and the newest receipt must cover every
 * line. Lines no signed receipt covers are unattested and fail. `line` (1-based) is the line that changed, or null
 * for a receipt problem; a link that breaks blames the line before it.
 */
export function verifyRelabelLog(workspace: string): RelabelLogCheck {
  const records: RelabelRecord[] = [];
  const lines = readLines(workspace);
  const heads = [GENESIS_HASH];
  let head = GENESIS_HASH;
  for (const [index, line] of lines.entries()) {
    let parsed: RelabelRecord;
    try {
      parsed = JSON.parse(line) as RelabelRecord;
    } catch {
      return { ok: false, line: index + 1, reason: "not JSON" };
    }
    if (parsed?.v !== 1 || parsed.seq !== index + 1) return { ok: false, line: index + 1, reason: `expected seq ${index + 1}` };
    if (parsed.prevHash !== head) {
      return index === 0 ? { ok: false, line: 1, reason: "the first line's prevHash is not 64 zeros" }
        : { ok: false, line: index, reason: `its hash no longer matches line ${index + 1}'s prevHash` };
    }
    records.push(parsed);
    head = sha256Hex(line);
    heads.push(head);
  }
  let covered = 0;
  for (const name of receiptNames(workspace)) {
    const attested = attestedLogHead(workspace, name);
    if ("error" in attested) return { ok: false, line: null, reason: `${RECEIPTS_DIR}/${name}: ${attested.error}` };
    if (attested.lines > lines.length) {
      return { ok: false, line: null, reason: `${RECEIPTS_DIR}/${name} attests ${attested.lines} lines but the log has ${lines.length}` };
    }
    if (heads[attested.lines] !== attested.head) {
      return { ok: false, line: attested.lines, reason: `the log no longer matches the head ${RECEIPTS_DIR}/${name} signed` };
    }
    covered = attested.lines;
  }
  if (covered < lines.length) {
    return { ok: false, line: covered + 1, reason: `lines ${covered + 1}-${lines.length} are not attested by a signed receipt` };
  }
  return { ok: true, records, head };
}

/** Chains new records onto `head`: returns their lines and the new head. Writes nothing. */
export function chainRecords(head: string, firstSeq: number,
  drafts: ReadonlyArray<Omit<RelabelRecord, "v" | "seq" | "prevHash">>): { lines: string[]; head: string } {
  const lines: string[] = [];
  for (const [index, draft] of drafts.entries()) {
    const line = JSON.stringify({ v: 1, seq: firstSeq + index, prevHash: head, ...draft } satisfies RelabelRecord);
    lines.push(line);
    head = sha256Hex(line);
  }
  return { lines, head };
}

/** Appends lines; the only write the log ever sees. */
export function appendRelabelLines(workspace: string, lines: readonly string[]): void {
  if (lines.length === 0) return;
  const path = join(workspace, RELABEL_LOG);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${lines.join("\n")}\n`);
}
