/**
 * Splitting a byte stream into newline-delimited records (plan P7.1a).
 *
 * WHY NOT `ReadBuffer` FROM `@modelcontextprotocol/sdk`, already a dependency
 * and already doing this. Two structural reasons.
 *
 * Its `readMessage()` returns a PARSED OBJECT and never the line's bytes
 * (node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js), so framing
 * and parsing are fused. AMC signs evidence: it needs the bytes to digest AND
 * the value to act on, plus proof the two correspond. An API that yields only
 * the second cannot supply that.
 *
 * And its `append()` throws on overflow AFTER calling `this.clear()`, discarding
 * the buffer. A caller that catches and continues resumes at an arbitrary byte
 * inside a frame, so the next "record" is a suffix of an attacker-chosen one.
 * Overflow here LATCHES: the framer keeps returning the original refusal and no
 * further record is ever produced. Resynchronising a desynced stream is not
 * recovery.
 *
 * EMITTED BYTES ARE COPIES, NEVER VIEWS. `subarray` returns a window onto the
 * caller's chunk, and Node pools and reuses socket buffers -- so a record
 * emitted as a view can change after it was emitted, taking its digest's meaning
 * with it. Verified: a record read as `{"amount":1}` became `{"amount":9}` when
 * the caller rewrote the chunk behind it. Copying also bounds retention, since a
 * one-record view otherwise pins the whole chunk it came from.
 *
 * WHAT THIS DOES NOT DO. It does not parse, validate, or interpret. It finds
 * newlines and counts bytes. Content rules live in ./wireJson.ts, so that a
 * record's bytes reach a digest before anything has decided what they mean.
 */

/**
 * The largest single record accepted, in bytes.
 *
 * Matches the ingress limit already in force elsewhere -- MAX_OBSERVED_HOOK_BODY_BYTES
 * (../bridge/hookIngress.ts:17) and MAX_CONTROL_HOOK_BODY_BYTES
 * (../bridge/hookControl.ts:38) are both 262_144 -- rather than introducing a
 * second number: an operator who has tuned one boundary should not discover that
 * a different door has a different size.
 *
 * Measured against the record's own bytes, AFTER any terminator is removed, so a
 * peer sending CRLF gets the same allowance as one sending LF rather than one
 * byte less.
 */
export const MAX_WIRE_LINE_BYTES = 262_144;

/** One complete record, as it arrived. Bytes, so a digest can commit to them. */
export interface WireLine {
  /** A copy. Safe to hold, digest, and outlive the chunk it came from. */
  readonly bytes: Buffer;
  /** 1-based position in the stream, counting blank lines. Errors cite this. */
  readonly ordinal: number;
}

export type WireRefusalCode = "line-too-long";

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
  /**
   * The offending record's own position -- including when it is still
   * incomplete, in which case it is the record now being read rather than the
   * last one that finished.
   */
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
  /**
   * Unconsumed chunks, concatenated only when a record actually completes.
   *
   * Joining on every push made byte-at-a-time input quadratic: each byte
   * recopied everything before it. Because every push drains all complete
   * records, what is retained here never contains a newline -- so a newline can
   * only be in the chunk just pushed, and the check for one is a single scan of
   * that chunk.
   */
  private chunks: Buffer[] = [];
  private pendingLength = 0;
  private ordinal = 0;
  private poisoned: WireRefusal | null = null;

  /**
   * Feed bytes, take whatever complete records they completed.
   *
   * A record is complete at its newline, so a chunk boundary anywhere --
   * including mid-character -- is invisible: bytes are only ever decoded in
   * ./wireJson.ts, over a whole record. That is why a multi-byte character split
   * across two reads cannot be corrupted here, and why the same stream framed in
   * one chunk or in single bytes yields identical records.
   */
  push(chunk: Buffer): FramerPush {
    if (this.poisoned) return { lines: [], refusal: this.poisoned };

    this.chunks.push(chunk);
    this.pendingLength += chunk.length;

    if (chunk.indexOf(NEWLINE) === -1) {
      // Nothing completed. An unterminated remainder already over the limit can
      // never become a legal record -- every further byte only makes it longer
      // -- so it is refused now rather than after a peer has been allowed to
      // buffer without bound. The ordinal is the record being read, not the last
      // one that finished, which would blame a record that was already accepted.
      return this.pendingLength > MAX_WIRE_LINE_BYTES
        ? { lines: [], refusal: this.poison(this.ordinal + 1, this.pendingLength) }
        : { lines: [], refusal: null };
    }

    let pending = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks);
    const lines: WireLine[] = [];

    for (;;) {
      const at = pending.indexOf(NEWLINE);
      if (at === -1) break;

      this.ordinal += 1;
      const raw = pending.subarray(0, at);
      pending = pending.subarray(at + 1);

      // The terminator is removed BEFORE the size test, so CRLF and LF peers get
      // the same allowance.
      const body = raw.length > 0 && raw[raw.length - 1] === CARRIAGE_RETURN
        ? raw.subarray(0, raw.length - 1)
        : raw;

      if (body.length > MAX_WIRE_LINE_BYTES) {
        this.retain(pending);
        return { lines, refusal: this.poison(this.ordinal, body.length) };
      }
      // Blank lines are skipped but still counted, so an ordinal in an error is
      // the line an operator will count to in a capture.
      // Copied, not viewed: see the note at the top of this file.
      if (body.length > 0) lines.push({ bytes: Buffer.from(body), ordinal: this.ordinal });
    }

    this.retain(pending);
    if (this.pendingLength > MAX_WIRE_LINE_BYTES) {
      return { lines, refusal: this.poison(this.ordinal + 1, this.pendingLength) };
    }
    return { lines, refusal: null };
  }

  /** Close the stream, reporting any unterminated tail rather than emitting it. */
  end(): FramerEnd {
    const discardedBytes = this.pendingLength;
    this.retain(Buffer.alloc(0));
    return { discardedBytes };
  }

  private retain(pending: Buffer): void {
    this.chunks = pending.length === 0 ? [] : [Buffer.from(pending)];
    this.pendingLength = pending.length;
  }

  private poison(ordinal: number, size: number): WireRefusal {
    this.retain(Buffer.alloc(0));
    this.poisoned = {
      code: "line-too-long",
      reason: `record ${ordinal} is ${size} bytes, over the ${MAX_WIRE_LINE_BYTES}-byte limit`,
      ordinal
    };
    return this.poisoned;
  }
}
