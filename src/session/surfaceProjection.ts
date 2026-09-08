import type { EvidenceEvent } from "../types.js";
import { defineProjection } from "./projection/projectionTypes.js";
import type { ProjectionUnit } from "./projection/projectionTypes.js";
import { extractEnvelope } from "./sessionTypes.js";
import type { SurfaceOp, SurfacePartRef, SurfaceRole } from "./sessionTypes.js";
import { applySurfaceCompaction } from "./surfaceCompactionValidation.js";

// A single role-grouped message in the derived conversation. `parts` are
// references, not bytes: each SurfacePartRef.sha256 names the payload of exactly
// one logged event, which a caller resolves from the ledger. That indirection is
// the structural statement of "model-visible ⊆ logged" — projection never
// synthesises content that is not some row's payload.
export interface ConversationMessage {
  readonly role: SurfaceRole;
  readonly parts: readonly SurfacePartRef[];
}

export type ConversationHistory = readonly ConversationMessage[];

// A live surface entry, positioned in first-append order. `slot` is the identity
// that replace/retract target; `role` and `part` are what the projection
// renders. Held as a flat ordered list rather than a keyed map so iteration is
// append order and never depends on object-key enumeration — the determinism
// contract forbids any such dependence.
export interface SurfaceEntry {
  readonly slot: string;
  readonly role: SurfaceRole;
  readonly part: SurfacePartRef;
  // Which row put this part here — the row that appended it, or the row that
  // last replaced it. `part.sha256` names a payload; a payload can legitimately
  // repeat (the same user message twice), so the sha alone cannot say WHICH row
  // a part came from. Request derivation (src/llm/request/) needs the row, not
  // just the bytes: a tool_use part's call id and tool name live in its row's
  // meta_json, not in its payload. Carried in fold STATE only — the signed
  // SurfacePartRef is unchanged, and the ConversationHistory view below does not
  // expose it, so no consumer of the projection sees a different value.
  readonly sourceEventId: string;
  /** Stable identity of the original append, retained through replacements. */
  readonly originEventId: string;
  readonly sourceEventHash: string;
}

// The fold state: the ordered live entries. Exported because it is the state
// type of the registered projection unit below, and a projection's state type
// is part of its public contract even though consumers never inspect it.
export type SurfaceProjectionState = readonly SurfaceEntry[];

// Fold the ordered session events' surface ops (append / replace / retract /
// compact / none) into the conversation the model would see. Input is the committed rows
// in chain (rowid) order; the envelope carrying each op is read out of meta_json.
//
// The fold is pure and deterministic: the same events always yield an identical
// ConversationHistory, byte-for-byte. No clock, no randomness, no object-key
// iteration — order comes only from the input sequence and append position. This
// is dsh's "model-visible history is DERIVED from the log": assistant/block
// events assemble into content blocks, and consecutive same-role parts coalesce
// into one message, exactly as a provider groups content blocks.
export function projectSurface(events: readonly EvidenceEvent[]): ConversationHistory {
  // Expressed through the registered unit rather than duplicating the fold, so
  // "the registry drives the same projection this function returns" is
  // structural: there is one init/apply/view, and no second copy to drift.
  return surfaceProjection.view(foldSurfaceEntries(events));
}

// One fold step. Returns the state it was GIVEN when a row carries no envelope,
// which is what lets the registry's Object.is gating report "no change" for
// every non-spine row — and in a shared workspace ledger most rows are exactly
// that. Same reasoning applies inside applySurfaceOp for the `none` op and for
// replace/retract against an absent slot.
function applySurfaceEvent(
  entries: SurfaceProjectionState,
  event: EvidenceEvent
): SurfaceProjectionState {
  const envelope = extractEnvelope(event.meta_json);
  if (envelope === null) {
    // Not a spine row (or malformed meta): it carries no surface op and so
    // contributes nothing to the derived conversation.
    return entries;
  }
  if (envelope.surface.op === "compact") return applySurfaceCompaction(entries, event, envelope);
  return applySurfaceOp(entries, envelope.surface, event.id, event.event_hash);
}

// The fold with no registry and no cache: the ordered live entries as of the
// end of `events`. Same `apply` the registered unit runs, so there is exactly
// one definition of what a surface op means and nothing to drift. Exported for
// request derivation, which needs the entries (with their provenance) rather
// than the role-grouped view.
export function foldSurfaceEntries(events: readonly EvidenceEvent[]): SurfaceProjectionState {
  return events.reduce<SurfaceProjectionState>(surfaceProjection.apply, surfaceProjection.init());
}

