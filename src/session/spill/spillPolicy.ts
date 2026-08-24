/**
 * The spill policy: the thing that DECIDES.
 *
 * Before this module `SpilledRef` was a type on `ToolResultInput` — the caller
 * declared what it had spilled and the log wrote that declaration down. Nothing
 * checked it, nothing produced it, and a caller that lied produced a signed row
 * asserting a locator and a length that had never existed. The decision now has
 * an owner: `apply()` measures the result, spills it if it is over the
 * threshold, and mints the ref from the bytes it actually wrote. The ref is
 * therefore a description of what happened rather than a claim about it.
 *
 * This runs at post-execute — after the tool produced its output, before that
 * output becomes model-visible. `SessionService.recordToolResult` is that point
 * today, and it applies this policy itself rather than accepting a ref, which is
 * what makes the guarantee structural. When P4.1 builds the real post-execute
 * waterfall the policy object moves into it unchanged; what must not move is the
 * rule that whoever records the result is whoever ran the policy.
 *
 * Failure posture, stated because it is a judgement call and not an obvious one:
 * a spill-store failure must NOT turn a successful tool call into an error (the
 * tool did its job), and must NOT silently fall back to recording the whole
 * output inline (that is how a 200 MB `grep` result reaches the ledger's blob
 * cap and takes the entire event down with it, losing the outcome as well as the
 * output). So it degrades: the model gets the same truncated preview, marked as
 * unretrievable with the reason, and the event still commits to the SHA-256 of
 * the full bytes. The output is lost; what it WAS remains provable, and the
 * failure is on the record instead of laundered.
 */
import { sha256Hex } from "../../utils/hash.js";
import { SessionSpillStore } from "./spillStore.js";
import { resolveSpillPolicyConfig, type SpillPolicyConfig, type SpillRef } from "./spillTypes.js";

export interface SpillInput {
  /** Used only to make the object filename legible; never trusted as a path. */
  readonly nameSeed: string;
  readonly content: Buffer;
}

/**
 * What the policy decided.
 *
 * `content` is ALWAYS the bytes that become the event payload and therefore the
 * bytes the model reads — identical to the input when nothing spilled, the
 * preview when something did. Returning it (rather than a flag the caller must
 * act on) is what stops a caller from spilling and then recording the original
 * anyway.
 */
export type SpillOutcome =
  | { readonly spilled: false; readonly content: Buffer; readonly ref: null }
  | { readonly spilled: true; readonly content: Buffer; readonly ref: SpillRef };

/**
 * Cut a UTF-8 buffer at `limit` bytes without splitting a character.
 *
 * Tool output is usually text, and a naive `subarray` mid-sequence produces
 * replacement characters in the model's context — noise that reads like data
 * corruption. Walk back over continuation bytes (`10xxxxxx`), then over the
 * lead byte whose sequence the cut just orphaned. On binary input this shifts
 * the boundary by at most three bytes, which the preview does not care about.
 */
function utf8SafeHead(bytes: Buffer, limit: number): Buffer {
  if (bytes.byteLength <= limit) {
    return bytes;
  }
  let end = limit;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
    end -= 1;
  }
  if (end > 0 && ((bytes[end - 1] ?? 0) & 0xc0) === 0xc0) {
    end -= 1;
  }
  return bytes.subarray(0, end);
}

/** The mirror image: skip leading continuation bytes so the tail starts clean. */
function utf8SafeTail(bytes: Buffer, limit: number): Buffer {
  if (bytes.byteLength <= limit) {
    return bytes;
  }
  let start = bytes.byteLength - limit;
  while (start < bytes.byteLength && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
    start += 1;
  }
  return bytes.subarray(start);
}

/**
 * The marker the model reads in place of the omitted middle.
 *
 * It names the locator and the committed hash on purpose: a model (or a human
 * reading the transcript) can then ask for the full bytes by locator and check
 * for itself that what comes back is what the event committed to. A truncation
 * notice that does not say how to undo the truncation is how tool output
 * quietly becomes lossy.
 */
function truncationMarker(params: {
  readonly totalBytes: number;
  readonly headBytes: number;
  readonly tailBytes: number;
  readonly contentSha256: string;
  readonly locator: string | null;
  readonly unretrievable: string | null;
  readonly retrievalHint: string;
}): string {
  const shown = `showing the first ${params.headBytes} and last ${params.tailBytes} bytes`;
  const provenance =
    params.locator === null
      ? `full output NOT retained (${params.unretrievable ?? "unknown reason"})`
      : `${params.retrievalHint}; locator=${params.locator}`;
  return (
    `\n[amc-spill] output truncated: ${params.totalBytes} bytes total, ${shown}.\n` +
    `[amc-spill] sha256=${params.contentSha256} is committed in this signed event.\n` +
    `[amc-spill] ${provenance}\n`
  );
}

export class SessionSpillPolicy {
  readonly config: SpillPolicyConfig;
  private readonly store: SessionSpillStore;

  constructor(store: SessionSpillStore, overrides: Partial<SpillPolicyConfig> = {}) {
    this.store = store;
    this.config = resolveSpillPolicyConfig(overrides);
  }

  apply(input: SpillInput): SpillOutcome {
    if (input.content.byteLength <= this.config.maxInlineBytes) {
      return { spilled: false, content: input.content, ref: null };
    }

    // Hash BEFORE attempting the write, so the commitment exists whether or not
    // the store cooperates. This ordering is the whole of the degraded path.
    const contentSha256 = sha256Hex(input.content);

    let locator: string | null = null;
    let unretrievable: string | null = null;
    try {
      locator = this.store.write(input.nameSeed, input.content).locator;
    } catch (error) {
      unretrievable = `spill store write failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const head = utf8SafeHead(input.content, this.config.previewHeadBytes);
    const tail = utf8SafeTail(input.content, this.config.previewTailBytes);
    const marker = truncationMarker({
      totalBytes: input.content.byteLength,
      headBytes: head.byteLength,
      tailBytes: tail.byteLength,
      contentSha256,
      locator,
      unretrievable,
      retrievalHint: this.config.retrievalHint
    });
    const preview = Buffer.concat([head, Buffer.from(marker, "utf8"), tail]);

    return {
      spilled: true,
      content: preview,
      ref: {
        v: 1,
        locator,
        contentSha256,
        bytes: input.content.byteLength,
        previewBytes: preview.byteLength,
        maxInlineBytes: this.config.maxInlineBytes,
        retrievalHint: this.config.retrievalHint,
        unretrievable
      }
    };
  }
}
