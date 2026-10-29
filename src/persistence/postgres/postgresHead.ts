/**
 * The workspace's own signed record of its Postgres chain head, and the checks
 * that compare the database against it.
 *
 * Everything in the database is writable by whoever holds the database: rows,
 * and `amc_chain_heads` with them. A writer there can delete the tail and
 * rewind the head row so the remaining chain still links. The signed head is
 * the one thing that writer cannot produce: AMC signs `(chainId, headHash,
 * headSeq)` with the monitor key after each append it commits (and after a
 * migration), and keeps it in the workspace. Verification requires the chain
 * to still contain that exact row at that sequence, so the signed head is a
 * floor: rows after it are allowed (another process may have appended since),
 * rows missing below it are not.
 */
import { join } from "node:path";
import { getPublicKeyHistory, signHexDigestWith, verifyHexDigestAny } from "../../crypto/keys.js";
import { cachedSigningKey } from "../../keys/cachedSigningKey.js";
import type { EvidenceEvent } from "../../types.js";
import { pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

export interface PostgresChainSnapshot {
  readonly chainId: string;
  /** Events in chain order, each with its `chain_seq`. */
  readonly events: readonly { readonly seq: number; readonly event: EvidenceEvent }[];
  /** The `amc_chain_heads` row, or null when there is none. */
  readonly head: { readonly hash: string; readonly seq: number } | null;
}

export interface SignedHead {
  readonly v: 1;
  readonly chainId: string;
  readonly headHash: string;
  readonly headSeq: number;
  readonly sig: string;
}

/** The session chain (P2-09d) or the side-table mirror log (P2-36); each keeps its own signed floor. */
export type PostgresHeadStream = "events" | "ledger-mirror";

function headPath(workspace: string, stream: PostgresHeadStream): string {
  return join(workspace, ".amc", stream === "events" ? "postgres-store-head.json" : "postgres-ledger-mirror-head.json");
}

function headDigest(chainId: string, headHash: string, headSeq: number, stream: PostgresHeadStream): string {
  return sha256Hex(canonicalize({ v: 1, kind: stream === "events" ? "amc.postgres-chain-head" : "amc.postgres-ledger-mirror-head", chainId, headHash, headSeq }));
}

function readSignedHead(workspace: string, stream: PostgresHeadStream): SignedHead | null {
  const path = headPath(workspace, stream);
  if (!pathExists(path)) return null;
  const parsed = JSON.parse(readUtf8(path)) as Partial<SignedHead>;
  if (parsed.v !== 1 || typeof parsed.chainId !== "string" || typeof parsed.headHash !== "string"
    || !Number.isSafeInteger(parsed.headSeq) || typeof parsed.sig !== "string") {
    throw new Error("the workspace's signed Postgres head is malformed");
  }
  return parsed as SignedHead;
}

/**
 * Record a head this process just committed. Never moves the floor backwards.
 * ponytail: read-then-write without a lock; two processes racing can leave the
 * lower of their two heads, which is still a valid (weaker) floor.
 */
export function recordSignedPostgresHead(workspace: string, chainId: string, headHash: string, headSeq: number, stream: PostgresHeadStream = "events"): void {
  let existing: SignedHead | null = null;
  try {
    existing = readSignedHead(workspace, stream);
  } catch {
    existing = null; // a malformed file is replaced by a valid one; verification reported it already
  }
  if (existing !== null && existing.chainId === chainId && existing.headSeq >= headSeq) return;
  const record = signPostgresHead(workspace, chainId, headHash, headSeq, stream);
  writeFileAtomic(headPath(workspace, stream), `${JSON.stringify(record, null, 2)}\n`, 0o644);
}

/** The signed head record, in memory: migration checks a copy against the floor it will sign before it writes anything. */
export function signPostgresHead(workspace: string, chainId: string, headHash: string, headSeq: number, stream: PostgresHeadStream = "events"): SignedHead {
  const digest = headDigest(chainId, headHash, headSeq, stream);
  const sig = process.env.AMC_NO_SIGN === "1" ? "unsigned" : signHexDigestWith(cachedSigningKey(workspace, "ledger-row")(), digest);
  return { v: 1, chainId, headHash, headSeq, sig };
}

/** Read the signed head before the database snapshot, so any head it names was committed before the snapshot began. */
export function readSignedPostgresHeadForCheck(workspace: string, stream: PostgresHeadStream = "events"): { head: SignedHead | null; error: string | null } {
  try {
    return { head: readSignedHead(workspace, stream), error: null };
  } catch (error) {
    return { head: null, error: (error as Error).message };
  }
}

/** Problems with a snapshot's completeness: database head, signed head, emptiness. Row hashes and signatures are checked elsewhere. */
export function postgresChainProblems(
  workspace: string,
  snapshot: PostgresChainSnapshot,
  signed: { head: SignedHead | null; error: string | null }
): string[] {
  const problems: string[] = [];
  if (signed.error !== null) problems.push(signed.error);
  const last = snapshot.events.at(-1);
  if (snapshot.head === null) {
    if (last !== undefined || signed.head !== null) problems.push("the Postgres chain head row is missing");
  } else if (last === undefined) {
    if (snapshot.head.seq !== 0) problems.push(`the Postgres chain is empty but its chain head names seq ${snapshot.head.seq}`);
  } else if (last.seq !== snapshot.head.seq || last.event.event_hash !== snapshot.head.hash) {
    problems.push("the last Postgres row does not match the database chain head: rows were deleted or written outside AMC");
  }
  return [...problems, ...signedFloorProblems(workspace, "events", snapshot.chainId, signed.head, last !== undefined,
    (seq) => snapshot.events.find((entry) => entry.seq === seq)?.event.event_hash ?? null)];
}

/**
 * The signed floor against a database chain: present once the chain holds rows, naming this chain, verifying under the
 * monitor key, and naming a row the chain still holds at that sequence (`hashAt`). Rows after the floor are allowed.
 */
export function signedFloorProblems(workspace: string, stream: PostgresHeadStream, chainId: string, floor: SignedHead | null,
  hasRows: boolean, hashAt: (seq: number) => string | null): string[] {
  const what = stream === "events" ? "Postgres chain" : "Postgres ledger mirror log";
  const head = stream === "events" ? "Postgres" : "Postgres ledger mirror";
  if (floor === null) return hasRows ? [`the workspace holds no signed head for its ${what}; a database head alone is not evidence`] : [];
  if (floor.chainId !== chainId) return [`the workspace's signed ${head} head names another chain`];
  if (!verifyHexDigestAny(headDigest(floor.chainId, floor.headHash, floor.headSeq, stream), floor.sig, getPublicKeyHistory(workspace, "monitor"))) {
    return [`the workspace's signed ${head} head does not verify under the monitor key`];
  }
  if (floor.headSeq === 0 || hashAt(floor.headSeq) === floor.headHash) return [];
  return [`the ${what} does not contain the workspace's signed head (seq ${floor.headSeq}): truncated or rewritten`];
}
