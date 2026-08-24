/**
 * The raw streaming protocol every AMC LLM adapter emits.
 *
 * Ported from dsh (`packages/llm/llm/src/types.ts`). Three deliberate
 * differences, each because AMC signs what dsh only logged:
 *
 * 1. BLOCK KINDS ARE `SurfaceKind`, NOT A PARALLEL VOCABULARY. dsh spells them
 *    `text | reasoning | image | tool-call | tool-result`; AMC's signed rows
 *    already spell them `text | thinking | tool_use | tool_result | image`
 *    (src/session/sessionTypes.ts). Rather than write a mapping table between
 *    the two — and risk one mis-mapped kind in a row nobody can rewrite — this
 *    protocol simply USES `SurfaceKind`. There is no mapping to get wrong.
 *
 * 2. THE BLOCK UNION IS CLOSED. dsh's `ContentBlockMap` is declaration-merged
 *    so plugins can add block types. AMC's cannot be: every kind is part of a
 *    signed vocabulary, and adding one is a deliberate change to what evidence
 *    means, not a merge. `ContentBlockMap` is therefore proved total over
 *    `SurfaceKind` at compile time (see `_BlocksCoverEverySurfaceKind`).
 *
 * 3. EVERY FIELD IS `readonly`. A chunk is evidence in flight; the assembler
 *    that folds it and the writer that signs it must be looking at the same
 *    bytes.
 *
 * What is ported unchanged: the seven chunk variants, the `index` correlation
 * model, `block-end` carrying the assembled block so consumers never
 * re-assemble deltas, tool arguments staying raw JSON strings end to end, and
 * the closed-union discipline.
 */
import type { SurfaceKind } from "../session/sessionTypes.js";
import { assertNever } from "./exhaustive.js";
import type { LlmFailure } from "./llmFailure.js";

// Module-private brand: `declare const` means it exists only in the type system,
// and not exporting it means no other module can name the property, so a
// ToolCallId can be produced nowhere but here.
declare const TOOL_CALL_ID_BRAND: unique symbol;

/**
 * A provider-issued tool-call identifier.
 *
 * Branded for the same reason `CredentialRef` is: the convention "this is an
 * id, not a name" becomes a compiler check instead of a reviewer's good day.
 * The id keys signed `tool/call` and `tool/result` rows, so a tool NAME landing
 * in the id position would silently mis-key durable evidence.
 */
export type ToolCallId = string & { readonly [TOOL_CALL_ID_BRAND]: "amc.llm.toolCallId" };

type AssertTrue<T extends true> = T;
type AssertFalse<T extends false> = T;

/**
 * Compile-time proof that the brand is load-bearing. If `ToolCallId` is ever
 * weakened to a bare `string`, this alias stops compiling — otherwise the brand
 * could vanish in a refactor with every call site still building green.
 */
type _RawStringIsNotAToolCallId = AssertFalse<string extends ToolCallId ? true : false>;

/**
 * The sole constructor for a {@link ToolCallId}.
 *
 * Validating rather than casting is the point: this is also the boundary
 * validator for ids arriving from a provider's wire format. An empty id is
 * refused here rather than discovered later as an unjoinable signed row.
 */
export function toolCallId(value: string): ToolCallId {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("tool call id must be a non-empty string");
  }
  return value as ToolCallId;
}

/** Plain text visible to the end user. */
export interface TextContentBlock {
  readonly kind: "text";
  readonly text: string;
}

/** Reasoning content, distinct from visible text. Spelled `thinking` to match `SurfaceKind`. */
export interface ThinkingContentBlock {
  readonly kind: "thinking";
  readonly text: string;
}

/** A tool invocation requested by the model. */
export interface ToolUseContentBlock {
  readonly kind: "tool_use";
  /** Provider-issued call id; correlates with the matching tool result. */
  readonly id: ToolCallId;
  readonly name: string;
  /** Raw JSON string exactly as the model produced it — never re-parsed in transit. */
  readonly arguments: string;
}

/** The result of a tool invocation, as it is sent back to the model. */
export interface ToolResultContentBlock {
  readonly kind: "tool_result";
  readonly toolCallId: ToolCallId;
  readonly content: readonly ContentBlock[];
  readonly isError?: boolean;
}

/**
 * A raster image referenced by content digest.
 *
 * dsh points at an attachment service here. AMC has no such service in this
 * seam yet, and inventing one to fill the slot would be a subsystem with no
 * caller. The digest form is what AMC already uses for durable content
 * (`SurfacePartRef.sha256`), so a later attachment store can be introduced
 * behind this shape without respelling the block.
 */
export interface ImageContentBlock {
  readonly kind: "image";
  /** IANA media type, e.g. `image/png`. */
  readonly mediaType: string;
  /** Digest of the image bytes, which live in the evidence blob store. */
  readonly sha256: string;
}

/** Content blocks keyed by their `SurfaceKind` tag. Closed — see the module note. */
export interface ContentBlockMap {
  readonly text: TextContentBlock;
  readonly thinking: ThinkingContentBlock;
  readonly tool_use: ToolUseContentBlock;
  readonly tool_result: ToolResultContentBlock;
  readonly image: ImageContentBlock;
}

