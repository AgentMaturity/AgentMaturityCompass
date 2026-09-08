/**
 * The single canonical fold from raw {@link StreamChunk}s to content blocks.
 *
 * Adapters never reassemble. They translate a provider's wire format into
 * chunks and stop; this class is the only place deltas become blocks, so two
 * adapters cannot disagree about what a stream meant.
 *
 * Ported from dsh's `BlockAssembler` with one structural change, and the change
 * is the whole reason this file is longer than dsh's.
 *
 * dsh DISCARDS. `interruptedBlocks()` silently omits tool calls and
 * whitespace-only text; `blocks()` silently filters every tool call out of a
 * `max-tokens` finish. Both are correct decisions about what is safe to SHOW
 * the model again — and both are invisible afterwards. In AMC that invisibility
 * breaks "model-visible ⟺ logged ⟺ signed" in the direction nobody tests: the
 * model produced a partial tool call, the log shows nothing, and no verifier
 * can tell a stream that produced two blocks from one that produced three.
 *
 * So this assembler DOES NOT DROP ANYTHING. Every block index the stream opened
 * appears in {@link StreamAssembly.blocks} exactly once, in first-seen order,
 * carrying an explicit {@link BlockOutcome} that says what happened to it and
 * why. The keep/drop decision is RECORDED rather than APPLIED. Callers that
 * want dsh's safe prefix — what may be shown to a user or fed back to a model —
 * derive it with {@link surfaceBlocks}, and the derivation is visibly a
 * projection of the record rather than a replacement for it.
 *
 * The corollary invariant, checked by test: every record carries what the model
 * produced, either as an assembled `block` or as a `partial`. `block === null`
 * if and only if `partial !== null`. There is no third state in which content
 * quietly vanishes.
 *
 * Grammar enforcement is not optional here. `push` runs every chunk through a
 * {@link StreamGrammar} the constructor creates and nobody can replace, so a
 * malformed stream throws before a single byte is folded — and therefore long
 * before anything is signed.
 */
import type { SurfaceKind } from "../session/sessionTypes.js";
import { assertNever } from "./exhaustive.js";
import {
  type ContentBlock,
  type FinishReason,
  type StreamChunk,
  type StreamTokenUsage,
  type ToolCallId
} from "./streamChunk.js";
import { StreamGrammar } from "./streamProtocol.js";

/**
 * Why a block was recorded but kept off the conversation surface.
 *
 * Each reason names a decision someone would otherwise have to reconstruct
 * from absence.
 */
export type BlockDropReason =
  /** The stream ended before this tool call was complete, so it was never dispatched. */
  | "tool_call_truncated"
  /**
   * A `max_tokens` finish truncated the response, so every tool call in it is
   * unsafe to execute — a call cut off mid-arguments may mean something other
   * than what it appears to say.
   */
  | "max_tokens_truncated"
  /** An open text or thinking block whose content was empty or whitespace only. */
  | "empty"
  /**
   * An open block of a kind that cannot be built from deltas at all (`image`,
   * `tool_result`). Only a `block-end` can produce one, and none arrived.
   */
  | "unassemblable";

/** What happened to one block by the time the stream settled. */
export type BlockOutcome =
  /** Closed by a `block-end` chunk: the adapter says this block is whole. */
  | { readonly status: "completed" }
  /**
   * Open when the stream stopped, with content worth keeping. The block carries
   * what arrived; it is explicitly NOT whole, and a durable writer should record
   * that alongside it rather than presenting it as a finished block.
   */
  | { readonly status: "truncated" }
  /** Recorded, but deliberately kept off the surface. */
  | { readonly status: "dropped"; readonly reason: BlockDropReason };

/**
 * The raw accumulations of a block that could not be assembled.
 *
 * Present exactly when `block` is null, so nothing the model produced is lost
 * even when it cannot be expressed as a content block.
 */
export interface PartialBlockContent {
  readonly text: string;
  readonly toolName: string | null;
  readonly providerWireName?: string;
  readonly toolArguments: string;
}

