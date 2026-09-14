/**
 * Keep oversized tool output out of model context while committing its full
 * digest. Preparation encrypts in memory with an existing authenticated key;
 * SessionService commits the planned object before persistence. The final
 * tool/result records the actual retention outcome and preview.
 *
 * Storage failure may degrade to an unavailable preview only if ordinary
 * signed event persistence remains available. Commitment/signing failure
 * propagates: it must never be reported as a successfully retained result.
 */
import { sha256Hex } from "../../utils/hash.js";
import { SessionSpillStore } from "./spillStore.js";
import { resolveSpillPolicyConfig, type SpillPolicyConfig, type SpillRef } from "./spillTypes.js";
import { encodeSpilledInputDescriptor, SpilledInputRetentionError, type SpilledInputStage } from "./spillInput.js";

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

  apply(input: SpillInput, commitBeforeRetain: (ref: SpillRef) => void): SpillOutcome {
    if (input.content.byteLength <= this.config.maxInlineBytes) {
      return { spilled: false, content: input.content, ref: null };
    }

    // Measure before preparation; only the callback makes this digest durable.
    const contentSha256 = sha256Hex(input.content);

    let prepared: ReturnType<SessionSpillStore["prepare"]> | null = null;
    let unretrievable: string | null = null;
    try {
      prepared = this.store.prepare(input.nameSeed, input.content);
    } catch (error) {
      unretrievable = `spill preparation unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }

    const head = utf8SafeHead(input.content, this.config.previewHeadBytes);
    const tail = utf8SafeTail(input.content, this.config.previewTailBytes);
    const previewFor = (locator: string | null, reason: string | null): Buffer => Buffer.concat([head, Buffer.from(truncationMarker({
      totalBytes: input.content.byteLength,
      headBytes: head.byteLength,
      tailBytes: tail.byteLength,
      contentSha256,
      locator,
      unretrievable: reason,
      retrievalHint: this.config.retrievalHint
    }), "utf8"), tail]);
    let locator = prepared?.object.locator ?? null;
    let preview = previewFor(locator, unretrievable);
    const refFor = (): SpillRef => ({
      v: 2,
      format: "amc-blob-v1",
      keyVersion: prepared?.object.keyVersion ?? null,
      encodedBytes: prepared?.object.encodedBytes ?? null,
      encodedSha256: prepared?.object.encodedSha256 ?? null,
      locator,
      contentSha256,
      bytes: input.content.byteLength,
      previewBytes: preview.byteLength,
      maxInlineBytes: this.config.maxInlineBytes,
      retrievalHint: this.config.retrievalHint,
      unretrievable
    });

    if (prepared !== null) {
      // Admission failure must escape. No persistent artifact exists until this
      // signed, surface-neutral commitment succeeds. It is an intention, not a
      // claim that materialization completed; the following tool/result says so.
      if (typeof commitBeforeRetain !== "function") throw new Error("spill requires a signed commitment before retention");
      const commitment: unknown = commitBeforeRetain(Object.freeze(refFor()));
      if (commitment !== null && (typeof commitment === "object" || typeof commitment === "function") && "then" in commitment) {
        void Promise.resolve(commitment).catch(() => undefined);
        throw new Error("spill commitment must complete synchronously before retention");
      }
      try {
        prepared.persist();
      } catch (error) {
        locator = null;
        unretrievable = `spill store write failed: ${error instanceof Error ? error.message : String(error)}`;
        preview = previewFor(locator, unretrievable);
      }
    }

    return {
      spilled: true,
      content: preview,
      ref: refFor()
    };
  }

  /**
   * Retain INPUT bytes that cannot become one signed row (a user attachment above
   * the per-event cap; see ./spillInput.ts).
   *
   * Unlike `apply` there is no threshold and no preview: the caller has already
   * decided the bytes must spill, and the payload that replaces them is a canonical
   * descriptor rather than a head/tail cut of binary media. And unlike `apply`
   * nothing degrades: an input whose bytes the store cannot retain is an input the
   * model can never be shown, so every failure is thrown naming its stage. The
   * ordering is the one `apply` enforces — prepare in memory, sign the commitment,
   * only then publish the object — so no unsigned side-channel file ever exists.
   */
  retainInput(
    input: SpillInput,
    context: { readonly what: string; readonly cap: number },
    commitBeforeRetain: (ref: SpillRef) => void
  ): { readonly ref: SpillRef; readonly descriptor: Buffer } {
    const fail = (stage: SpilledInputStage, error: unknown): never => {
      throw new SpilledInputRetentionError(context.what, input.content.byteLength, context.cap, stage,
        error instanceof Error ? error.message : String(error));
    };
    const contentSha256 = sha256Hex(input.content);
    let prepared: ReturnType<SessionSpillStore["prepare"]>;
    try {
      prepared = this.store.prepare(input.nameSeed, input.content);
    } catch (error) {
      return fail("prepare", error);
    }
    const descriptor = encodeSpilledInputDescriptor({ contentSha256, bytes: input.content.byteLength, locator: prepared.object.locator });
    const ref: SpillRef = Object.freeze({
      v: 2,
      format: "amc-blob-v1",
      keyVersion: prepared.object.keyVersion,
      encodedBytes: prepared.object.encodedBytes,
      encodedSha256: prepared.object.encodedSha256,
      locator: prepared.object.locator,
      contentSha256,
      bytes: input.content.byteLength,
      previewBytes: descriptor.byteLength,
      maxInlineBytes: context.cap,
      retrievalHint: this.config.retrievalHint,
      unretrievable: null
    });
    if (typeof commitBeforeRetain !== "function") return fail("commit", new Error("spill requires a signed commitment before retention"));
    try {
      const commitment: unknown = commitBeforeRetain(ref);
      if (commitment !== null && (typeof commitment === "object" || typeof commitment === "function") && "then" in commitment) {
        void Promise.resolve(commitment).catch(() => undefined);
        throw new Error("spill commitment must complete synchronously before retention");
      }
    } catch (error) {
      return fail("commit", error);
    }
    try {
      prepared.persist();
    } catch (error) {
      return fail("persist", error);
    }
    return { ref, descriptor };
  }
}
