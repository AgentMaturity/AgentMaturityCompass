/**
 * The per-turn seal window and the chain of seals over a session.
 *
 * WHY THIS IS ITS OWN MODULE. `SessionService` is the single writer for a
 * session's spine; the bookkeeping that decides WHAT a `turn/seal` row commits
 * to — which event hashes are leaves of the window, which ids bound it, and how
 * this seal links to the previous one — is a separate concern from the typed
 * record methods that produce those events. Keeping it here means the seal's
 * arithmetic can be read (and tested) without reading the whole writer, and it
 * gives `sessionService.ts` room to grow the record methods the agent loop needs
 * without displacing the ratchet baseline. It is composed, not inherited: the
 * service owns one of these and hands it facts, so there is still exactly one
 * object that decides what a seal says.
 *
 * The window deliberately holds only HASHES and IDS the service observed after a
 * durable commit. It never reads the store and never recomputes a root from
 * anything a row claims — verification does that independently, from the stored
 * rows, and the two must be able to disagree for that check to mean anything.
 */
import { merkleRoot, SESSION_MERKLE_EMPTY } from "./sessionMerkle.js";

/**
 * Everything a `turn/seal` row's meta commits to, computed from the events the
 * turn actually committed.
 *
 * Returned as data rather than written here so the service stays the only
 * module that appends, and so the seal's pre-image key order lives beside every
 * other meta shape it builds.
 */
export interface TurnWindowSeal {
  readonly firstEventId: string | null;
  readonly lastEventId: string | null;
  readonly eventCount: number;
  readonly merkleRoot: string;
  readonly prevSealEventId: string | null;
  readonly prevSealMerkleRoot: string;
  readonly sealChainIndex: number;
}

export class TurnWindow {
  // The ordered event hashes and the id bounds of every event in the turn
  // currently in progress, EXCEPT the turn's own seal — a seal cannot be a leaf
  // of the tree it roots.
  private eventHashes: string[] = [];

  private firstEventId: string | null = null;

  private lastEventId: string | null = null;

  // Seal chain: each turn/seal links to the previous, and the ordered seal event
  // hashes form the session root committed in session/close.
  private chainIndex = 0;

  private prevSealEventId: string | null = null;

  private prevSealMerkleRoot: string = SESSION_MERKLE_EMPTY;

  private readonly sealEventHashes: string[] = [];

  /** How many turns have been sealed so far. */
  get sealCount(): number {
    return this.chainIndex;
  }

  /** Begin a fresh window. Any un-sealed leaves from a prior turn are dropped. */
  openTurn(): void {
    this.eventHashes = [];
    this.firstEventId = null;
    this.lastEventId = null;
  }

  /**
   * Record one committed event as a leaf of the open window.
   *
   * Called after the append returned, so the window only ever contains hashes
   * the store actually holds; an append that threw contributes nothing.
   */
  observe(eventId: string, eventHash: string): void {
    if (this.firstEventId === null) {
      this.firstEventId = eventId;
    }
    this.lastEventId = eventId;
    this.eventHashes.push(eventHash);
  }

  /** What the next `turn/seal` row must commit to. Pure: nothing advances here. */
  seal(): TurnWindowSeal {
    return {
      firstEventId: this.firstEventId,
      lastEventId: this.lastEventId,
      eventCount: this.eventHashes.length,
      merkleRoot: merkleRoot(this.eventHashes),
      prevSealEventId: this.prevSealEventId,
      prevSealMerkleRoot: this.prevSealMerkleRoot,
      sealChainIndex: this.chainIndex
    };
  }

  /**
   * Advance the seal chain once the seal row is durable.
   *
   * Split from {@link TurnWindow.seal} so a seal append that throws leaves the
   * chain exactly where it was — the same discipline the service applies to its
   * own per-session head.
   */
  recordSeal(eventId: string, eventHash: string, windowMerkleRoot: string): void {
    this.sealEventHashes.push(eventHash);
    this.prevSealEventId = eventId;
    this.prevSealMerkleRoot = windowMerkleRoot;
    this.chainIndex += 1;
  }

  /** The session root: a Merkle root over every seal, in order. */
  sessionMerkleRoot(): string {
    return merkleRoot(this.sealEventHashes);
  }
}