/** One block of a stream, with its outcome. Every opened index produces one. */
export interface AssembledBlock {
  /** The index the adapter used to correlate this block's chunks. */
  readonly index: number;
  /**
   * First-seen position, 0-based and contiguous.
   *
   * This — not `index` — is what a durable `assistant/block` row should use as
   * its `blockIndex`, because adapter indexes are only required to be distinct,
   * not dense, while the signed sequence must be both.
   */
  readonly ordinal: number;
  readonly blockKind: SurfaceKind;
  /** True when a `block-end` chunk closed this block. */
  readonly closed: boolean;
  readonly outcome: BlockOutcome;
  /** The assembled block, or null when the kind cannot be assembled from deltas. */
  readonly block: ContentBlock | null;
  /** Raw accumulations; non-null exactly when `block` is null. */
  readonly partial: PartialBlockContent | null;
}

/** How the stream stopped. */
export type StreamTermination = "finish" | "abort";

/**
 * The complete, frozen record of one provider stream.
 *
 * This is the shape a durable writer signs from. `blocks` is authoritative and
 * total; anything narrower is a projection of it.
 */
export interface StreamAssembly {
  readonly termination: StreamTermination;
  /** The terminal finish reason; null when the consumer aborted before one arrived. */
  readonly finishReason: FinishReason | null;
  /** Why the consumer abandoned the stream; null unless `termination` is `"abort"`. */
  readonly abortCause: string | null;
  /**
   * Token accounting, or null when the provider reported none.
   *
   * Null is only reachable on a failed finish or an abort: the grammar refuses
   * a successful finish that was not preceded by usage.
   */
  readonly usage: StreamTokenUsage | null;
  /** Every opened block, in first-seen order. Nothing is filtered out. */
  readonly blocks: readonly AssembledBlock[];
}

/**
 * Mutable fold state for one block.
 *
 * Deliberately mutable, against this repository's default: an incremental fold
 * over a token stream is what an accumulator is for, and rebuilding a record
 * per delta would make a long completion quadratic. The immutability guarantee
 * is kept where it is observable — this type is module-private, never escapes,
 * and every value handed out by {@link BlockAssembler} is frozen.
 */
interface PartialBlockState {
  readonly index: number;
  readonly ordinal: number;
  readonly blockKind: SurfaceKind;
  text: string;
  toolCallId: ToolCallId | null;
  toolName: string | null;
  providerWireName?: string;
  toolArguments: string;
  closedBlock: ContentBlock | null;
}

/**
 * Incrementally folds one provider stream into blocks, usage and a finish
 * reason. One instance per stream; not reusable and not resettable, so state
 * cannot leak between attempts.
 */
export class BlockAssembler {
  /**
   * Created here and never injected. The grammar is not a policy the caller
   * chooses — it is the reason a signed block can be trusted to describe a
   * stream that actually happened.
   */
  private readonly grammar = new StreamGrammar();

  private readonly partials = new Map<number, PartialBlockState>();

  private readonly order: number[] = [];

  private usageValue: StreamTokenUsage | null = null;

  private finishValue: FinishReason | null = null;

