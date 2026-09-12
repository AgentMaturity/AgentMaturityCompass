/**
 * `openai-chat@4` — native signed user-image requests; unchanged Chat stream
 * decoding below. Wire support is not a probe of any remote model or origin.
 *
 * THE STRUCTURAL DIFFERENCE FROM ANTHROPIC, and the one thing worth reading
 * before the code: OpenAI's stream has no block boundaries. There is no
 * `content_block_start`, no `content_block_stop`, and no index for text at all —
 * a response is a flat run of `delta.content` strings plus a parallel array of
 * `delta.tool_calls` entries with their own indexes. AMC's protocol is built on
 * blocks, because a block is what becomes one signed row.
 *
 * So this adapter SYNTHESIZES the boundaries, by one fixed rule:
 *
 *   block 0            = the assistant's text
 *   block 1 + n        = the tool call OpenAI numbered n
 *
 * A block opens lazily, on the first delta that belongs to it, and every open
 * block is closed when `finish_reason` arrives. The offset of one is not
 * cosmetic: text and tool calls are numbered in separate namespaces upstream and
 * would otherwise collide at index 0, folding a tool call and the assistant's
 * prose into one row.
 *
 * The rule is a CONVENTION, not information from the provider, and it is stated
 * here because the resulting `blockIndex` values are signed. What the durable
 * row uses is the assembler's dense `ordinal` rather than this index, so the
 * convention never leaks into the log — but the block IDENTITY it establishes
 * does, and getting it wrong would merge two blocks the model kept apart.
 *
 * USAGE IS NEVER FABRICATED. OpenAI reports it in a final chunk with an empty
 * `choices` array, and only when `stream_options.include_usage` was set — which
 * the encoder next door guarantees. If it never arrives, this adapter emits NO
 * usage chunk and the grammar refuses the successful finish with
 * `AMC_LLM_STREAM_USAGE_MISSING`. Emitting zeros instead would sign a row saying
 * the step cost nothing.
 */
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import { toolCallId } from "../streamChunk.js";
import type { ContentBlock, StreamChunk, StreamTokenUsage, SuccessfulFinishKind } from "../streamChunk.js";
import type {
  AdapterEnvelopeInput,
  AdapterFailureHint,
  AdapterFailureInput,
  LlmAdapter
} from "../adapter/adapterTypes.js";
import { sseEvents } from "../adapter/sse.js";
import type { HttpRequest, HttpResponse } from "../adapter/transport.js";
import { OPENAI_CHAT_ENCODER_ID } from "../request/openaiChatEncoder.js";
import { OPENAI_CHAT_CAPABILITIES } from "../adapter/providerCapabilities.js";

export const OPENAI_ADAPTER_ID = "openai-chat";

/** The block index the assistant's text occupies. Tool calls start after it. */
const TEXT_BLOCK_INDEX = 0;
const TOOL_BLOCK_OFFSET = 1;

/** OpenAI's terminal `data:` sentinel. Not JSON. */
const DONE_SENTINEL = "[DONE]";

/**
 * `finish_reason` values this adapter maps. Anything else fails loudly.
 *
 * `content_filter` maps to `stop`, and that is a DECLARED LIMIT: the model did
 * stop, AMC's protocol has no third state for "stopped because the provider
 * filtered it", and the distinction is preserved nowhere downstream. Recording
 * it would take a protocol change, not an adapter change.
 */
const FINISH_REASONS: Readonly<Record<string, SuccessfulFinishKind>> = Object.freeze({
  stop: "stop",
  length: "max_tokens",
  tool_calls: "tool_calls",
  function_call: "tool_calls",
  content_filter: "stop"
});

