/**
 * `anthropic-messages@1` — Anthropic's Messages API as AMC stream chunks.
 *
 * TRANSLATION ONLY. This file turns one wire format into {@link StreamChunk}s
 * and builds a URL and headers around bytes it did not produce. It assembles
 * nothing (the shared `BlockAssembler` does), decides nothing about retries (a
 * policy does), and never reads a credential from anywhere but its argument.
 *
 * THREE PLACES THE WIRE FORMAT AND AMC's PROTOCOL DISAGREE, and how each is
 * reconciled:
 *
 *  1. `content_block_stop` carries no content, while AMC's `block-end` carries
 *     the assembled block. So the adapter accumulates each open block's deltas
 *     and emits the finished block at stop. This duplicates a little of the
 *     assembler's work on purpose: `block-end` exists precisely so that no
 *     consumer downstream ever has to re-derive a block from deltas, and the
 *     one place that must is the one that saw the wire format.
 *
 *  2. Usage arrives in TWO frames — input counts on `message_start`, output
 *     counts on `message_delta`. AMC's grammar allows exactly one `usage` chunk
 *     and requires it before a successful finish. So counts accumulate and are
 *     emitted as a single chunk at `message_stop`, immediately before `finish`.
 *     Deferring to the end-of-stream marker is also what makes a trailing
 *     usage-only frame incapable of violating the ordering.
 *
 *  3. Anthropic reports cached input SEPARATELY from `input_tokens`, which is
 *     exactly AMC's disjoint model, so the counts map across unchanged. No
 *     subtraction, and therefore no place to get a subtraction wrong.
 *
 * AN UNKNOWN `stop_reason` IS AN ERROR, NOT A `stop`. If the provider adds a
 * terminal reason this adapter has never seen, the honest answer is a loud
 * typed failure naming the raw value — not a signed `request/response` row
 * claiming the model finished cleanly. `pause_turn` is deliberately in that
 * bucket today: it means the turn should be continued, AMC has no continuation
 * path yet, and quietly ending the turn would be a behavioural bug wearing a
 * clean stop reason.
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
import { ANTHROPIC_MESSAGES_ENCODER_ID } from "../request/anthropicMessagesEncoder.js";

export const ANTHROPIC_ADAPTER_ID = "anthropic-messages";

/** The API version Anthropic requires on every request. Part of the wire shape. */
const ANTHROPIC_VERSION = "2023-06-01";

/** Anthropic error `type` values that map to something other than the HTTP default. */
const ANTHROPIC_ERROR_CODES: Readonly<Record<string, string>> = Object.freeze({
  authentication_error: LLM_FAILURE_CODE.AUTH,
  permission_error: LLM_FAILURE_CODE.AUTH,
  invalid_request_error: LLM_FAILURE_CODE.INVALID_REQUEST,
  rate_limit_error: LLM_FAILURE_CODE.RATE_LIMIT,
  overloaded_error: LLM_FAILURE_CODE.SERVER,
  api_error: LLM_FAILURE_CODE.SERVER,
  timeout_error: LLM_FAILURE_CODE.TIMEOUT
});

/** `stop_reason` values this adapter understands. Anything else fails loudly. */
const STOP_REASONS: Readonly<Record<string, SuccessfulFinishKind>> = Object.freeze({
  end_turn: "stop",
  stop_sequence: "stop",
  refusal: "stop",
  tool_use: "tool_calls",
  max_tokens: "max_tokens",
  model_context_window_exceeded: "max_tokens"
});

