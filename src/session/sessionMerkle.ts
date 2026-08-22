/**
 * RFC-6962-style domain-separated Merkle over a turn's or session's event
 * hashes.
 *
 *   leaf = H(0x00 ‖ event_hash_bytes)
 *   node = H(0x01 ‖ left ‖ right)
 *
 * An odd node is PROMOTED to the next level, never duplicated — duplicating the
 * last leaf is CVE-2012-2459. The linear prevSessionEventHash chain already
 * gives ordering and tamper-evidence, so this root exists solely to hand P2.4 an
 * O(log n)-provable root per turn and per session.
 *
 * Extracted into its own module so SessionService and sessionRecovery share one
 * implementation: a turn seal written by the service and a synthetic seal
 * written by recovery must compute byte-identical roots, and two copies of this
 * function is exactly how that guarantee rots.
 */
import { createHash } from "node:crypto";

const MERKLE_LEAF_PREFIX = Buffer.from([0x00]);
const MERKLE_NODE_PREFIX = Buffer.from([0x01]);

function sha256Bytes(...parts: readonly Buffer[]): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

/** Root of an empty window: H(""). Reached only by a session that sealed no turns. */
export const SESSION_MERKLE_EMPTY = sha256Bytes(Buffer.alloc(0)).toString("hex");

export function merkleRoot(eventHashes: readonly string[]): string {
  if (eventHashes.length === 0) {
    return SESSION_MERKLE_EMPTY;
  }
  let level = eventHashes.map((hex) => sha256Bytes(MERKLE_LEAF_PREFIX, Buffer.from(hex, "hex")));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      next.push(right === undefined ? left : sha256Bytes(MERKLE_NODE_PREFIX, left, right));
    }
    level = next;
  }
  return level[0]!.toString("hex");
}
