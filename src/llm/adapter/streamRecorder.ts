/**
 * The durable half of a dispatch: what the model produced, and how it ended.
 *
 * WHY THIS EXISTS AT ALL. A `ctx.llm.stream()` call that handed chunks to a
 * consumer and wrote nothing would be an unsigned side channel — model output
 * that reached a caller and never reached the log. AMC's whole claim is that a
 * governed run is reconstructable, and a request whose response lives only in
 * the caller's memory breaks it at the first hop. So the seam that dispatches is
 * also the seam that records, and there is no path through it that does one
 * without the other.
 *
 * WHY RECORDING HAPPENS AT SETTLE AND NOT PER `block-end`. Because the keep/drop
 * decision is not knowable until the stream terminates: a `max_tokens` finish
 * retroactively drops every tool call in the response, since a call cut off
 * mid-arguments may mean something other than what it appears to say. Writing a
 * `tool/call` row when the block closed would produce a signed, dispatchable row
 * for a call AMC then decided not to dispatch. Deferring costs the un-recorded
 * tail of an in-flight stream on a crash — which is exactly the crash-loss bound
 * P2.2 already documents at the step boundary, so it introduces no new exposure.
 *
 * WHICH ROW A BLOCK BECOMES. Text and thinking become `assistant/block`. A tool
 * call becomes `tool/call`, because that is the row AMC's surface projection and
 * its request derivation already read a tool_use part out of — its meta carries
 * the call id and tool name, and `assistant/block` has nowhere to put them. A
 * tool call the model emitted is `dispatch: "native"` with no parent token by
 * construction: a code-mode sub-call (P4.5) is dispatched from inside a running
 * program, never decoded from a provider stream, so neither field is a guess.
 *
 * WHAT IS NEVER FABRICATED. An `image` or `tool_result` block arriving in a
 * provider stream has no durable payload this seam can honestly write — an
 * image block carries a digest, not bytes — so it is refused rather than
 * recorded as something else. That is an adapter defect, and a loud one beats a
 * signed row nobody can explain.
 */
import type { SessionEventRef, SessionService } from "../../session/sessionService.js";
import type {
  RecordedBlockRef,
  RecordedCredential,
  RecordedFailure,
  RecordedUsage,
  RequestOutcomeParams
} from "../../session/requestOutcomeMeta.js";
import { BlockAssembler } from "../blockAssembler.js";
import type { AssembledBlock, StreamAssembly } from "../blockAssembler.js";
import { isFailedFinish } from "../streamChunk.js";
import type { StreamChunk, StreamTokenUsage } from "../streamChunk.js";
import type { LlmFailure } from "../llmFailure.js";
import { isRetryableFailure } from "../retryPolicy.js";
import type { PinnedRoute } from "./adapterRegistry.js";
import { scrubCredential } from "./credentialGuard.js";

/** Thrown when a stream produced a block this seam cannot honestly record. */
export class LlmRecordingError extends Error {
  readonly code = "AMC_LLM_RECORDING_UNRECORDABLE_BLOCK";

  constructor(message: string) {
    super(message);
    this.name = "LlmRecordingError";
  }
}

/** How a recorder is pointed at one dispatch. */
export interface StreamRecorderInit {
  readonly session: SessionService;
  /** The route this call pinned. Its adapter identity lands on the settlement row. */
  readonly pinned: PinnedRoute;
  readonly headerEventId: string;
  readonly requestDigest: string;
  /** What the credentials seam said about the reference — never its value. */
  readonly credential: RecordedCredential;
  /**
   * The value resolved for this request, held ONLY to scrub it back out of
   * provider text before that text is signed. Never recorded, never returned.
   */
  readonly secret: string | null;
  /** Injectable clock, so a duration in a signed row is testable. */
  readonly now: () => number;
  readonly dispatchAttempted?: () => boolean;
}

/** A settled dispatch: the full assembly, and the row that closed it. */
export interface SettledStream {
  readonly assembly: StreamAssembly;
  /** The `request/response` or `request/failure` row. */
  readonly outcomeEventId: string;
  /** Null on the success path. */
  readonly failure: LlmFailure | null;
}

/** Keep numeric fields for compatibility; provenance distinguishes missing
 * reports from measured zero, and a failed stream retains its known subtotal. */
function recordUsage(usage: StreamTokenUsage | null, complete = true): RecordedUsage {
  return {
    reported: usage !== null,
    complete: usage !== null && complete,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.cacheReadTokens ?? null,
    cacheWriteTokens: usage?.cacheWriteTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null
  };
}