  /**
   * Feed one chunk, in stream order.
   *
   * Validates before folding. A grammar violation throws an
   * `LlmStreamProtocolError` and leaves this assembler terminated, because a
   * stream that broke the contract once cannot be trusted about what came
   * before it.
   */
  push(chunk: StreamChunk): void {
    this.grammar.observe(chunk);
    switch (chunk.type) {
      case "block-start": {
        const ordinal = this.order.length;
        this.order.push(chunk.index);
        this.partials.set(chunk.index, {
          index: chunk.index,
          ordinal,
          blockKind: chunk.blockKind,
          text: "",
          toolCallId: null,
          toolName: null,
          toolArguments: "",
          closedBlock: null
        });
        return;
      }
      case "text-delta":
      case "thinking-delta": {
        // The grammar has already proved an open block of the matching kind
        // exists at this index, so there is no straggler case to tolerate:
        // dsh's "ignore deltas after block-end" branch is unreachable here
        // because the grammar rejects those deltas outright.
        this.mustGet(chunk.index).text += chunk.text;
        return;
      }
      case "tool-call-delta": {
        const partial = this.mustGet(chunk.index);
        partial.toolCallId = chunk.id;
        // A provider sends the tool name once, usually on the first frame;
        // later frames carry an empty name that must not erase it.
        if (chunk.name !== undefined && chunk.name.length > 0) partial.toolName = chunk.name;
        if (chunk.providerWireName !== undefined) partial.providerWireName = chunk.providerWireName;
        partial.toolArguments += chunk.argumentsDelta;
        return;
      }
      case "block-end": {
        this.mustGet(chunk.index).closedBlock = chunk.block;
        return;
      }
      case "usage": {
        this.usageValue = chunk.usage;
        return;
      }
      case "finish": {
        this.finishValue = chunk.reason;
        return;
      }
      default:
        return assertNever(chunk, "BlockAssembler.push");
    }
  }

  /** Token accounting seen so far, or null when none has arrived. */
  get usage(): StreamTokenUsage | null {
    return this.usageValue;
  }

  /**
   * The terminal finish reason, or null when none has arrived.
   *
   * Deliberately NOT defaulted to `{kind: "stop"}` the way dsh defaults it. A
   * stream that never said why it stopped did not stop successfully, and
   * inventing a clean stop is how a dropped connection becomes a signed claim
   * that the model finished.
   */
  get finishReason(): FinishReason | null {
    return this.finishValue;
  }

  /**
   * Settle a stream that reached its terminal finish chunk.
   *
   * Throws `AMC_LLM_STREAM_NOT_TERMINATED` when no finish chunk arrived — a
   * provider that simply stopped sending must be aborted, not completed.
   */
  complete(): StreamAssembly {
    this.grammar.assertFinished();
    return this.settle("finish", null);
  }

  /**
   * Settle a stream the consumer abandoned — cancellation, timeout, or a crash
   * on the consuming side.
   *
   * The partial state is preserved in full: every open block appears in the
   * result with an outcome saying it was truncated or why it was dropped. This
   * is P2.2's crash-recovery rule one level down. An interrupted turn is
   * recorded as interrupted rather than as a shorter successful one, and an
   * interrupted BLOCK gets the same treatment for the same reason.
   *
   * @param cause short machine-stable reason, recorded on the assembly.
   */
  abort(cause: string): StreamAssembly {
    if (typeof cause !== "string" || cause.length === 0) {
      throw new Error("BlockAssembler.abort requires a non-empty cause");
    }
    this.grammar.abort();
    return this.settle("abort", cause);
  }

  private settle(termination: StreamTermination, abortCause: string | null): StreamAssembly {
    const blocks = this.order.map((index) => this.resolve(this.mustGet(index)));
    return Object.freeze({
      termination,
      finishReason: this.finishValue,
      abortCause,
      usage: this.usageValue,
      blocks: Object.freeze(blocks)
    });
  }

  /** Decide one block's assembled value and outcome. */
  private resolve(partial: PartialBlockState): AssembledBlock {
    const closed = partial.closedBlock !== null;
    const block = partial.closedBlock ?? assembleOpen(partial);
    const outcome = resolveOutcome(partial, closed, this.finishValue);
    return Object.freeze({
      index: partial.index,
      ordinal: partial.ordinal,
      blockKind: partial.blockKind,
      closed,
      outcome,
      block,
      // The invariant that makes "nothing is silently dropped" checkable:
      // content the assembler could not express as a block is still carried,
      // so `block === null` is never an absence of information.
      partial:
        block === null
          ? Object.freeze({
              text: partial.text,
              toolName: partial.toolName,
              ...(partial.providerWireName === undefined ? {} : { providerWireName: partial.providerWireName }),
              toolArguments: partial.toolArguments
            })
          : null
    });
  }

