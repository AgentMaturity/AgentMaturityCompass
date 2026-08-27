/**
 * Splitting a byte stream into newline-delimited records (plan P7.1a).
 *
 * WHY NOT `ReadBuffer` FROM `@modelcontextprotocol/sdk`, which this repo already
 * depends on and which does exactly this. Two reasons, both structural rather
 * than stylistic.
 *
 * Its `readMessage()` returns a PARSED OBJECT and never the line's bytes
 * (node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js). Framing and
 * parsing are fused. AMC signs evidence, so it needs the bytes to digest AND the
 * value to act on, and needs to show the two correspond; an API that yields only
 * the second cannot supply that.
 *
 * And its `append()` throws on overflow AFTER calling `this.clear()`, discarding
 * the whole buffer. A caller that catches and continues resumes reading at an
 * arbitrary byte in the middle of a frame, so the next "record" is a suffix of
 * an attacker-chosen one. Overflow here LATCHES instead: the framer is poisoned,
 * every later push returns the same refusal, and no further record is ever
 * produced. Resynchronising a desynced stream is not recovery.
 *
 * WHAT THIS DOES NOT DO. It does not parse, validate, or interpret. It finds
 * newlines and counts bytes. Content rules live in ./wireJson.ts, so that a
 * record's bytes reach the digest before anything has decided what they mean.
 */

/**
 * The largest single record accepted, in bytes.
 *
 * Matches the ingress limit already in force elsewhere -- MAX_OBSERVED_HOOK_BODY_BYTES
 * (../bridge/hookIngress.ts:17) and MAX_CONTROL_HOOK_BODY_BYTES
 * (../bridge/hookControl.ts:38) are both 262_144 -- rather than introducing a
 * second number: an operator who has tuned one boundary should not discover
 * that a different door has a different size.
 */
export const MAX_WIRE_LINE_BYTES = 262_144;

/** One complete record, as it arrived. Bytes, so a digest can commit to them. */
export interface WireLine {
  readonly bytes: Buffer;
  /** 1-based position in the stream, counting blank lines. Errors cite this. */
  readonly ordinal: number;
}

export type WireRefusalCode = "line-too-long" | "stream-poisoned";

export interface WireRefusal {
  readonly code: WireRefusalCode;
  /**
   * Names the ordinal and the limit, never the bytes.
   *
   * Untrusted input is not echoed: it reaches logs, and a record chosen by a
   * peer can carry newlines that forge log lines around it. The ordinal is
   * enough to find the record in a capture, which is what an operator needs.
   */
  readonly reason: string;
  readonly ordinal: number;
}

export interface FramerPush {
  readonly lines: readonly WireLine[];
  /** Non-null means the connection must close. There is no resuming. */
  readonly refusal: WireRefusal | null;
}

export interface FramerEnd {
  /**
   * Bytes left over with no terminating newline, which are DISCARDED.
   *
   * A truncated record is not a short record: it is a record whose remainder
   * never arrived, and acting on its prefix is acting on something no peer sent.
   * Reported out of band so a caller can log the loss rather than infer it from
   * a record count that silently came up one short.
   */
  readonly discardedBytes: number;
}

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

export class NdjsonFramer {
  private pending: Buffer = Buffer.alloc(0);
  private ordinal = 0;
  private poisoned: WireRefusal | null = null;

  /**
   * Feed bytes, take whatever complete records they completed.
   *
   * A record is complete at its newline, so a chunk boundary anywhere -- including
   * mid-character -- is invisible: bytes are only ever decoded in ./wireJson.ts,
   * over a whole record, which is why a multi-byte character split across two
   * TCP reads cannot be corrupted here.
   */
  push(chunk: Buffer): FramerPush {
    if (this.poisoned) return { lines: [], refusal: this.poisoned };

    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);

    const lines: WireLine[] = [];
    for (;;) {
      const at = this.pending.indexOf(NEWLINE);
      if (at === -1) break;

      this.ordinal += 1;
      const raw = this.pending.subarray(0, at);
      this.pending = this.pending.subarray(at + 1);

      // Over-long is decided per RECORD, not per buffer: a peer that sends many
      // valid records in one chunk is not sending one long one.
      if (raw.length > MAX_WIRE_LINE_BYTES) {
        return { lines, refusal: this.poison("line-too-long", raw.length) };
      }
      const bytes = raw.length > 0 && raw[raw.length - 1] === CARRIAGE_RETURN
        ? raw.subarray(0, raw.length - 1)
        : raw;
      // Blank lines are skipped but still counted, so an ordinal in an error is
      // the line an operator will count to in a capture.
      if (bytes.length > 0) lines.push({ bytes, ordinal: this.ordinal });
    }

    // An unterminated remainder that is already over the limit can never become
    // a legal record: every further byte only makes it longer. Refused now
    // rather than after a peer has been allowed to buffer without bound.
    if (this.pending.length > MAX_WIRE_LINE_BYTES) {
      return { lines, refusal: this.poison("line-too-long", this.pending.length) };
    }

    return { lines, refusal: null };
  }

  /** Close the stream, reporting any unterminated tail rather than emitting it. */
  end(): FramerEnd {
    const discardedBytes = this.pending.length;
    this.pending = Buffer.alloc(0);
    return { discardedBytes };
  }

  private poison(code: WireRefusalCode, size: number): WireRefusal {
    this.pending = Buffer.alloc(0);
    this.poisoned = {
      code,
      reason: `record ${this.ordinal} is ${size} bytes, over the ${MAX_WIRE_LINE_BYTES}-byte limit`,
      ordinal: this.ordinal
    };
    return this.poisoned;
  }
}