/**
 * Compile-time proof that the block map is exactly the signed surface
 * vocabulary — no kind without a block, no block without a kind. A new
 * `SurfaceKind` that nobody gave a block shape breaks the build here rather
 * than becoming an unrepresentable row at runtime.
 */
type _BlocksCoverEverySurfaceKind = AssertTrue<
  [SurfaceKind] extends [keyof ContentBlockMap]
    ? [keyof ContentBlockMap] extends [SurfaceKind]
      ? true
      : false
    : false
>;

/** Any content block. Switch on `kind` and end with `assertNever`. */
export type ContentBlock = ContentBlockMap[SurfaceKind];

/**
 * Why a model response stopped.
 *
 * `error` and `aborted` carry the failure facts, so an in-band provider error
 * and a thrown one deliver the same {@link LlmFailure} to the same durable
 * writer. Snake_case matches the spellings already in the session vocabulary
 * (`max_steps`, `tool_use`).
 */
export type FinishReason =
  | { readonly kind: "stop" }
  | { readonly kind: "tool_calls" }
  | { readonly kind: "max_tokens" }
  | { readonly kind: "aborted"; readonly failure: LlmFailure }
  | { readonly kind: "error"; readonly failure: LlmFailure };

/** The finish kinds that mean the provider completed the response it intended. */
export type SuccessfulFinishKind = "stop" | "tool_calls" | "max_tokens";

/**
 * True when the response failed rather than completed.
 *
 * One predicate, because three rules turn on this exact question: usage is
 * required only before a successful finish, open blocks are tolerated only at a
 * failed one, and only a failed one carries facts a retry policy can read.
 */
export function isFailedFinish(
  reason: FinishReason
): reason is Extract<FinishReason, { failure: LlmFailure }> {
  return reason.kind === "error" || reason.kind === "aborted";
}

/**
 * Token accounting for one model call.
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only, and cached input
 * is reported separately, so billed input is the sum of the three. Adapters
 * whose providers fold cache hits into one prompt total must subtract them back
 * out. `reasoningTokens` is detail already inside `outputTokens` and must never
 * be added again.
 *
 * The cache fields are OPTIONAL, and that is a decision, not an oversight.
 * Absent means "the provider did not report it", which is not the same fact as
 * zero. `TokenUsage` in the session vocabulary requires `cacheRead`/
 * `cacheWrite`, so the writer that eventually folds one of these into a
 * `step/end` row must decide what an unreported count means and record that
 * decision — it must not quietly sign a fabricated zero. That conversion is
 * deliberately NOT provided here, so nobody can reach for it by accident.
 */
export interface StreamTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly reasoningTokens?: number;
}

/** Billed input tokens: uncached input plus both cache classes. */
export function billedInputTokens(usage: StreamTokenUsage): number {
  return usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}

/**
 * The raw streaming protocol emitted by adapters.
 *
 * A CLOSED discriminated union: every switch over `type` ends with
 * `assertNever`, so adding a variant breaks compilation at every consumer that
 * must handle it — including the one that signs blocks.
 *
 * The grammar these chunks must obey (usage before a successful finish, nothing
 * after finish, deltas only into an open block of their own kind) is enforced
 * unconditionally in streamProtocol.ts; it is not a convention adapters are
 * asked to respect.
 */
export type StreamChunk =
  | { readonly type: "block-start"; readonly index: number; readonly blockKind: SurfaceKind }
  | { readonly type: "text-delta"; readonly index: number; readonly text: string }
  | { readonly type: "thinking-delta"; readonly index: number; readonly text: string }
  | {
      readonly type: "tool-call-delta";
      readonly index: number;
      readonly id: ToolCallId;
      /** Arrives once, usually on the first frame of the call. */
      readonly name?: string;
      readonly argumentsDelta: string;
    }
  | { readonly type: "block-end"; readonly index: number; readonly block: ContentBlock }
  | { readonly type: "usage"; readonly usage: StreamTokenUsage }
  | { readonly type: "finish"; readonly reason: FinishReason };

/** The discriminant tag of {@link StreamChunk}. */
export type StreamChunkType = StreamChunk["type"];

/**
 * The delta kinds that carry model output, and the block kind each one belongs
 * to. One table, so a delta's kind is never decided ad hoc at a call site.
 */
export const DELTA_BLOCK_KIND = Object.freeze({
  "text-delta": "text",
  "thinking-delta": "thinking",
  "tool-call-delta": "tool_use"
} as const);

/**
 * True when a chunk carries content the model actually produced.
 *
 * One shared predicate, so a time-to-first-token measurement and a
 * "did this stream produce anything" check cannot disagree. An empty delta and
 * an empty tool-call frame do NOT count: providers emit both as keepalives, and
 * counting them would report a first token that never arrived.
 */
export function isContentDelta(chunk: StreamChunk): boolean {
  switch (chunk.type) {
    case "text-delta":
    case "thinking-delta":
      return chunk.text.length > 0;
    case "tool-call-delta":
      return chunk.argumentsDelta.length > 0 || (chunk.name ?? "").length > 0;
    case "block-start":
    case "block-end":
    case "usage":
    case "finish":
      return false;
    default:
      // Closed union: a new variant fails to compile here rather than being
      // silently reported as "produced no content".
      return assertNever(chunk, "isContentDelta");
  }
}
