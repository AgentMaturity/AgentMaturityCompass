import type { EvidenceEvent } from "../types.js";
import { extractEnvelope } from "./sessionTypes.js";
import type { SurfaceOp, SurfacePartRef, SurfaceRole } from "./sessionTypes.js";

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
interface SurfaceEntry {
  readonly slot: string;
  readonly role: SurfaceRole;
  readonly part: SurfacePartRef;
}

// Fold the ordered session events' surface ops (append / replace / retract /
// none) into the conversation the model would see. Input is the committed rows
// in chain (rowid) order; the envelope carrying each op is read out of meta_json.
//
// The fold is pure and deterministic: the same events always yield an identical
// ConversationHistory, byte-for-byte. No clock, no randomness, no object-key
// iteration — order comes only from the input sequence and append position. This
// is dsh's "model-visible history is DERIVED from the log": assistant/block
// events assemble into content blocks, and consecutive same-role parts coalesce
// into one message, exactly as a provider groups content blocks.
export function projectSurface(events: readonly EvidenceEvent[]): ConversationHistory {
  const entries = events.reduce<readonly SurfaceEntry[]>((acc, event) => {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) {
      // Not a spine row (or malformed meta): it carries no surface op and so
      // contributes nothing to the derived conversation.
      return acc;
    }
    return applySurfaceOp(acc, envelope.surface);
  }, []);
  return groupByRole(entries);
}

// Apply one surface op to the ordered entry list, returning a new list. Every
// branch is non-mutating; the empty-slot cases are no-ops rather than errors so
// projection stays total over any well-formed op sequence.
function applySurfaceOp(
  entries: readonly SurfaceEntry[],
  op: SurfaceOp
): readonly SurfaceEntry[] {
  switch (op.op) {
    case "none":
      return entries;
    case "append":
      // Every append is a NEW position, even when the slot repeats. The "system"
      // and "user" slots recur across turns, so slot identity governs only
      // replace/retract targeting — never whether an append collapses into a
      // prior one. That is what keeps a multi-turn conversation from folding all
      // its user messages onto a single slot.
      return [...entries, { slot: op.slot, role: op.role, part: op.part }];
    case "replace":
      return replaceLastSlot(entries, op.slot, op.part);
    case "retract":
      return retractLastSlot(entries, op.slot);
  }
}

// Swap the part of the most recently appended live entry for `slot`, keeping its
// position and role. Replace on a slot that is not present is a no-op: there is
// nothing to swap, and the projection never invents a position for content it
// cannot place (redaction always replaces a slot its own append created).
function replaceLastSlot(
  entries: readonly SurfaceEntry[],
  slot: string,
  part: SurfacePartRef
): readonly SurfaceEntry[] {
  const targetIndex = lastIndexOfSlot(entries, slot);
  if (targetIndex === -1) {
    return entries;
  }
  return entries.map((entry, index) =>
    index === targetIndex ? { slot: entry.slot, role: entry.role, part } : entry
  );
}

// Remove the most recently appended live entry for `slot`. Retract on an absent
// slot is a no-op, mirroring replace.
function retractLastSlot(
  entries: readonly SurfaceEntry[],
  slot: string
): readonly SurfaceEntry[] {
  const targetIndex = lastIndexOfSlot(entries, slot);
  if (targetIndex === -1) {
    return entries;
  }
  return entries.filter((_, index) => index !== targetIndex);
}

// Highest index of an entry matching `slot`, or -1. Scans from the tail so
// replace/retract resolve the most recent occurrence deterministically even when
// a slot recurs.
function lastIndexOfSlot(entries: readonly SurfaceEntry[], slot: string): number {
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
function groupByRole(entries: readonly SurfaceEntry[]): ConversationHistory {
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
