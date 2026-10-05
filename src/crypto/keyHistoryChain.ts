/** Hash linkage is structural evidence only. Publicly recomputable hashes do
 * not authorize signing keys; keyHistoryEnvelope authenticates the full list. */
import { sha256Hex } from "../utils/hash.js";

export interface KeyHistoryEntry {
  createdTs: number;
  fingerprint: string;
  publicKeyPem: string;
  /** sha256 over the previous entry's hash plus this entry's own fields. */
  entryHash?: string;
  prevHash?: string;
  source?: "local" | "notary" | "imported";
}

export const KEY_HISTORY_GENESIS = "GENESIS";

/** Hash of one entry, committing to its predecessor. */
function keyHistoryEntryHash(
  item: Pick<KeyHistoryEntry, "createdTs" | "fingerprint" | "publicKeyPem">,
  prevHash: string
): string {
  return sha256Hex(
    Buffer.from(`${prevHash}|${item.createdTs}|${item.fingerprint}|${item.publicKeyPem}`, "utf8")
  );
}

/** The hash a new entry must chain onto, given the current history. */
function nextPrevHash(existing: readonly KeyHistoryEntry[]): string {
  if (existing.length === 0) return KEY_HISTORY_GENESIS;
  return existing[existing.length - 1]?.entryHash ?? KEY_HISTORY_GENESIS;
}

/** Builds a chained entry ready to append. */
export function buildKeyHistoryEntry(
  publicKeyPem: string,
  existing: readonly KeyHistoryEntry[],
  source: KeyHistoryEntry["source"] = "local",
  now: number = Date.now()
): KeyHistoryEntry {
  const base = {
    createdTs: now,
    fingerprint: sha256Hex(Buffer.from(publicKeyPem, "utf8")),
    publicKeyPem
  };
  const prevHash = nextPrevHash(existing);
  return { ...base, prevHash, entryHash: keyHistoryEntryHash(base, prevHash), source };
}

/**
 * Walks the chain.
 *
 * Unchained entries are accepted only as a leading **prefix** — keys written
 * before this workspace's history was chained. Accepting one after the chain
 * has started reopens the hole the chain closes: an attacker with workspace
 * write access simply omits `entryHash`.
 */
export function verifyKeyHistoryEntries(entries: readonly KeyHistoryEntry[]): {
  ok: boolean;
  brokenAtIndex: number | null;
  legacyEntries: number;
} {
  let prev = KEY_HISTORY_GENESIS;
  let legacy = 0;
  let chainStarted = false;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;

    if (!entry.entryHash) {
      if (chainStarted) return { ok: false, brokenAtIndex: index, legacyEntries: legacy };
      legacy += 1;
      prev = KEY_HISTORY_GENESIS;
      continue;
    }

    if (keyHistoryEntryHash(entry, entry.prevHash ?? prev) !== entry.entryHash) {
      return { ok: false, brokenAtIndex: index, legacyEntries: legacy };
    }
    // A chained entry must commit to its predecessor, or the chain is a set of
    // independently-valid links that can be reordered or spliced.
    if (chainStarted && entry.prevHash !== prev) {
      return { ok: false, brokenAtIndex: index, legacyEntries: legacy };
    }
    chainStarted = true;
    prev = entry.entryHash;
  }
  return { ok: true, brokenAtIndex: null, legacyEntries: legacy };
}
