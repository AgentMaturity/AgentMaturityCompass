import type { CapturedStream } from "./processTypes.js";

/**
 * A bounded, scrubbing output collector (P4.2).
 *
 * `spawnMonitoredProcess` appended every chunk to the signed ledger with no
 * cap and no redaction, so a process emitting a gigabyte wrote a gigabyte of
 * evidence, and a key echoed by a child landed verbatim in the log AND on the
 * operator's terminal. Both are fixed here rather than at each call site,
 * because a rule enforced per-caller is a rule that has already been forgotten
 * once.
 *
 * SCRUBBING ACROSS CHUNK BOUNDARIES. A secret split over two reads is the
 * normal case, not an edge case: pipes chunk on buffer sizes, not on tokens.
 * The collector holds back the last `carry` bytes — one byte less than the
 * longest secret — and scrubs only what can no longer be extended. Anything
 * shorter than the carry cannot be split across the boundary and still be
 * missed.
 *
 * Only exact values are removed. Pattern-based redaction over attacker-shaped
 * output, per chunk, on the main thread, is a denial-of-service surface as
 * much as a safety feature, and AMC already has three redaction engines that
 * P5.3 owns reconciling. This one does the single thing this path needs.
 */

/** Values below this are not removed: scrubbing "a" would shred every line. */
const MIN_SCRUBBABLE_LENGTH = 8;

export const SCRUB_PLACEHOLDER = "[amc:redacted]";

export class OutputCollector {
  private retained = "";
  private pending = "";
  private total = 0;
  private dropped = 0;
  private readonly secrets: readonly string[];
  private readonly carry: number;

  constructor(
    private readonly maxBytes: number,
    scrubValues: readonly string[],
    private readonly onText?: (text: string) => void
  ) {
    this.secrets = scrubValues.filter((value) => value.length >= MIN_SCRUBBABLE_LENGTH);
    const longest = this.secrets.reduce((max, value) => Math.max(max, value.length), 0);
    this.carry = longest > 0 ? longest - 1 : 0;
  }

  /** Feed raw bytes. Nothing reaches `onText` before it has been scrubbed. */
  push(chunk: Buffer): void {
    this.total += chunk.byteLength;
    this.pending += chunk.toString("utf8");
    // Scrub the WHOLE buffer, THEN cut. Cutting first and scrubbing the prefix
    // leaks any secret that straddles the cut -- which is not hypothetical: two
    // secrets of different lengths put the carry boundary inside the second one.
    const scrubbed = this.scrub(this.pending);
    const safeLength = Math.max(0, scrubbed.length - this.carry);
    if (safeLength === 0) return;
    this.emit(scrubbed.slice(0, safeLength));
    this.pending = scrubbed.slice(safeLength);
  }

  /** Flush the carry. Must be called once the stream has ended. */
  end(): void {
    if (this.pending.length > 0) {
      this.emit(this.scrub(this.pending));
      this.pending = "";
    }
  }

  private emit(scrubbed: string): void {
    this.onText?.(scrubbed);
    const room = this.maxBytes - Buffer.byteLength(this.retained, "utf8");
    if (room <= 0) {
      this.dropped += Buffer.byteLength(scrubbed, "utf8");
      return;
    }
    const bytes = Buffer.byteLength(scrubbed, "utf8");
    if (bytes <= room) {
      this.retained += scrubbed;
      return;
    }
    // Cut on a character boundary, not a byte one, or the tail becomes
    // mojibake that no consumer can quote.
    this.retained += Buffer.from(scrubbed, "utf8").subarray(0, room).toString("utf8");
    this.dropped += bytes - room;
  }

  private scrub(text: string): string {
    let out = text;
    for (const secret of this.secrets) {
      if (out.includes(secret)) out = out.split(secret).join(SCRUB_PLACEHOLDER);
    }
    return out;
  }

  snapshot(): CapturedStream {
    return { text: this.retained, totalBytes: this.total, droppedBytes: this.dropped };
  }
}