interface OpenBlock {
  readonly kind: "text" | "thinking" | "tool_use";
  text: string;
  toolCallId: string;
  toolName: string;
  toolArguments: string;
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

/** A wire frame this adapter cannot interpret. Never guessed past. */
function protocolFailure(detail: string): LlmError {
  return new LlmError(`${ANTHROPIC_ADAPTER_ID} stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT);
}

function parseFrame(data: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw protocolFailure("received an event whose data is not JSON");
  }
  const frame = record(parsed);
  if (frame === null) throw protocolFailure("received an event whose data is not an object");
  return frame;
}

/** Build the block a `content_block_stop` closes, from what the deltas carried. */
function closeBlock(open: OpenBlock, index: number): ContentBlock {
  switch (open.kind) {
    case "text":
      return { kind: "text", text: open.text };
    case "thinking":
      return { kind: "thinking", text: open.text };
    case "tool_use":
      if (open.toolCallId.length === 0) {
        throw protocolFailure(`tool_use block ${index} closed without a call id`);
      }
      return {
        kind: "tool_use",
        id: toolCallId(open.toolCallId),
        name: open.toolName,
        arguments: open.toolArguments
      };
  }
}

/** Accumulated usage as one chunk. Absent counts stay absent — never a made-up 0. */
function usageChunk(counts: {
  input: number | undefined;
  output: number | undefined;
  cacheRead: number | undefined;
  cacheWrite: number | undefined;
}): StreamChunk {
  const usage: StreamTokenUsage = {
    inputTokens: counts.input ?? 0,
    outputTokens: counts.output ?? 0,
    ...(counts.cacheRead === undefined ? {} : { cacheReadTokens: counts.cacheRead }),
    ...(counts.cacheWrite === undefined ? {} : { cacheWriteTokens: counts.cacheWrite })
  };
  return { type: "usage", usage };
}

async function* decodeAnthropic(response: HttpResponse): AsyncIterable<StreamChunk> {
  const open = new Map<number, OpenBlock>();
  const counts = {
    input: undefined as number | undefined,
    output: undefined as number | undefined,
    cacheRead: undefined as number | undefined,
    cacheWrite: undefined as number | undefined
  };
  let stopReason: string | null = null;
  let terminated = false;

  for await (const event of sseEvents(response.body)) {
    if (event.event === "ping") continue;
    const frame = parseFrame(event.data);
    const type = typeof frame.type === "string" ? frame.type : (event.event ?? "");

    if (type === "error") {
      const error = record(frame.error);
      const errorType = text(error?.type);
      // An in-band error is a TERMINAL FINISH, not a throw: the stream reached a
      // defined end and the failure facts belong on the finish chunk, which is
      // the same shape a thrown failure produces for the durable writer.
      yield {
        type: "finish",
        reason: {
          kind: "error",
          failure: {
            message: text(error?.message) || `anthropic reported ${errorType || "an error"}`,
            code: ANTHROPIC_ERROR_CODES[errorType] ?? LLM_FAILURE_CODE.UNKNOWN
          }
        }
      };
      terminated = true;
      return;
    }

    if (type === "message_start") {
      const usage = record(record(frame.message)?.usage);
      counts.input = integer(usage?.input_tokens);
      counts.output = integer(usage?.output_tokens);
      counts.cacheRead = integer(usage?.cache_read_input_tokens);
      counts.cacheWrite = integer(usage?.cache_creation_input_tokens);
      continue;
    }

    if (type === "content_block_start") {
      const index = integer(frame.index);
      const block = record(frame.content_block);
      if (index === undefined || block === null) throw protocolFailure("malformed content_block_start");
      const blockType = text(block.type);
      if (blockType !== "text" && blockType !== "thinking" && blockType !== "tool_use") {
        throw protocolFailure(`unsupported content block type "${blockType}"`);
      }
      if (blockType === "tool_use" && text(block.id).length === 0) {
        // Refused rather than synthesized. The id keys the durable `tool/call`
        // row and joins it to its result; an invented one is unique to neither a
        // step nor a session, and the join it breaks is unfixable after signing.
        throw protocolFailure(`tool_use block ${index} opened without a call id`);
      }
      open.set(index, {
        kind: blockType,
        text: blockType === "text" ? text(block.text) : text(block.thinking),
        toolCallId: text(block.id),
        toolName: text(block.name),
        toolArguments: ""
      });
      yield {
        type: "block-start",
        index,
        blockKind: blockType === "text" ? "text" : blockType === "thinking" ? "thinking" : "tool_use"
      };
      const seeded = open.get(index);
      // A `content_block_start` may already carry content (a tool_use's id and
      // name always do). Emitting it as a delta keeps the invariant that a
      // block's content arrives only through deltas.
      if (seeded !== undefined && seeded.kind === "tool_use") {
        yield {
          type: "tool-call-delta",
          index,
          id: toolCallId(seeded.toolCallId),
          ...(seeded.toolName.length > 0 ? { name: seeded.toolName } : {}),
          argumentsDelta: ""
        };
      } else if (seeded !== undefined && seeded.text.length > 0) {
        yield seeded.kind === "text"
          ? { type: "text-delta", index, text: seeded.text }
          : { type: "thinking-delta", index, text: seeded.text };
      }
      continue;
    }

    if (type === "content_block_delta") {
      const index = integer(frame.index);
      const delta = record(frame.delta);
      if (index === undefined || delta === null) throw protocolFailure("malformed content_block_delta");
      const entry = open.get(index);
      if (entry === undefined) throw protocolFailure(`delta for unopened block ${index}`);
      const deltaType = text(delta.type);
      if (deltaType === "text_delta") {
        entry.text += text(delta.text);
        yield { type: "text-delta", index, text: text(delta.text) };
      } else if (deltaType === "thinking_delta") {
        entry.text += text(delta.thinking);
        yield { type: "thinking-delta", index, text: text(delta.thinking) };
      } else if (deltaType === "input_json_delta") {
        entry.toolArguments += text(delta.partial_json);
        yield {
          type: "tool-call-delta",
          index,
          id: toolCallId(entry.toolCallId),
          argumentsDelta: text(delta.partial_json)
        };
      }
      // `signature_delta` and any future delta type are skipped deliberately:
      // they carry no model-visible content, and AMC does not yet record a
      // thinking signature (see the encoder's declared v1 limits).
      continue;
    }

    if (type === "content_block_stop") {
      const index = integer(frame.index);
      if (index === undefined) throw protocolFailure("malformed content_block_stop");
      const entry = open.get(index);
      if (entry === undefined) throw protocolFailure(`stop for unopened block ${index}`);
      open.delete(index);
      yield { type: "block-end", index, block: closeBlock(entry, index) };
      continue;
    }

    if (type === "message_delta") {
      const delta = record(frame.delta);
      const usage = record(frame.usage);
      stopReason = typeof delta?.stop_reason === "string" ? delta.stop_reason : stopReason;
      counts.output = integer(usage?.output_tokens) ?? counts.output;
      continue;
    }

    if (type === "message_stop") {
      const kind = stopReason === null ? undefined : STOP_REASONS[stopReason];
      if (kind === undefined) {
        // Loud rather than "stop": a terminal reason nobody has mapped may well
        // mean the response is incomplete, and a signed clean stop would be a
        // claim AMC cannot support.
        throw new LlmError(
          `${ANTHROPIC_ADAPTER_ID} stream ended with unmapped stop_reason "${stopReason ?? "(absent)"}"`,
          LLM_FAILURE_CODE.UNKNOWN
        );
      }
      yield usageChunk(counts);
      yield { type: "finish", reason: { kind } };
      terminated = true;
      return;
    }
  }

  if (!terminated) {
    // The socket ended before `message_stop`. That is a transport failure — and
    // classifying it as one matters, because a transport failure is retryable
    // while an AMC protocol violation deliberately is not.
    throw protocolFailure("connection ended before message_stop");
  }
}

/** Anthropic's Messages API. */
export const anthropicAdapter: LlmAdapter = {
  id: ANTHROPIC_ADAPTER_ID,
  version: 1,
  encoderId: ANTHROPIC_MESSAGES_ENCODER_ID,
  encoderVersion: 2,

  assertParams(params: Record<string, unknown>): void {
    // `anthropic-messages@1` does not own `stream` — bumping the encoder to take
    // it would change bytes that already-recorded requests reconstruct from — so
    // the caller must supply it, and this is where a caller who did not finds
    // out. The decoder speaks SSE and nothing else; a non-streamed response is
    // simply unreadable to it.
    if (params.stream !== true) {
      throw new LlmError(
        `${ANTHROPIC_ADAPTER_ID} requires params.stream === true; ` +
          `this adapter decodes a server-sent event stream and cannot read a single JSON response`,
        LLM_FAILURE_CODE.INVALID_REQUEST
      );
    }
  },

  envelope(input: AdapterEnvelopeInput): HttpRequest {
    return {
      url: `${input.baseUrl}/v1/messages`,
      method: "POST",
      headers: {
        // Route headers first, so an adapter-owned header cannot be shadowed by
        // a route that set the same name.
        ...input.extraHeaders,
        "content-type": "application/json",
        accept: "text/event-stream",
        "anthropic-version": ANTHROPIC_VERSION,
        ...(input.credential === null ? {} : { "x-api-key": input.credential })
      },
      body: input.body,
      ...(input.signal !== undefined ? { signal: input.signal } : {})
    };
  },

  decode(response: HttpResponse): AsyncIterable<StreamChunk> {
    return decodeAnthropic(response);
  },

  describeFailure(input: AdapterFailureInput): AdapterFailureHint {
    const requestId = input.headers["request-id"] ?? input.headers["x-request-id"];
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.bodyText);
    } catch {
      return requestId === undefined ? {} : { requestId };
    }
    const error = record(record(parsed)?.error);
    // Deliberately NO `code`. The shared classifier already reads the HTTP
    // status, and its quota-before-429 ordering is the reason an exhausted
    // balance does not retry forever; an adapter that overrode the code with
    // Anthropic's own `rate_limit_error` would bypass exactly that check.
    // ANTHROPIC_ERROR_CODES is for the in-band stream error, where no status
    // exists to classify from.
    return {
      ...(requestId === undefined ? {} : { requestId }),
      ...(text(error?.message).length === 0 ? {} : { message: text(error?.message) })
    };
  }
};
