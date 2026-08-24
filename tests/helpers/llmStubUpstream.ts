/**
 * A stub upstream for the LLM seam's tests.
 *
 * NO NETWORK, deliberately. P3.1's verification clauses are claims about what
 * AMC does with a provider's bytes — a 429 surfaces a typed retryable error, a
 * streamed completion assembles, usage precedes finish. Standing up a server to
 * prove any of them would make the test a statement about the server. The
 * transport is a seam precisely so a test can BE the provider.
 *
 * Every helper here builds a complete, well-formed wire response, so a test that
 * wants a malformed one has to say which rule it is breaking.
 */
import type { HttpRequest, HttpResponse, HttpTransport } from "../../src/llm/adapter/transport.js";
import { bodyFromChunks } from "../../src/llm/adapter/transport.js";

/** One recorded outbound request, for asserting what was actually transmitted. */
export interface SentRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
}

export interface StubUpstream {
  readonly transport: HttpTransport;
  /** Every request the seam dispatched, in order. */
  readonly sent: SentRequest[];
}

/**
 * A transport that answers each call from a queue of responses.
 *
 * A queue rather than one fixed response because the credential-rotation test
 * needs two dispatches with different outcomes, and a single response would let
 * a hoisted credential pass unnoticed.
 */
export function stubUpstream(responses: readonly (() => HttpResponse)[]): StubUpstream {
  const sent: SentRequest[] = [];
  let index = 0;
  const transport: HttpTransport = async (request: HttpRequest) => {
    sent.push({ url: request.url, headers: request.headers, body: request.body });
    const next = responses[index] ?? responses[responses.length - 1];
    index += 1;
    if (next === undefined) throw new Error("stub upstream has no response configured");
    return next();
  };
  return { transport, sent };
}

/** A transport that rejects — a refused connection, a DNS failure, a timeout. */
export function refusingUpstream(error: Error): StubUpstream {
  const sent: SentRequest[] = [];
  const transport: HttpTransport = async (request: HttpRequest) => {
    sent.push({ url: request.url, headers: request.headers, body: request.body });
    throw error;
  };
  return { transport, sent };
}

/** Frame SSE events exactly as a provider would, one blank line between them. */
export function sseBody(frames: readonly { event?: string; data: string }[]): AsyncIterable<Uint8Array> {
  return bodyFromChunks(
    frames.map((frame) => `${frame.event === undefined ? "" : `event: ${frame.event}\n`}data: ${frame.data}\n\n`)
  );
}

/** A 2xx SSE response. */
export function okStream(
  frames: readonly { event?: string; data: string }[],
  headers: Readonly<Record<string, string>> = {}
): HttpResponse {
  return { status: 200, headers: { "content-type": "text/event-stream", ...headers }, body: sseBody(frames) };
}

/** A non-2xx response with a JSON error body. */
export function errorResponse(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
): HttpResponse {
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body: bodyFromChunks([JSON.stringify(body)])
  };
}

/** The Anthropic frames for one complete text-only response. */
export function anthropicTextStream(options: {
  readonly text: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly stopReason?: string;
}): readonly { event: string; data: string }[] {
  return [
    {
      event: "message_start",
      data: JSON.stringify({
        type: "message_start",
        message: {
          usage: {
            input_tokens: options.inputTokens,
            output_tokens: 0,
            ...(options.cacheReadTokens === undefined
              ? {}
              : { cache_read_input_tokens: options.cacheReadTokens })
          }
        }
      })
    },
    {
      event: "content_block_start",
      data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
    },
    ...options.text.map((piece) => ({
      event: "content_block_delta",
      data: JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: piece }
      })
    })),
    { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
    {
      event: "message_delta",
      data: JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: options.stopReason ?? "end_turn" },
        usage: { output_tokens: options.outputTokens }
      })
    },
    { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) }
  ];
}