/**
 * How a block's row labels the stop.
 *
 * A truncated block says so in its own row rather than inheriting the stream's
 * finish reason: several blocks can be open at once, so "the stream ended" and
 * "this block was cut off" are different facts about different blocks.
 */
function blockStopReason(record: AssembledBlock, isLast: boolean, finishLabel: string): string | null {
  if (record.outcome.status === "truncated") return "truncated";
  return isLast ? finishLabel : null;
}

export class StreamRecorder {
  private readonly assembler = new BlockAssembler();

  private readonly init: StreamRecorderInit;

  private readonly startedAtMs: number;

  private settled = false;

  constructor(init: StreamRecorderInit) {
    this.init = init;
    this.startedAtMs = init.now();
  }

  /** Fold one chunk. The grammar runs inside the assembler; violations throw. */
  push(chunk: StreamChunk): void {
    this.assembler.push(chunk);
  }

  /**
   * Settle a stream that reached its terminal finish chunk.
   *
   * A terminal finish can still be a FAILURE — an adapter that decoded an
   * in-band provider error emits `finish` with an `error` reason — and that
   * settles as `request/failure`, not as a response. The alternative would be a
   * `request/response` row whose finish reason says the call failed, which two
   * different queries would then disagree about.
   */
  complete(httpStatus: number): SettledStream {
    const assembly = this.assembler.complete();
    const reason = assembly.finishReason;
    if (reason !== null && isFailedFinish(reason)) {
      return this.record(assembly, {
        kind: reason.kind,
        failure: reason.failure,
        httpStatus
      });
    }
    return this.record(assembly, null, httpStatus);
  }

  /**
   * Settle a stream that ended without a terminal finish — a transport drop, a
   * cancellation, a decode that threw.
   *
   * @param cause short machine-stable reason, recorded on the assembly.
   */
  fail(input: {
    readonly failure: LlmFailure;
    readonly kind: "error" | "aborted";
    readonly httpStatus: number | null;
    readonly cause: string;
  }): SettledStream {
    const assembly = this.assembler.abort(input.cause);
    return this.record(assembly, { kind: input.kind, failure: input.failure, httpStatus: input.httpStatus });
  }

  private record(
    assembly: StreamAssembly,
    failed: { readonly kind: "error" | "aborted"; readonly failure: LlmFailure; readonly httpStatus: number | null } | null,
    successStatus = 0
  ): SettledStream {
    if (this.settled) {
      throw new LlmRecordingError("this dispatch has already been settled; a settlement is written once");
    }
    this.settled = true;
    const finishLabel = failed?.kind ?? assembly.finishReason?.kind ?? "unknown";
    const blocks = this.recordBlocks(assembly, finishLabel);
    const base = {
      headerEventId: this.init.headerEventId,
      requestDigest: this.init.requestDigest,
      providerId: this.init.pinned.providerId,
      adapterId: this.init.pinned.adapterId,
      adapterVersion: this.init.pinned.adapterVersion,
      durationMs: this.init.now() - this.startedAtMs,
      blocks,
      ...(this.init.dispatchAttempted === undefined ? {} : { dispatchAttempted: this.init.dispatchAttempted() })
    };

    const params: RequestOutcomeParams =
      failed === null
        ? {
            ...base,
            httpStatus: successStatus,
            outcome: "completed",
            // The grammar refuses a successful finish that is not one of these
            // three, so the narrowing below cannot silently reclassify a stream.
            finishReason:
              assembly.finishReason?.kind === "tool_calls" || assembly.finishReason?.kind === "max_tokens"
                ? assembly.finishReason.kind
                : "stop",
            usage: recordUsage(assembly.usage)
          }
        : {
            ...base,
            httpStatus: failed.httpStatus,
            outcome: "failed",
            finishReason: failed.kind,
            failure: this.recordFailure(failed.failure),
            usage: recordUsage(assembly.usage, false),
            // AMC's decision at dispatch time, under the policy this route
            // froze when it registered — recorded beside the provider's facts
            // and never inside them. See ../retryPolicy.ts.
            policy: {
              mode: this.init.pinned.retryPolicy.mode,
              retryable: isRetryableFailure(this.init.pinned.retryPolicy, failed.failure)
            },
            credential: this.init.credential
          };

    const ref: SessionEventRef = this.init.session.recordRequestOutcome(params);
    return { assembly, outcomeEventId: ref.eventId, failure: failed?.failure ?? null };
  }

  /** Provider facts, with any resolved credential value removed first. */
  private recordFailure(failure: LlmFailure): RecordedFailure {
    return {
      message: scrubCredential(failure.message, this.init.secret),
      code: failure.code,
      status: failure.status ?? null,
      providerRetryAfterMs: failure.providerRetryAfterMs ?? null,
      requestId: failure.requestId ?? null
    };
  }

