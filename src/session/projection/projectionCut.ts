/**
 * Cut digests: the cache's proof that a cached value still describes the log.
 *
 * WHY A DIGEST AND NOT JUST THE HEAD HASH. The obvious O(1) check is "the event
 * at index count-1 still has the hash it had". It is unsound here, twice over.
 * First, `readSessionEvents` returns a FILTERED subsequence of the global chain,
 * so adjacent returned rows are not chain-linked and a head hash commits to
 * nothing about its predecessors in that subsequence. Second, even on the full
 * chain the head-hash check accepts a log whose MIDDLE was rewritten while its
 * tail was left alone — the cached value would then be extended with new events
 * on top of a prefix that no longer exists. That is not "stale", it is wrong,
 * and it is the exact failure the stale-but-never-wrong property forbids.
 *
 * So the cut binds every event in it. That makes validation O(count) rather than
 * O(1) — one sha256 pass over `count` fixed-width hashes — which is only worth
 * paying because it is far cheaper than the fold it replaces (a `JSON.parse` of
 * every row's `meta_json` plus the state allocations). Measured on a 5,000-event
 * surface log: cold fold 13.0ms, warm evaluate 0.83ms of which 0.77ms is this
 * digest — a 15.7x saving, and validation is what the warm path spends its time
 * on. The cache pays for itself by a wide margin while being sound rather than
 * nearly sound.
 *
 * WHAT THE DIGEST TRUSTS. It covers each row's `event_hash` — the identity the
 * ledger, the turn seals and the transparency anchors all already treat as the
 * row's content digest. A row whose stored `event_hash` does not commit to its
 * own contents is a tampered row, and rejecting it is `verifyStoredSessionEvents`'
 * job, not a cache's: re-deriving every row's hash on every projection read
 * would cost as much as the fold and duplicate a check the verifier already
 * performs. Stated plainly rather than left implicit — the guarantee is "never
 * wrong for any log whose rows are self-consistent", which is the same premise
 * every other consumer of the chain is built on.
 */
import { createHash } from "node:crypto";
import type { EvidenceEvent } from "../../types.js";
import type { ProjectionCut } from "./projectionTypes.js";

// Domain separation, so a cut digest can never be confused with an event hash,
// a Merkle node, or a seal digest even if one is pasted into the other's field.
const PREFIX_DIGEST_DOMAIN = "amc/session/projection-cut/v1";

/**
 * Rolling digest over the first `count` events' `event_hash` values, in order.
 *
 * Order-sensitive by construction: swapping two events changes the digest even
 * though the multiset of hashes is unchanged. The `\n` separator keeps the
 * concatenation injective for any hash encoding that cannot contain a newline
 * (lowercase hex cannot), so a short hash followed by a long one can never
 * collide with a different split of the same bytes.
 */
export function prefixDigestAt(events: readonly EvidenceEvent[], count: number): string {
  if (count > events.length) {
    // Deliberately a throw, not a clamp. Clamping would silently digest a
    // SHORTER prefix than the caller asked for, and a shorter prefix's digest
    // could then be compared against a longer cut's — turning "the log was
    // truncated" into a question about hash collisions instead of an answer.
    // Callers check the length first; this makes forgetting to loud.
    throw new Error(`projection cut digest: asked for ${count} of ${events.length} events`);
  }
  const bounded = Math.max(0, count);
  const hash = createHash("sha256").update(PREFIX_DIGEST_DOMAIN);
  for (let index = 0; index < bounded; index += 1) {
    const event = events[index];
    if (event === undefined) {
      // Unreachable given the bound, but a sparse array must not be allowed to
      // hash as a shorter prefix — that would silently validate a cache against
      // a log it was never folded over.
      throw new Error(`projection cut digest: no event at index ${index}`);
    }
    hash.update("\n").update(event.event_hash);
  }
  return hash.digest("hex");
}

/** Digest of the empty prefix — the cut every cold fold starts from. */
export const PROJECTION_EMPTY_DIGEST: string = prefixDigestAt([], 0);

export const PROJECTION_EMPTY_CUT: ProjectionCut = Object.freeze({
  count: 0,
  prefixDigest: PROJECTION_EMPTY_DIGEST,
  headEventHash: null
});

/** Build the cut naming the first `count` events, given their already-computed digest. */
export function cutAt(
  events: readonly EvidenceEvent[],
  count: number,
  prefixDigest: string
): ProjectionCut {
  if (count <= 0) {
    return PROJECTION_EMPTY_CUT;
  }
  return {
    count,
    prefixDigest,
    headEventHash: events[count - 1]?.event_hash ?? null
  };
}
