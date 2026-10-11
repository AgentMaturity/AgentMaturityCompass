/**
 * The two anti-rollback anchors for sequenced files a workspace signs (P1-08): this machine's high-water mark
 * (src/keys/highWater.ts, outside every workspace) and the workspace transparency log, where each accepted revocation
 * list, rotation statement and key-history revision is appended as `<id>#<sequence>`. The log lives in the workspace,
 * so it is not independent of a workspace writer; P1-26 anchors it publicly.
 */
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { transparencyEntrySchema, type TransparencyArtifactKind } from "../transparency/logSchema.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import {
  AntiRollbackError, compareHighWater, highWaterKey, readHighWater, recordHighWater, workspaceScope, type HighWaterKind
} from "./highWater.js";

export type AnchorType = "REVOCATION_LIST" | "KEY_ROTATION" | "KEY_HISTORY_REVISION";

const ANCHOR_KINDS: Record<AnchorType, { artifact: TransparencyArtifactKind; highWater: HighWaterKind }> = {
  REVOCATION_LIST: { artifact: "revocation-list", highWater: "revocation-list" },
  KEY_ROTATION: { artifact: "key-rotation", highWater: "rotation" },
  KEY_HISTORY_REVISION: { artifact: "key-history", highWater: "key-history" }
};

export interface AnchorTarget {
  workspace: string;
  type: AnchorType;
  /** A list id or chain id without "#"; the anchored artifact id is `<id>#<sequence>`. */
  id: string;
  sequence: number;
  /** The logged identity: sha256 of the signed content. */
  sha256: string;
  /** The machine mark's identity: sha256 of the whole file when it carries more than the signed content. */
  fileSha256?: string;
  /** The transparency entry hash the file claims (its `anchor`); checked whenever the log is read. */
  entryHash?: string | null;
}

function markKey(target: Pick<AnchorTarget, "workspace" | "type" | "id">): string {
  return highWaterKey(ANCHOR_KINDS[target.type].highWater, `${target.id}@${workspaceScope(target.workspace)}`);
}

/** The highest sequence the workspace transparency log records for `id`, with its sha256. A matching line that does not parse throws. */
export function loggedAnchor(workspace: string, type: AnchorType, id: string): { sequence: number; sha256: string; entryHash: string } | null {
  const log = readContainedOrNull(workspace, ".amc/transparency/log.jsonl", 2 * 1024 * 1024 * 1024 - 1);
  if (log === null) return null;
  const prefix = `${id}#`;
  let best: { sequence: number; sha256: string; entryHash: string } | null = null;
  for (const line of log.toString("utf8").split("\n")) {
    if (!line.includes(type) || !line.includes(prefix)) continue;
    const entry = transparencyEntrySchema.parse(JSON.parse(line));
    if (entry.type !== type || entry.artifact.id === undefined || !entry.artifact.id.startsWith(prefix)) continue;
    const sequence = Number(entry.artifact.id.slice(prefix.length));
    if (!Number.isSafeInteger(sequence)) continue;
    if (best === null || sequence > best.sequence) best = { sequence, sha256: entry.artifact.sha256, entryHash: entry.hash };
  }
  return best;
}

/**
 * Refuses `target` when either anchor holds a higher sequence (ROLLBACK_DETECTED) or the same sequence with other
 * bytes (FORK_DETECTED). The log is read only when this machine's mark is missing or behind, so the steady state costs
 * one small file read; an accepted higher sequence then raises the mark.
 */
export function assertNotRolledBack(target: AnchorTarget): void {
  const key = markKey(target);
  const identity = target.fileSha256 ?? target.sha256;
  const recorded = readHighWater(key);
  compareHighWater(key, recorded, target.sequence, identity);
  if (recorded !== null && recorded.sequence === target.sequence) return;
  const logged = loggedAnchor(target.workspace, target.type, target.id);
  compareHighWater(`${target.id} in the workspace transparency log`, logged, target.sequence, target.sha256);
  // A null anchor is a file written inside a key-set commit and logged after it; its content is still bound by the log.
  if (target.entryHash != null && logged !== null && logged.sequence === target.sequence && target.entryHash !== logged.entryHash) {
    throw new AntiRollbackError("FORK_DETECTED", `${target.id}#${target.sequence} names transparency entry ${target.entryHash ?? "none"}, not the logged ${logged.entryHash}`);
  }
  recordHighWater(key, target.sequence, identity);
}

/** This machine's mark for `id` alone (no log scan). */
export function machineMark(workspace: string, type: AnchorType, id: string): { sequence: number; sha256: string } | null {
  return readHighWater(markKey({ workspace, type, id }));
}

/** A missing file is never read as an empty bootstrap once either anchor has recorded it. */
export function assertNeverAnchored(workspace: string, type: AnchorType, id: string): void {
  const recorded = readHighWater(markKey({ workspace, type, id })) ?? loggedAnchor(workspace, type, id);
  if (recorded !== null) {
    throw new AntiRollbackError("ROLLBACK_DETECTED",
      `${id} is missing, but sequence ${recorded.sequence} was accepted before; restore that file (an empty one would undo it)`);
  }
}

/** Appends the transparency entry for `target` and returns its hash. Raise the machine mark once the file is final. */
export function logSequence(target: Omit<AnchorTarget, "fileSha256" | "entryHash">): string {
  return appendTransparencyEntry({
    workspace: target.workspace,
    type: target.type,
    agentId: "workspace",
    artifact: { kind: ANCHOR_KINDS[target.type].artifact, sha256: target.sha256, id: `${target.id}#${target.sequence}` }
  }).hash;
}

/** Raises this machine's mark to the final file (refusing a lower or forked one). */
export function markSequence(target: AnchorTarget): void {
  recordHighWater(markKey(target), target.sequence, target.fileSha256 ?? target.sha256);
}
