/**
 * One writer at a time, in this process.
 *
 * Stated plainly, because a mechanism nobody can see failing is a mechanism
 * that rots: as the write path stands today, ordering would hold without this
 * class. The critical section is fully synchronous — `withControlFileLock`
 * blocks the thread — so two `set()` calls cannot interleave whether or not
 * they are queued. The queue is here for two reasons that are real now, and one
 * that is not yet.
 *
 * Real now: it defines the tail, and the tail must not carry rejections. A
 * chain built as `tail = result` makes one refused write reject every later
 * one with someone else's error, which turns a single bad call into a store
 * that has stopped accepting writes. That is what the catch-to-undefined below
 * prevents, and it is what `keeps the queue usable after a QUEUED write
 * rejects` pins.
 *
 * Real now: it creates the window the shadow re-check needs. A write that
 * waits is a write whose environment may have changed while it waited, and the
 * queue is what makes waiting a thing that happens at all.
 *
 * Not yet: the moment any step of a write becomes asynchronous — an await on a
 * keychain, on an approval, on a network-backed store — the synchronous
 * accident above stops holding and this becomes the only thing standing
 * between two concurrent writes and a lost update.
 */

/** Runs operations strictly in submission order, one at a time. */
export class SerialWriteQueue {
  /**
   * The chain's tail. Always a settled-or-pending promise that never rejects —
   * a rejected tail would make every later submission reject with someone
   * else's error, so failures are caught here and re-raised only to the caller
   * that owns them.
   */
  private tail: Promise<void> = Promise.resolve();

  /** Number of operations submitted and not yet settled; for diagnostics. */
  private depth = 0;

  get pending(): number {
    return this.depth;
  }

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    this.depth += 1;
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result.finally(() => {
      this.depth -= 1;
    });
  }

  /** Resolves once everything submitted so far has settled. */
  async drain(): Promise<void> {
    await this.tail;
  }
}