  /** Invariant accessor: every index in `order` has a partial. */
  private mustGet(index: number): PartialBlockState {
    const partial = this.partials.get(index);
    if (partial === undefined) {
      throw new Error(`BlockAssembler invariant violated: no partial for block index ${index}`);
    }
    return partial;
  }
}

/**
 * Assemble a block that never received a `block-end`.
 *
 * A tool call with no provider id returns null rather than synthesizing one.
 * dsh fabricates `call-${index}`, which is harmless when the result is an
 * in-memory message and a small lie once it is signed: the id keys durable
 * `tool/call` rows, and "call-0" is unique to neither a step nor a session. The
 * partial arguments are preserved on the record either way, so refusing to
 * invent an id costs no information.
 */
function assembleOpen(partial: PartialBlockState): ContentBlock | null {
  switch (partial.blockKind) {
    case "text":
      return { kind: "text", text: partial.text };
    case "thinking":
      return { kind: "thinking", text: partial.text };
    case "tool_use":
      return partial.toolCallId === null
        ? null
        : {
            kind: "tool_use",
            id: partial.toolCallId,
            name: partial.toolName ?? "",
            ...(partial.providerWireName === undefined ? {} : { providerWireName: partial.providerWireName }),
            arguments: partial.toolArguments
          };
    case "tool_result":
    case "image":
      // No delta variant can build one; only a `block-end` carries these.
      return null;
    default:
      return assertNever(partial.blockKind, "assembleOpen");
  }
}

/** The one keep/drop decision, taken once and recorded rather than applied. */
function resolveOutcome(
  partial: PartialBlockState,
  closed: boolean,
  finishReason: FinishReason | null
): BlockOutcome {
  // A truncated response's tool calls are unsafe to execute whether or not the
  // adapter managed to close them, so this decision comes before `closed`.
  if (partial.blockKind === "tool_use" && finishReason?.kind === "max_tokens") {
    return { status: "dropped", reason: "max_tokens_truncated" };
  }
  if (closed) return { status: "completed" };
  switch (partial.blockKind) {
    case "text":
    case "thinking":
      // Whitespace-only output is dropped from the surface for the reason dsh
      // drops it — re-feeding it teaches the model nothing — but it is still
      // recorded, so "the model emitted an empty block" stays a fact anyone can
      // read off the log.
      return partial.text.trim() === ""
        ? { status: "dropped", reason: "empty" }
        : { status: "truncated" };
    case "tool_use":
      // Interruption precedes dispatch: keeping the call would require
      // fabricating a result for something that never ran.
      return { status: "dropped", reason: "tool_call_truncated" };
    case "tool_result":
    case "image":
      // Unreachable through a closed block (handled above) and unassemblable
      // through an open one, so the reason is never in doubt.
      return { status: "dropped", reason: "unassemblable" };
    default:
      return assertNever(partial.blockKind, "resolveOutcome");
  }
}

/**
 * The conversation surface of an assembly: what may be shown to a user or fed
 * back to a model.
 *
 * A PROJECTION of {@link StreamAssembly.blocks}, never a substitute for it.
 * Truncated blocks are included because their content is real; dropped blocks
 * are not, because that is what dropping means. A durable writer should record
 * `assembly.blocks`, then use this to decide what the next request carries.
 */
export function surfaceBlocks(assembly: StreamAssembly): readonly ContentBlock[] {
  const surface: ContentBlock[] = [];
  for (const record of assembly.blocks) {
    if (record.outcome.status === "dropped") continue;
    if (record.block === null) continue;
    surface.push(record.block);
  }
  return Object.freeze(surface);
}

/** The blocks an assembly recorded but kept off the surface, with their reasons. */
export function droppedBlocks(assembly: StreamAssembly): readonly AssembledBlock[] {
  return Object.freeze(assembly.blocks.filter((record) => record.outcome.status === "dropped"));
}