  /**
   * Write one row per surviving block, and name every dropped one.
   *
   * `ordinal` — not the adapter's `index` — is the durable block index, because
   * adapter indexes are only required to be distinct while a signed sequence
   * must be dense.
   */
  private recordBlocks(assembly: StreamAssembly, finishLabel: string): readonly RecordedBlockRef[] {
    const kept = assembly.blocks.filter((record) => record.outcome.status !== "dropped");
    const lastKept = kept[kept.length - 1];
    return assembly.blocks.map((record) => {
      if (record.outcome.status === "dropped") {
        // A dropped block still reached the consumer's stream, so its content
        // must be committed in a signed row. Returning eventId: null wrote
        // nothing, which meant the model produced bytes a consumer observed and
        // the log could not account for — the unsigned side-channel P2.3's
        // spill shipped, one layer down. It also contradicted the assembler's
        // own stated intent that a dropped block "is still recorded, so 'the
        // model emitted an empty block' stays a fact anyone can read off the
        // log". The row is marked with the drop reason as its stopReason, so a
        // reader can tell a dropped block from a kept one without inferring it.
        return {
          eventId: this.writeDroppedBlock(record, record.outcome.reason),
          ordinal: record.ordinal,
          kind: record.blockKind,
          status: "dropped" as const,
          reason: record.outcome.reason
        };
      }
      const stopReason = blockStopReason(record, record === lastKept, finishLabel);
      return {
        eventId: this.writeBlock(record, stopReason),
        ordinal: record.ordinal,
        kind: record.blockKind,
        status: record.outcome.status,
        reason: null
      };
    });
  }

  /**
   * Record a block that assembly rejected, content and all.
   *
   * Uses whatever survived — the assembled block when there is one, otherwise
   * the raw partial accumulations — so the signed row commits to exactly what
   * the consumer saw. `dropped:<reason>` as the stopReason keeps a dropped row
   * distinguishable from a kept one at a glance, which is the same discipline
   * P2.3 applied to a synthetic close: never silently indistinguishable.
   */
  private writeDroppedBlock(record: AssembledBlock, reason: string): string {
    const stopReason = `dropped:${reason}`;
    const block = record.block;
    // `partial` is non-null EXACTLY when `block` is null (AssembledBlock's own
    // contract), so a CLOSED block that was nonetheless dropped — the
    // max_tokens_truncated tool call is the live case — has its content in
    // `block` and nothing in `partial`. Reading only `partial` recorded an
    // EMPTY payload for exactly those rows, which meant the tool arguments the
    // model produced and the consumer's stream yielded never reached the signed
    // log. That was this same side-channel reopening one branch over, so the
    // content is now taken from whichever of the two actually holds it.
    const content =
      block !== null
        ? block.kind === "text" || block.kind === "thinking"
          ? block.text
          : block.kind === "tool_use"
            ? `${block.name}${block.arguments}`
            : JSON.stringify(block)
        : `${record.partial?.text ?? ""}${record.partial?.toolArguments ?? ""}`;
    return this.init.session.recordAssistantBlock({
      blockIndex: record.ordinal,
      blockKind: record.blockKind === "tool_use" ? "tool_use" : record.blockKind,
      stopReason,
      content
    }).eventId;
  }

  private writeBlock(record: AssembledBlock, stopReason: string | null): string {
    const block = record.block;
    if (block === null) {
      // Unreachable: a null block always resolves to a dropped outcome, which
      // never reaches here. Stated rather than assumed, because the alternative
      // to this throw is a signed row with an empty payload.
      throw new LlmRecordingError(
        `block ${record.ordinal} (${record.blockKind}) survived assembly with no content to record`
      );
    }
    const session = this.init.session;
    switch (block.kind) {
      case "text":
      case "thinking":
        return session.recordAssistantBlock({
          blockIndex: record.ordinal,
          blockKind: block.kind,
          stopReason,
          content: block.text
        }).eventId;
      case "tool_use":
        return session.recordToolCall({
          toolCallId: block.id,
          toolName: block.name,
          dispatch: "native",
          parentToken: null,
          args: block.arguments
        }).eventId;
      case "image":
      case "tool_result":
        throw new LlmRecordingError(
          `adapter ${this.init.pinned.adapterId}@${this.init.pinned.adapterVersion} emitted a ${block.kind} block; ` +
            `a provider stream produces model output, and neither kind has a durable payload this seam can record`
        );
    }
  }
}
