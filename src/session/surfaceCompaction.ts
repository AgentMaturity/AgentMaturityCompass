import type { EvidenceEvent } from "../types.js";
import { foldSurfaceEntries } from "./surfaceProjection.js";
import type { SurfaceEntry } from "./surfaceProjection.js";
import type { SurfaceKind, SurfaceRole } from "./sessionTypes.js";

/**
 * Compacting history without editing it.
 *
 * Compaction shrinks what the model is sent; the log only ever grows. Every
 * function here is a decision ABOUT an append — which entry a compaction may
 * target, whether it really shrinks anything, what meta the new row must carry
 * so the entry still resolves — and none of them writes. SessionService owns the
 * append; this module owns the reasons.
 *
 * Kept out of sessionService.ts because that file is already at its size budget
 * and because these are pure functions over committed rows: they are far easier
 * to test as such than through a service that owns a store and a hash chain.
 */

/**
 * One live surface entry, as a pruner sees it.
 *
 * `originEventId` is the address: pass it back to `compactSurfaceEntry` or
 * `dropSurfaceEntry`. Deliberately NOT a `SurfaceEntry` — that is fold state,
 * and handing it out would make the projection's internal shape a public
 * contract.
 *
 * No byte count here. Session payloads are blob-backed, so a size would mean a
 * blob read per entry on every listing; and the caller that decides WHAT to
 * compact is already reading payloads to summarise them. That is the same
 * reasoning that makes `replacedBytes` a declared parameter rather than a
 * measurement.
 */
export interface LiveSurfaceEntry {
  readonly originEventId: string;
  /** The row a reader must consult for this entry's bytes and meta — the origin, or the last compaction of it. */
  readonly sourceEventId: string;
  readonly slot: string;
  readonly role: SurfaceRole;
  readonly kind: SurfaceKind;
  readonly sha256: string;
}

/** Every live entry, in surface order. */
export function describeLiveEntries(events: readonly EvidenceEvent[]): readonly LiveSurfaceEntry[] {
  return foldSurfaceEntries(events).map((entry) => ({
    originEventId: entry.originEventId,
    sourceEventId: entry.sourceEventId,
    slot: entry.slot,
    role: entry.role,
    kind: entry.part.kind,
    sha256: entry.part.sha256
  }));
}

/**
 * The live entry at `originEventId`, or a throw.
 *
 * An origin-addressed op against an entry that is not on the surface is a silent
 * no-op in the projection — which is right for the fold (it must stay total over
 * any op sequence a log can hold) and wrong for a caller, who would be told a
 * compaction happened while the model saw no change. The asymmetry is deliberate
 * and this is where it is enforced.
 */
export function requireLiveEntry(
  events: readonly EvidenceEvent[],
  originEventId: string
): SurfaceEntry {
  const entry = foldSurfaceEntries(events).find((candidate) => candidate.originEventId === originEventId);
  if (entry === undefined) {
    throw new Error(
      `cannot compact ${originEventId}: no live surface entry was appended by that event `
      + `(it was never on this session's surface, or a retraction has since removed it)`
    );
  }
  return entry;
}

/**
 * Refuse a replacement that is not smaller than what it replaces.
 *
 * Compaction that grows the surface is not compaction, and allowing it would
 * spend a signed row and a slice of the context window making things worse.
 * `replacedBytes` is declared by the caller rather than measured here because
 * session payloads are blob-backed — `payload_inline` is null even for a
 * two-byte row, so a check against it could never fire, and a check that cannot
 * fire is worse than no check.
 */
export function assertShrinks(originEventId: string, replacement: Buffer, replacedBytes: number): void {
  if (replacement.byteLength >= replacedBytes) {
    throw new Error(
      `refusing to compact ${originEventId}: the replacement is ${replacement.byteLength} bytes, `
      + `not smaller than the ${replacedBytes} it would replace`
    );
  }
}

/**
 * The meta a compaction row must carry for the entry to keep resolving.
 *
 * Request derivation reads a part's IDENTITY from the row that supplied it, not
 * from the projection: a tool_result part gets its `toolCallId` and its
 * success/failure from the row's meta, and a tool_use part its `toolCallId` and
 * `toolName`. A compaction becomes that row. So a compaction that recorded only
 * "how many bytes I saved" would strand the entry — a tool result with no call
 * id cannot be encoded at all, and one with no `outcome` reads back as a
 * FAILURE, telling the model a tool that succeeded had failed.
 *
 * Carried from the ORIGIN row, which is the authoritative record of the call,
 * rather than from whatever compaction happens to hold the position now.
 */
export function carriedIdentity(originRow: EvidenceEvent | undefined): Record<string, unknown> {
  const meta = parseMeta(originRow);
  // Fixed key order: `embedEnvelope` re-stringifies meta in insertion order and
  // the result is hashed, so a meta built in a different order hashes
  // differently. The conditions below are deterministic, so this order is too.
  return {
    ...(typeof meta["toolCallId"] === "string" ? { toolCallId: meta["toolCallId"] } : {}),
    ...(typeof meta["toolName"] === "string" ? { toolName: meta["toolName"] } : {}),
    ...(typeof meta["outcome"] === "string" ? { outcome: meta["outcome"] } : {})
  };
}

function parseMeta(row: EvidenceEvent | undefined): Record<string, unknown> {
  if (row === undefined) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(row.meta_json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
