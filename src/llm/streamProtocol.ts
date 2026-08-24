/**
 * The stream grammar, enforced.
 *
 * dsh states the ordering rules in prose ("Adapters emit usage before the
 * terminal finish and nothing afterward") and checks them in an OPT-IN
 * diagnostics companion: a composition that does not mount `ctx.invariants`
 * gets no enforcement at all. That is defensible where a malformed stream only
 * corrupts an in-memory message.
 *
 * It is not defensible here. A malformed stream in AMC produces a SIGNED,
 * hash-chained, externally anchored `assistant/block` — durable, tamper-evident
 * garbage. So the grammar moved out of the companion and into the production
 * path: `BlockAssembler` constructs one of these unconditionally and runs it
 * before any chunk is folded. There is no flag, no registration and no
 * injection point that turns it off, because "it was disabled in that
 * composition" is not an answer anyone can give about a signed row.
 *
 * Two rules are AMC's rather than dsh's:
 *
 * - USAGE MUST PRECEDE A SUCCESSFUL FINISH. dsh treats `usage` as at-most-once
 *   but never required, so `BlockAssembler.usage` is legitimately undefined
 *   there. AMC's `step/end` row carries usage, and a step that reports no token
 *   accounting is a governed agent that cannot answer "what did this cost" —
 *   which is one of the questions AMC exists to answer. The carve-out is
 *   deliberate and narrow: a FAILED finish (`error`/`aborted`) does not require
 *   usage, because a 429 has no completion to account for, and demanding usage
 *   there would reclassify every provider failure as an AMC contract violation
 *   and destroy the typed-error path.
 *
 * - TOKEN COUNTS ARE VALIDATED. They arrive from a provider and are heading for
 *   a durable row, so a negative or fractional count fails at this boundary
 *   rather than inside an anchored event.
 */
import type { SurfaceKind } from "../session/sessionTypes.js";
import { assertNever } from "./exhaustive.js";
import {
  DELTA_BLOCK_KIND,
  isFailedFinish,
  type StreamChunk,
  type StreamChunkType,
  type StreamTokenUsage
} from "./streamChunk.js";

/**
 * Every way an adapter can break the stream contract.
 *
 * `AMC_`-prefixed, unlike the provider failure codes in llmFailure.ts, and the
 * prefix carries meaning: these are AMC's own contract violations — a bug in an
 * adapter — not facts about what a provider did. Nothing here is ever eligible
 * for a retry policy, because repeating a request cannot fix code that emits an
 * illegal chunk order.
 *
 * One code per rule, never one code for two rules: a shared code would let a
 * deleted rule stay green under the other rule's test, which is exactly how a
 * check becomes decorative.
 */
export type LlmStreamProtocolCode =
  | "AMC_LLM_STREAM_CHUNK_AFTER_TERMINATION"
  | "AMC_LLM_STREAM_BLOCK_INDEX_INVALID"
  | "AMC_LLM_STREAM_BLOCK_REOPENED"
  | "AMC_LLM_STREAM_DELTA_WITHOUT_BLOCK"
  | "AMC_LLM_STREAM_DELTA_KIND_MISMATCH"
  | "AMC_LLM_STREAM_BLOCK_END_UNOPENED"
  | "AMC_LLM_STREAM_BLOCK_END_KIND_MISMATCH"
  | "AMC_LLM_STREAM_TOOL_CALL_ID_EMPTY"
  | "AMC_LLM_STREAM_TOOL_CALL_ID_CHANGED"
  | "AMC_LLM_STREAM_USAGE_REPEATED"
  | "AMC_LLM_STREAM_USAGE_INVALID"
  | "AMC_LLM_STREAM_USAGE_MISSING"
  | "AMC_LLM_STREAM_OPEN_BLOCK_AT_FINISH"
  | "AMC_LLM_STREAM_NOT_TERMINATED";

/**
 * Thrown when an adapter breaks the stream contract.
 *
 * Deliberately NOT an `LlmError`. An `LlmError` carries provider facts that a
 * retry policy reads; this carries the news that our own adapter is wrong.
 * Keeping them separate classes means a caller distinguishes them with
 * `instanceof` rather than by inspecting a code prefix, and no policy can ever
 * decide to retry a protocol bug.
 */
export class LlmStreamProtocolError extends Error {
  readonly code: LlmStreamProtocolCode;

  /** The chunk that violated the rule; null when the violation is the absence of one. */
  readonly chunkType: StreamChunkType | null;

  /** The block index involved, when the rule is about a block. */
  readonly blockIndex: number | null;

  constructor(
    code: LlmStreamProtocolCode,
    message: string,
    context: { readonly chunkType?: StreamChunkType; readonly blockIndex?: number } = {}
  ) {
    super(message);
    this.name = "LlmStreamProtocolError";
    this.code = code;
    this.chunkType = context.chunkType ?? null;
    this.blockIndex = context.blockIndex ?? null;
  }
}

