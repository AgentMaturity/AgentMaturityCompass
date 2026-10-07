/**
 * The relabel log (P1-35): append-only JSON Lines at .amc/migrations/relabel.jsonl. Each line records the legacy
 * claim one 1.x result is read under, chained to the line before it by SHA-256. The originals are never written;
 * a record cites them by locator and hash.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import type { LegacyArtifactKind, LegacyOriginal } from "./classify.js";
import type { LegacyClaimKind } from "./notices.js";

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
  rule: string;
  recordedAt: string;
  recordedBy: { tool: "agent-maturity-compass"; version: string };
}

export type RelabelLogCheck = { ok: true; records: RelabelRecord[]; head: string }
  | { ok: false; line: number; reason: string };

function readLines(workspace: string): string[] {
  const path = join(workspace, RELABEL_LOG);
  if (!existsSync(path)) return [];
  const body = readFileSync(path, "utf8");
  return body === "" ? [] : body.replace(/\n$/, "").split("\n");
}

/**
 * Checks every line's sequence number and link to the line before it. `line` (1-based) is the line that changed:
 * a link that breaks blames the line before it. The last line is pinned by the newest receipt's relabelLogHead.
 */
export function verifyRelabelLog(workspace: string): RelabelLogCheck {
  const records: RelabelRecord[] = [];
  let head = GENESIS_HASH;
  for (const [index, line] of readLines(workspace).entries()) {
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
