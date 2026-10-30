import { lstatSync, readFileSync, statSync, unlinkSync } from "node:fs";
import type { TransparencyAppendProgress } from "./workspacePublication.js";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { MerkleAlgorithm } from "./merkle.js";
import { merkleFrontierPath, merkleLeavesPath, merklePendingPath, transparencyMerkleDir } from "./merklePaths.js";
import {
  frontierMatchesLeafCount,
  frontierRoot,
  type MerkleFrontier
} from "./merkleFrontier.js";

/**
 * Persistence for the two pieces of state the incremental Merkle writer owns:
 * the resume frontier, and the "the root lags the log" marker.
 *
 * Neither file is trusted. The frontier is a cache whose only job is to make an
 * append O(log n) instead of O(n); every verification path still recomputes the
 * root from log.jsonl, so a tampered frontier cannot make a bad root verify —
 * it can only cost a rebuild. The marker is the opposite: it exists so a failed
 * update is still discoverable after the process that hit it is gone.
 */
const merkleFrontierStateSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  leafCount: z.number().int().min(0),
  /** Tail of the log this frontier covers; "" for an empty log. */
  lastEntryHash: z.string(),
  root: z.string().length(64),
  /** Size of leaves.jsonl when this state was written, so drift is an O(1) stat(). */
  leavesBytes: z.number().int().min(0),
  frontier: z.array(
    z.object({
      level: z.number().int().min(0),
      hash: z.string().length(64)
    })
  )
});

export type MerkleFrontierState = z.infer<typeof merkleFrontierStateSchema>;

const merklePendingSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  /** The log entry that is committed but not yet covered by the signed root. */
  entryHash: z.string().length(64),
  reason: z.string().min(1)
});

export type MerklePendingMarker = z.infer<typeof merklePendingSchema>;

/**
 * Reads the resume state, or null when it is absent, unparseable, or internally
 * inconsistent.
 *
 * Returning null rather than throwing is deliberate: every null answer routes
 * the caller to a full rebuild, which is always correct. A cache that can crash
 * the append path would be worse than no cache.
 */
export function readMerkleFrontierState(workspace: string): MerkleFrontierState | null {
  const path = merkleFrontierPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  try {
    return merkleFrontierStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  } catch {
    return null;
  }
}

export function writeMerkleFrontierState(params: {
  workspace: string;
  frontier: MerkleFrontier;
  leafCount: number;
  lastEntryHash: string;
  root: string;
}): MerkleFrontierState {
  ensureDir(transparencyMerkleDir(params.workspace));
  const state = prepareMerkleFrontierState({ ...params, ts: Date.now(), leavesBytes: leavesFileBytes(params.workspace) });
  writeFileAtomic(merkleFrontierPath(params.workspace), JSON.stringify(state, null, 2), 0o644);
  return state;
}

/** Pure exact frontier recipe, shared with the actual owned async publisher. */
export function prepareMerkleFrontierState(params: {
  ts: number; frontier: MerkleFrontier; leafCount: number; lastEntryHash: string; root: string; leavesBytes: number;
}): MerkleFrontierState {
  return merkleFrontierStateSchema.parse({ v: 1, ts: params.ts, leafCount: params.leafCount,
    lastEntryHash: params.lastEntryHash, root: params.root, leavesBytes: params.leavesBytes,
    frontier: params.frontier.map(node => ({ level: node.level, hash: node.hash })) });
}