/** Narrow a caught value to {@link LlmStreamProtocolError}. */
export function isLlmStreamProtocolError(value: unknown): value is LlmStreamProtocolError {
  return value instanceof LlmStreamProtocolError;
}

/** How the stream stopped, from the grammar's point of view. */
export type GrammarTermination = "finish" | "abort";

/**
 * The stream grammar as a state machine over one provider stream.
 *
 * Not reusable across streams and not resettable: a grammar instance is
 * one-to-one with a stream, so leftover state cannot leak between attempts.
 */
export class StreamGrammar {
  /** Block indexes currently open, and the kind each was opened as. */
  private readonly open = new Map<number, SurfaceKind>();

  /**
   * Every index this stream has ever used.
   *
   * dsh only rejects re-opening a block that is still open, which lets an
   * adapter reuse index 0 after closing it. That is harmless when the result is
   * an in-memory message and harmful here: two distinct model blocks would fold
   * into one signed row, and the row would claim the model produced one block
   * where it produced two. Index reuse is therefore rejected outright.
   */
  private readonly seen = new Set<number>();

  /** The call id each tool_use block was pinned to by its first frame. */
  private readonly toolCallIds = new Map<number, string>();

  private usage: StreamTokenUsage | undefined;

  private termination: GrammarTermination | undefined;

  /** True once a terminal finish chunk arrived or the stream was aborted. */
  get terminated(): boolean {
    return this.termination !== undefined;
  }

  /** Number of blocks opened and not yet closed. */
  get openBlockCount(): number {
    return this.open.size;
  }

