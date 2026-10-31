import { StringDecoder } from "node:string_decoder";
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
  private head: Buffer = Buffer.alloc(0);
  private tail: Buffer = Buffer.alloc(0);
  private truncated = false;
  private readonly decoder = new StringDecoder("utf8");
  private emittedBytes = 0;
  private pending = "";
  private total = 0;
  private readonly secrets: readonly string[];
  private readonly carry: number;
  private readonly omission: Buffer;

  constructor(
    private readonly maxBytes: number,
    scrubValues: readonly string[],
    private readonly onText?: (text: string) => void
  ) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("maxBytes must be a nonnegative safe integer");
    this.omission = Buffer.from(maxBytes >= 32 ? "\n[amc: output middle omitted]\n" : maxBytes > 0 ? "\n" : "");
    this.secrets = scrubValues.filter((value) => value.length >= MIN_SCRUBBABLE_LENGTH);
    const longest = this.secrets.reduce((max, value) => Math.max(max, value.length), 0);
    this.carry = longest > 0 ? longest - 1 : 0;
  }

  /** Feed raw bytes. Nothing reaches `onText` before it has been scrubbed. */
  push(chunk: Buffer): void {
    this.total += chunk.byteLength;
    this.pending += this.decoder.write(chunk);
    // Scrub the WHOLE buffer, THEN cut. Cutting first and scrubbing the prefix
    // leaks any secret that straddles the cut -- which is not hypothetical: two
    // secrets of different lengths put the carry boundary inside the second one.
    const scrubbed = this.scrub(this.pending);
    let safeLength = Math.max(0, scrubbed.length - this.carry);
    // JavaScript slices count UTF-16 units; do not emit half a surrogate pair.
    if (safeLength > 0 && /[\uD800-\uDBFF]/.test(scrubbed[safeLength - 1]!)) safeLength--;
    if (safeLength === 0) return;
    this.emit(scrubbed.slice(0, safeLength));
    this.pending = scrubbed.slice(safeLength);
  }

  /** Flush the carry. Must be called once the stream has ended. */
  end(): void {
    this.pending += this.decoder.end();
    if (this.pending.length > 0) {
      this.emit(this.scrub(this.pending));
      this.pending = "";
    }
  }

  private emit(scrubbed: string): void {
    this.onText?.(scrubbed);
    const bytes = Buffer.from(scrubbed, "utf8");
    this.emittedBytes += bytes.length;
    if (!this.truncated && this.head.length + bytes.length <= this.maxBytes) {
      this.head = Buffer.concat([this.head, bytes]);
      return;
    }
    // Preserve the beginning and the real ending of command logs. Only the
    // middle is discarded, after scrubbing; memory stays bounded by the cap.
    const retainedLimit = this.maxBytes - this.omission.length;
    const headLimit = Math.floor(retainedLimit / 2);
    const tailLimit = retainedLimit - headLimit;
    const rolling = Buffer.concat([this.truncated ? this.tail : this.head, bytes]);
    if (!this.truncated) this.head = utf8Head(rolling, headLimit);
    this.tail = utf8Tail(rolling, tailLimit);
    this.truncated = true;
  }

  private scrub(text: string): string {
    let out = text;
    for (const secret of this.secrets) {
      if (out.includes(secret)) out = out.split(secret).join(SCRUB_PLACEHOLDER);
    }
    return out;
  }

  snapshot(): CapturedStream {
    // The preview itself is another join boundary: scrub it as well, so even
    // a secret shaped like head + omission marker + tail cannot be exposed.
    const preview = this.head.toString("utf8") + (this.truncated ? this.omission.toString("utf8") : "") + this.tail.toString("utf8");
    return {
      text: utf8Head(Buffer.from(this.scrub(preview), "utf8"), this.maxBytes).toString("utf8"),
      totalBytes: this.total,
      droppedBytes: this.emittedBytes - this.head.length - this.tail.length
    };
  }
}

/** Retain complete UTF-8 characters at both sides of a byte cap. */
function utf8Head(bytes: Buffer, limit: number): Buffer {
  let end = Math.min(limit, bytes.length);
  while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return Buffer.from(bytes.subarray(0, end));
}

function utf8Tail(bytes: Buffer, limit: number): Buffer {
  let start = Math.max(0, bytes.length - limit);
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return Buffer.from(bytes.subarray(start));
}