/** Registry key for the surface fold. */
export const SURFACE_PROJECTION_KEY = "session/surface";

// The surface fold in its registered form (plan P2.3). P2.2 shipped it as a
// one-off call; going through the registry buys it a stale-but-never-wrong
// cache, so a caller that projects repeatedly resumes from the cached prefix
// instead of re-parsing every row's meta_json, and it puts the second and third
// projections on a path that already exists.
export const surfaceProjection: ProjectionUnit<SurfaceProjectionState, ConversationHistory> =
  defineProjection({
    key: SURFACE_PROJECTION_KEY,
    // Bump when what this fold MEANS changes — a new SurfaceOp variant, a
    // different role-grouping rule, a change to which rows contribute. Cached
    // state from an older version is discarded, never migrated. Bumped to 2 when
    // SurfaceEntry gained `sourceEventId`: a v1 cached state has no such field,
    // and reading one back would hand derivation `undefined` provenance. Version
    // 3 adds stable origins and source hashes for authenticated range compaction.
    stateVersion: 3,
    init: (): SurfaceProjectionState => [],
    apply: applySurfaceEvent,
    view: groupByRole
  });

// Apply one surface op to the ordered entry list, returning a new list. Every
// branch is non-mutating; the empty-slot cases are no-ops rather than errors so
// projection stays total over any well-formed op sequence.
function applySurfaceOp(
  entries: SurfaceProjectionState,
  op: SurfaceOp,
  sourceEventId: string,
  sourceEventHash: string
): SurfaceProjectionState {
  switch (op.op) {
    case "none":
      return entries;
    case "append":
      // Every append is a NEW position, even when the slot repeats. The "system"
      // and "user" slots recur across turns, so slot identity governs only
      // replace/retract targeting — never whether an append collapses into a
      // prior one. That is what keeps a multi-turn conversation from folding all
      // its user messages onto a single slot.
      return [...entries, { slot: op.slot, role: op.role, part: op.part, sourceEventId, originEventId: sourceEventId, sourceEventHash }];
    case "replace":
      return replaceLastSlot(entries, op.slot, op.part, sourceEventId, sourceEventHash);
    case "retract":
      return retractLastSlot(entries, op.slot);
    case "compact":
      throw new Error("compaction requires its signed receipt");
  }
}

// Swap the part of the most recently appended live entry for `slot`, keeping its
// position and role. Replace on a slot that is not present is a no-op: there is
// nothing to swap, and the projection never invents a position for content it
// cannot place (redaction always replaces a slot its own append created).
function replaceLastSlot(
  entries: SurfaceProjectionState,
  slot: string,
  part: SurfacePartRef,
  sourceEventId: string,
  sourceEventHash: string
): SurfaceProjectionState {
  const targetIndex = lastIndexOfSlot(entries, slot);
  if (targetIndex === -1) {
    return entries;
  }
  // Provenance moves with the part: after a replace, the row that supplied the
  // new bytes is the row a reader must consult for that entry's meta.
  return entries.map((entry, index) =>
    index === targetIndex ? { ...entry, part, sourceEventId, sourceEventHash } : entry
  );
}

// Remove the most recently appended live entry for `slot`. Retract on an absent
// slot is a no-op, mirroring replace.
function retractLastSlot(
  entries: SurfaceProjectionState,
  slot: string
): SurfaceProjectionState {
  const targetIndex = lastIndexOfSlot(entries, slot);
  if (targetIndex === -1) {
    return entries;
  }
  return entries.filter((_, index) => index !== targetIndex);
}

// Highest index of an entry matching `slot`, or -1. Scans from the tail so
// replace/retract resolve the most recent occurrence deterministically even when
// a slot recurs.
function lastIndexOfSlot(entries: SurfaceProjectionState, slot: string): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry !== undefined && entry.slot === slot) {
      return index;
    }
  }
  return -1;
}

// Coalesce consecutive same-role entries into one ConversationMessage, so an
// assistant's text/thinking/tool_use blocks become a single assistant message
// with several parts while a role change starts a new message — the shape a
// provider consumes.
function groupByRole(entries: SurfaceProjectionState): ConversationHistory {
  return entries.reduce<readonly ConversationMessage[]>((messages, entry) => {
    const last = messages[messages.length - 1];
    if (last !== undefined && last.role === entry.role) {
      const merged: ConversationMessage = {
        role: last.role,
        parts: [...last.parts, entry.part]
      };
      return [...messages.slice(0, -1), merged];
    }
    return [...messages, { role: entry.role, parts: [entry.part] }];
  }, []);
}