  /**
   * Validate one chunk against the grammar and advance the state.
   *
   * Throws on the first violation. Nothing is folded, nothing is signed, and
   * the caller's stream is dead: a stream that broke the contract once cannot
   * be trusted to have told the truth about what came before.
   */
  observe(chunk: StreamChunk): void {
    if (this.termination !== undefined) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_CHUNK_AFTER_TERMINATION",
        `stream emitted a ${chunk.type} chunk after it terminated (${this.termination}); ` +
          `nothing may follow the terminal finish`,
        { chunkType: chunk.type }
      );
    }
    switch (chunk.type) {
      case "block-start":
        this.observeBlockStart(chunk.index, chunk.blockKind);
        return;
      case "text-delta":
      case "thinking-delta":
        this.observeDelta(chunk.type, chunk.index);
        return;
      case "tool-call-delta":
        this.observeDelta(chunk.type, chunk.index);
        this.assertToolCallId(chunk.id, chunk.type, chunk.index);
        this.trackToolCallId(chunk.index, chunk.id, chunk.type);
        return;
      case "block-end":
        this.observeBlockEnd(chunk.index, chunk.block.kind);
        if (chunk.block.kind === "tool_use") {
          this.assertToolCallId(chunk.block.id, chunk.type, chunk.index);
          this.trackToolCallId(chunk.index, chunk.block.id, chunk.type);
        }
        return;
      case "usage":
        this.observeUsage(chunk.usage);
        return;
      case "finish":
        this.observeFinish(chunk);
        return;
      default:
        return assertNever(chunk, "StreamGrammar.observe");
    }
  }

  /**
   * Record that the consumer abandoned the stream.
   *
   * Abort is a legitimate termination — it is how cancellation reaches this
   * layer — so it settles the grammar rather than failing it. What it must not
   * do is leave the grammar accepting: a chunk arriving after the consumer
   * stopped listening is output nobody will ever sign.
   */
  abort(): void {
    if (this.termination === undefined) {
      this.termination = "abort";
    }
  }

  /**
   * Assert the stream reached a terminal finish chunk.
   *
   * Called when a consumer claims the stream completed normally. A provider
   * that just stopped sending — a dropped connection read as an ending — must
   * not be recorded as a clean completion.
   */
  assertFinished(): void {
    if (this.termination !== "finish") {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_NOT_TERMINATED",
        "stream ended without a terminal finish chunk"
      );
    }
  }

  private observeBlockStart(index: number, blockKind: SurfaceKind): void {
    this.assertIndex(index, "block-start");
    if (this.seen.has(index)) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_BLOCK_REOPENED",
        `stream reused block index ${index}; each block index may be opened once per stream`,
        { chunkType: "block-start", blockIndex: index }
      );
    }
    this.seen.add(index);
    this.open.set(index, blockKind);
  }

  private observeDelta(chunkType: keyof typeof DELTA_BLOCK_KIND, index: number): void {
    this.assertIndex(index, chunkType);
    const expected: SurfaceKind = DELTA_BLOCK_KIND[chunkType];
    const actual = this.open.get(index);
    if (actual === undefined) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_DELTA_WITHOUT_BLOCK",
        `${chunkType} at index ${index} requires an open ${expected} block; index ${index} is not open`,
        { chunkType, blockIndex: index }
      );
    }
    if (actual !== expected) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_DELTA_KIND_MISMATCH",
        `${chunkType} at index ${index} requires an open ${expected} block, but that index is ${actual}`,
        { chunkType, blockIndex: index }
      );
    }
  }

  private observeBlockEnd(index: number, blockKind: SurfaceKind): void {
    this.assertIndex(index, "block-end");
    const opened = this.open.get(index);
    if (opened === undefined) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_BLOCK_END_UNOPENED",
        `block-end at index ${index} closes a block that is not open`,
        { chunkType: "block-end", blockIndex: index }
      );
    }
    if (opened !== blockKind) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_BLOCK_END_KIND_MISMATCH",
        `block-end at index ${index} closes a ${blockKind} block, but index ${index} was opened as ${opened}`,
        { chunkType: "block-end", blockIndex: index }
      );
    }
    this.open.delete(index);
  }

  private observeUsage(usage: StreamTokenUsage): void {
    if (this.usage !== undefined) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_USAGE_REPEATED",
        "stream emitted usage more than once; token accounting must arrive exactly once",
        { chunkType: "usage" }
      );
    }
    assertUsageCounts(usage);
    this.usage = usage;
  }

  private observeFinish(chunk: Extract<StreamChunk, { type: "finish" }>): void {
    // THE VERIFY-2 RULE. Ordering is enforced by rejecting the finish, not by
    // rejecting a late usage chunk: a usage chunk arriving after finish is
    // already refused by the after-termination rule, so the only way to observe
    // "usage did not precede finish" at the moment it becomes true is here.
    if (this.usage === undefined && !isFailedFinish(chunk.reason)) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_USAGE_MISSING",
        `stream finished with reason "${chunk.reason.kind}" before emitting usage; ` +
          `token accounting must precede a successful finish`,
        { chunkType: "finish" }
      );
    }
    // Open blocks at a failed finish are expected — that is what a stream cut
    // off mid-block looks like — and the assembler records each one's
    // disposition rather than dropping it.
    if (this.open.size > 0 && !isFailedFinish(chunk.reason)) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_OPEN_BLOCK_AT_FINISH",
        `stream finished with reason "${chunk.reason.kind}" while ${this.open.size} block(s) ` +
          `remain open; a successful finish must close every block it opened`,
        { chunkType: "finish" }
      );
    }
    this.termination = "finish";
  }

  private assertIndex(index: number, chunkType: StreamChunkType): void {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_BLOCK_INDEX_INVALID",
        `block index must be a non-negative safe integer, got ${index}`,
        { chunkType }
      );
    }
  }

  /**
   * Pin one block to one call id for the life of the stream.
   *
   * dsh lets every `tool-call-delta` overwrite the id, so a provider that
   * switches ids mid-block folds two calls into one message. Here that would
   * produce a signed `assistant/block` whose arguments belong to one call and
   * whose id belongs to another — an unfixable mis-attribution, and one that
   * would join to the wrong `tool/result` row forever. The `block-end` block's
   * own id is checked against the same pin, so a closing frame cannot rewrite
   * what the deltas established either.
   */
  private trackToolCallId(index: number, id: string, chunkType: StreamChunkType): void {
    const pinned = this.toolCallIds.get(index);
    if (pinned === undefined) {
      this.toolCallIds.set(index, id);
      return;
    }
    if (pinned !== id) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_TOOL_CALL_ID_CHANGED",
        `tool call at index ${index} changed its call id mid-block; one block is one call`,
        { chunkType, blockIndex: index }
      );
    }
  }

  private assertToolCallId(id: string, chunkType: StreamChunkType, index: number): void {
    // The branded constructor already refuses an empty id, but a wire-decoding
    // path can cast instead of minting. This is the boundary where an
    // unjoinable tool/call row would otherwise be created.
    if (id.length === 0) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_TOOL_CALL_ID_EMPTY",
        `tool call at index ${index} carries an empty call id; the id keys the durable tool/call row`,
        { chunkType, blockIndex: index }
      );
    }
  }
}

/** The count fields token accounting may carry, in a fixed order for diagnostics. */
const USAGE_COUNT_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens"
] as const satisfies readonly (keyof StreamTokenUsage)[];

/**
 * Reject token counts that cannot be true.
 *
 * Provider-supplied numbers are validated at every durable boundary in this
 * seam. A fractional or negative count would otherwise be signed into a
 * `step/end` row, where it is permanent and where every cost report downstream
 * would quietly inherit it.
 */
function assertUsageCounts(usage: StreamTokenUsage): void {
  for (const field of USAGE_COUNT_FIELDS) {
    const value = usage[field];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new LlmStreamProtocolError(
        "AMC_LLM_STREAM_USAGE_INVALID",
        `usage.${field} must be a non-negative safe integer, got ${String(value)}`,
        { chunkType: "usage" }
      );
    }
  }
}