interface ToolCallState {
  readonly blockIndex: number;
  id: string;
  name: string;
  arguments: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function protocolFailure(detail: string): LlmError {
  return new LlmError(`${OPENAI_ADAPTER_ID} stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT);
}

/** Map the reported counts onto AMC's disjoint model. */
function toUsage(usage: Record<string, unknown>): StreamTokenUsage | null {
  for (const value of [usage.prompt_tokens, usage.completion_tokens,
    record(usage.prompt_tokens_details)?.cached_tokens, record(usage.completion_tokens_details)?.reasoning_tokens]) {
    if (value !== undefined && integer(value) === undefined) throw protocolFailure("reported usage is not a nonnegative integer");
  }
  const prompt = integer(usage.prompt_tokens);
  const completion = integer(usage.completion_tokens);
  if (prompt === undefined || completion === undefined) return null;
  const details = record(usage.prompt_tokens_details);
  const cacheRead = integer(details?.cached_tokens);
  const reasoning = integer(record(usage.completion_tokens_details)?.reasoning_tokens);
  if ((cacheRead ?? 0) > prompt || (reasoning ?? 0) > completion) {
    throw protocolFailure("usage breakdown exceeds the reported total");
  }
  return {
    // OpenAI's `prompt_tokens` INCLUDES the cached ones, while AMC's counts are
    // disjoint. An inconsistent provider report is refused, never clamped into
    // apparently valid accounting.
    inputTokens: cacheRead === undefined ? prompt : prompt - cacheRead,
    outputTokens: completion,
    ...(cacheRead === undefined ? {} : { cacheReadTokens: cacheRead }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning })
  };
}

async function* decodeOpenai(response: HttpResponse): AsyncIterable<StreamChunk> {
  let textOpen = false;
  let textSoFar = "";
  const toolCalls = new Map<number, ToolCallState>();
  let usage: StreamTokenUsage | null = null;
  let finish: SuccessfulFinishKind | null = null;
  let terminated = false;

  /** Close every open block. Runs once, when the choice reports its finish. */
  function* closeBlocks(): Generator<StreamChunk> {
    if (textOpen) {
      // The block's assembled content is rebuilt from what the deltas carried,
      // because `block-end` is what spares every downstream consumer from doing
      // the same. `textSoFar` is the only state this needs.
      yield { type: "block-end", index: TEXT_BLOCK_INDEX, block: { kind: "text", text: textSoFar } };
      textOpen = false;
    }
    for (const state of [...toolCalls.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
      if (state.id.length === 0) {
        throw protocolFailure(`tool call at block ${state.blockIndex} closed without a call id`);
      }
      const block: ContentBlock = {
        kind: "tool_use",
        id: toolCallId(state.id),
        name: state.name,
        arguments: state.arguments
      };
      yield { type: "block-end", index: state.blockIndex, block };
    }
    toolCalls.clear();
  }

  for await (const event of sseEvents(response.body)) {
    if (event.data === DONE_SENTINEL) {
      if (finish === null) throw protocolFailure("received [DONE] before any finish_reason");
      // Usage is emitted only if the provider reported it — see the header.
      if (usage !== null) yield { type: "usage", usage };
      yield { type: "finish", reason: { kind: finish } };
      terminated = true;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      throw protocolFailure("received an event whose data is not JSON");
    }
    const frame = record(parsed);
    if (frame === null) throw protocolFailure("received an event whose data is not an object");

    const errorFrame = record(frame.error);
    if (errorFrame !== null) {
      // An in-band error is a terminal finish, not a throw: same shape a thrown
      // failure produces for the durable writer, and it keeps the grammar happy
      // about open blocks (a failed finish tolerates them).
      yield {
        type: "finish",
        reason: {
          kind: "error",
          failure: {
            message: text(errorFrame.message) || "openai reported an error mid-stream",
            code: LLM_FAILURE_CODE.SERVER
          }
        }
      };
      terminated = true;
      return;
    }

    const reportedUsage = record(frame.usage);
    if (reportedUsage !== null) usage = toUsage(reportedUsage) ?? usage;

    const choices = Array.isArray(frame.choices) ? frame.choices : [];
    for (const rawChoice of choices) {
      const choice = record(rawChoice);
      if (choice === null) continue;
      if (choice.index !== undefined && choice.index !== 0) throw protocolFailure("multiple completion choices are unsupported");
      const delta = record(choice.delta);
      if (delta?.audio != null || delta?.function_call != null || text(delta?.reasoning_content).length > 0
          || text(delta?.refusal).length > 0 || (Array.isArray(delta?.annotations) && delta.annotations.length > 0)) {
        throw protocolFailure("unsupported audio, reasoning, refusal, annotation or legacy function-call output");
      }

      const content = text(delta?.content);
      if (content.length > 0) {
        if (!textOpen) {
          textOpen = true;
          yield { type: "block-start", index: TEXT_BLOCK_INDEX, blockKind: "text" };
        }
        textSoFar += content;
        yield { type: "text-delta", index: TEXT_BLOCK_INDEX, text: content };
      }

      const rawCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
      for (const rawCall of rawCalls) {
        const call = record(rawCall);
        if (call === null) continue;
        const ordinal = integer(call.index) ?? 0;
        const fn = record(call.function);
        let state = toolCalls.get(ordinal);
        if (state === undefined) {
          const id = text(call.id);
          if (id.length === 0) {
            // Refused, never synthesized: the id keys the durable `tool/call`
            // row and joins it to its result. An invented id breaks that join
            // permanently once the row is signed.
            throw protocolFailure(`tool call ${ordinal} opened without a call id`);
          }
          state = { blockIndex: TOOL_BLOCK_OFFSET + ordinal, id, name: text(fn?.name), arguments: "" };
          toolCalls.set(ordinal, state);
          yield { type: "block-start", index: state.blockIndex, blockKind: "tool_use" };
        }
        if (text(fn?.name).length > 0) state.name = text(fn?.name);
        const argumentsDelta = text(fn?.arguments);
        state.arguments += argumentsDelta;
        yield {
          type: "tool-call-delta",
          index: state.blockIndex,
          id: toolCallId(state.id),
          ...(state.name.length > 0 ? { name: state.name } : {}),
          argumentsDelta
        };
      }

      const reason = text(choice.finish_reason);
      if (reason.length > 0) {
        const mapped = FINISH_REASONS[reason];
        if (mapped === undefined) {
          throw new LlmError(
            `${OPENAI_ADAPTER_ID} stream reported unmapped finish_reason "${reason}"`,
            LLM_FAILURE_CODE.UNKNOWN
          );
        }
        finish = mapped;
        yield* closeBlocks();
      }
    }
  }

  if (!terminated) {
    // The socket ended before `[DONE]`. Classified as transport — which is
    // retryable — rather than as an AMC protocol violation, which is not.
    throw protocolFailure("connection ended before the [DONE] sentinel");
  }
}

/** OpenAI's Chat Completions API, and the many services that speak its dialect. */
export const openaiAdapter: LlmAdapter = {
  capabilities: OPENAI_CHAT_CAPABILITIES,
  id: OPENAI_ADAPTER_ID,
  version: 4,
  encoderId: OPENAI_CHAT_ENCODER_ID,
  encoderVersion: 4,

  assertParams(params): void {
    if ((params.n !== undefined && params.n !== 1) || params.functions !== undefined || params.function_call !== undefined
        || params.logprobs === true || params.top_logprobs !== undefined) {
      throw new LlmError("openai-chat supports one completion and explicit function tools; legacy functions and logprobs cannot be preserved", LLM_FAILURE_CODE.INVALID_REQUEST);
    }
  },

  envelope(input: AdapterEnvelopeInput): HttpRequest {
    return {
      url: `${input.baseUrl}/v1/chat/completions`,
      method: "POST",
      headers: {
        ...input.extraHeaders,
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(input.credential === null ? {} : { authorization: `Bearer ${input.credential}` })
      },
      body: input.body,
      ...(input.signal !== undefined ? { signal: input.signal } : {})
    };
  },

  decode(response: HttpResponse): AsyncIterable<StreamChunk> {
    return decodeOpenai(response);
  },

  describeFailure(input: AdapterFailureInput): AdapterFailureHint {
    const requestId = input.headers["x-request-id"];
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.bodyText);
    } catch {
      return requestId === undefined ? {} : { requestId };
    }
    const error = record(record(parsed)?.error);
    // No `code`: the shared classifier owns that, and its quota-before-429
    // ordering is what keeps an exhausted balance from retrying forever.
    return {
      ...(requestId === undefined ? {} : { requestId }),
      ...(text(error?.message).length === 0 ? {} : { message: text(error?.message) })
    };
  }
};
