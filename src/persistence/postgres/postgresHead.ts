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

interface SignedHead {
  readonly v: 1;
  readonly chainId: string;
  readonly headHash: string;
  readonly headSeq: number;
  readonly sig: string;
}

function headPath(workspace: string): string {
  return join(workspace, ".amc", "postgres-store-head.json");
}

function headDigest(chainId: string, headHash: string, headSeq: number): string {
  return sha256Hex(canonicalize({ v: 1, kind: "amc.postgres-chain-head", chainId, headHash, headSeq }));
}

function readSignedHead(workspace: string): SignedHead | null {
  const path = headPath(workspace);
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
export function recordSignedPostgresHead(workspace: string, chainId: string, headHash: string, headSeq: number): void {
  let existing: SignedHead | null = null;
  try {
    existing = readSignedHead(workspace);
  } catch {
    existing = null; // a malformed file is replaced by a valid one; verification reported it already
  }
  if (existing !== null && existing.chainId === chainId && existing.headSeq >= headSeq) return;
  const digest = headDigest(chainId, headHash, headSeq);
  const sig = process.env.AMC_NO_SIGN === "1" ? "unsigned" : signHexDigestWith(cachedSigningKey(workspace, "ledger-row")(), digest);
  const record: SignedHead = { v: 1, chainId, headHash, headSeq, sig };
  writeFileAtomic(headPath(workspace), `${JSON.stringify(record, null, 2)}\n`, 0o644);
}

/** Read the signed head before the database snapshot, so any head it names was committed before the snapshot began. */
export function readSignedPostgresHeadForCheck(workspace: string): { head: SignedHead | null; error: string | null } {
  try {
    return { head: readSignedHead(workspace), error: null };
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
  const floor = signed.head;
  if (floor === null) {
    if (last !== undefined) problems.push("the workspace holds no signed head for its Postgres chain; a database head alone is not evidence");
    return problems;
  }
  if (floor.chainId !== snapshot.chainId) {
    problems.push("the workspace's signed Postgres head names another chain");
    return problems;
  }
  if (!verifyHexDigestAny(headDigest(floor.chainId, floor.headHash, floor.headSeq), floor.sig, getPublicKeyHistory(workspace, "monitor"))) {
    problems.push("the workspace's signed Postgres head does not verify under the monitor key");
    return problems;
  }
  if (floor.headSeq === 0) return problems;
  const named = snapshot.events.find((entry) => entry.seq === floor.headSeq);
  if (named === undefined || named.event.event_hash !== floor.headHash) {
    problems.push(`the Postgres chain does not contain the workspace's signed head (seq ${floor.headSeq}): truncated or rewritten`);
  }
  return problems;
}