/** Byte length of leaves.jsonl, 0 when it does not exist. */
export function leavesFileBytes(workspace: string): number {
  const path = merkleLeavesPath(workspace);
  if (!pathExists(path)) {
    return 0;
  }
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Why this frontier cannot be resumed against `expectedPrevEntryHash`, or null
 * when it can.
 *
 * The anchor is the log's own hash chain: an entry's `prev` field is the hash of
 * the entry before it, so a frontier whose `lastEntryHash` equals it covers
 * exactly the prefix this append extends. The shape and self-root checks then
 * make a hand-edited frontier fall back to a rebuild instead of silently
 * steering every future root. `algorithm` comes from the signed root, never from
 * this cache, so a frontier of the other tree cannot fold to its recorded root.
 */
export function frontierResumeBlocker(params: {
  state: MerkleFrontierState;
  expectedPrevEntryHash: string;
  leavesBytes: number;
  algorithm: MerkleAlgorithm;
}): string | null {
  const { state } = params;
  if (state.lastEntryHash !== params.expectedPrevEntryHash) {
    return `frontier covers ${state.lastEntryHash || "<empty log>"}, append extends ${params.expectedPrevEntryHash || "<empty log>"}`;
  }
  if (state.leafCount === 0 && state.lastEntryHash !== "") {
    return "frontier claims zero leaves but names a tail entry";
  }
  if (!frontierMatchesLeafCount(state.frontier, state.leafCount)) {
    return `frontier shape does not match leafCount ${state.leafCount}`;
  }
  if (frontierRoot(state.frontier, params.algorithm) !== state.root) {
    return "frontier nodes do not fold to the recorded root";
  }
  if (state.leavesBytes !== params.leavesBytes) {
    return `leaves.jsonl is ${params.leavesBytes} bytes, frontier recorded ${state.leavesBytes}`;
  }
  return null;
}

export function readMerklePendingMarker(workspace: string): MerklePendingMarker | null {
  const path = merklePendingPath(workspace);
  if (!pathExists(path)) {
    return null;
  }
  try {
    return merklePendingSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  } catch {
    // A corrupt marker still means someone wrote one. Reporting a lag with an
    // unreadable reason is right; swallowing it because the JSON is bad is not.
    return { v: 1, ts: 0, entryHash: "0".repeat(64), reason: "unreadable pending marker" };
  }
}

/**
 * Records that the signed root does not yet cover `entryHash`.
 *
 * Returns false when the marker itself could not be written — the caller is
 * already on a failure path and must say so rather than assume the failure was
 * recorded.
 */
export function writeMerklePendingMarker(params: {
  workspace: string;
  entryHash: string;
  reason: string;
}): boolean {
  try {
    ensureDir(transparencyMerkleDir(params.workspace));
    const bytes = prepareMerklePendingMarkerBytes({ ...params, ts: Date.now() }), path = merklePendingPath(params.workspace);
    writeFileAtomic(path, bytes, 0o644);
    const first = lstatSync(path), observed = readFileSync(path), last = lstatSync(path);
    return first.isFile() && last.isFile() && first.dev === last.dev && first.ino === last.ino
      && first.mode === last.mode && first.size === last.size && first.mtimeMs === last.mtimeMs
      && (last.mode & 0o777) === 0o644 && observed.equals(bytes);
  } catch {
    return false;
  }
}

/** Exact pending bytes; the owned async path retains native/acknowledgment failure causes itself. */
export function prepareMerklePendingMarkerBytes(params: { ts: number; entryHash: string; reason: string }): Buffer {
  const marker = merklePendingSchema.parse({ v: 1, ts: params.ts, entryHash: params.entryHash, reason: params.reason.slice(0, 2000) });
  return Buffer.from(JSON.stringify(marker, null, 2));
}

/**
 * Compatibility base for acknowledged committed-line failures. `rootCovered` distinguishes completed-root cleanup
 * failure from ordinary Merkle lag; legacy consumers still project the known entryHash/pendingRecorded fields.
 * Thrown when a transparency entry is committed to the log but the Merkle root
 * could not be advanced to cover it.
 *
 * Ordinary instances mean the line was acknowledged but the root could not be advanced.
 * The root-covered subclass instead means cleanup/final continuation is incomplete; inspect `rootCovered`.
 * The compatibility base retains the known committed entry for old consumers. A caller that genuinely cannot fail
 * (an HTTP handler mid-response) can catch this specific type and record a
 * degraded outcome; catching `Error` broadly and continuing would put us back
 * where the swallowed console.error left us.
 */
export class TransparencyMerkleLagError extends Error {
  readonly entryHash: string;
  readonly pendingRecorded: boolean;

  readonly rootCovered: boolean;
  readonly progress: TransparencyAppendProgress | undefined;
  readonly pendingCause: unknown;
  readonly pendingProgress: TransparencyAppendProgress | undefined;

  constructor(params: { entryHash: string; pendingRecorded: boolean; reason: string; cause?: unknown;
    rootCovered?: boolean; progress?: TransparencyAppendProgress; pendingCause?: unknown; pendingProgress?: TransparencyAppendProgress }) {
    super(
      params.rootCovered ? `transparency append cleanup incomplete: entry ${params.entryHash} is committed; this attempt acknowledged a covering signed root before cleanup/final continuation failed (${params.reason}); inspect pending-marker and publication progress.` :
      `transparency merkle root lags the log: entry ${params.entryHash} is committed to log.jsonl but the merkle index could not be updated (${params.reason}). ` +
        (params.pendingRecorded
          ? "A pending marker was written, so `amc transparency merkle root` will report the lag until `amc transparency merkle rebuild` repairs it."
          : "The pending marker could NOT be written, so nothing on disk records the lag — repair with `amc transparency merkle rebuild` now."),
      params.cause === undefined ? undefined : { cause: params.cause }
    );
    this.name = "TransparencyMerkleLagError";
    this.entryHash = params.entryHash;
    this.pendingRecorded = params.pendingRecorded;
    this.rootCovered = params.rootCovered ?? false;
    this.progress = params.progress;
    this.pendingCause = params.pendingCause;
    this.pendingProgress = params.pendingProgress;
  }
}
/** A covered committed line with incomplete cleanup/final continuation. The legacy base preserves wrapper progress. */
export class TransparencyAppendRootCoveredError extends TransparencyMerkleLagError {
  constructor(params: ConstructorParameters<typeof TransparencyMerkleLagError>[0]) {
    super({ ...params, rootCovered: true }); this.name = "TransparencyAppendRootCoveredError";
  }
}

/**
 * Clears the marker once the root demonstrably covers the log again.
 *
 * A concurrent clear losing the unlink race is not a failure of the update it
 * is called from — turning it into one would report a lag that no longer
 * exists. Anything else still propagates.
 */
export function clearMerklePendingMarker(workspace: string): void {
  const path = merklePendingPath(workspace);
  if (!pathExists(path)) {
    return;
  }
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
