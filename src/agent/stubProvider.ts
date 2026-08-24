/**
 * A provider that is not a provider — so an operator can run a real turn on a
 * machine with no API key.
 *
 * WHY THIS EXISTS AT ALL. `amc agent-loop run` has to be runnable by someone
 * evaluating AMC's evidence spine, not just by someone with a funded Anthropic
 * account. Without a keyless route, the first thing a new operator meets is a
 * `MISSING_CREDENTIAL` row, and the loop's actual claims — a balanced turn, a
 * signed step boundary, a reconstructable request — go undemonstrated.
 *
 * WHY IT IS A REAL ADAPTER AND NOT A SHORT CIRCUIT. It goes through the ENTIRE
 * seam: the request is encoded by `anthropic-messages@1`, committed to by a
 * signed `request/header` row, handed to `envelope()`, sent through an
 * `HttpTransport`, decoded into {@link StreamChunk}s and folded by the same
 * `BlockAssembler` every provider uses. A stub that bypassed any of that would
 * demonstrate a path that production never takes, which is the fastest way to
 * ship a green suite over a broken product. The only thing replaced is the
 * network: {@link stubProviderTransport} answers the request in-process.
 *
 * WHY ITS TOKEN COUNTS ARE ZERO. Because they are. No model ran and no account
 * was charged, so `inputTokens: 0, outputTokens: 0` is a MEASUREMENT of what the
 * stub consumed, not a placeholder standing in for a number nobody has. The
 * cache counts are omitted entirely, which the session vocabulary records as
 * null — "not reported", which is also true. Every row this route produces names
 * `providerId: "stub"` and this adapter's id, so nothing here can later be read
 * as a real provider's accounting.
 *
 * WHAT IT SAYS BACK. Strictly a function of the request bytes:
 *
 *   - tools are offered and no tool result is in the history yet  → one
 *     `tool_use` call of the first offered tool, with the last user text as its
 *     only argument. That is what makes `amc agent-loop run --stub` a genuine
 *     MULTI-STEP turn rather than one request and a period.
 *   - otherwise → one text block quoting what it was asked.
 *
 * FAULT INJECTION IS OPT-IN AND NAMED. `failFirst` makes the first N dispatches
 * answer HTTP 429 with a `Retry-After`, which is how an operator sees the
 * request-boundary retry — two `request/header` rows and a `loop/retry` row
 * inside ONE step — without waiting for a real provider to rate-limit them. It
 * is a property of this stub route and unreachable from any configured provider.
 */
import type { LlmAdapter } from "../llm/adapter/adapterTypes.js";
import type { LlmRouteConfig } from "../llm/adapter/adapterRegistry.js";
import { bodyFromChunks, readBodyText } from "../llm/adapter/transport.js";
import type { HttpResponse, HttpTransport } from "../llm/adapter/transport.js";
import { toolCallId } from "../llm/streamChunk.js";
import type { StreamChunk } from "../llm/streamChunk.js";

export const STUB_PROVIDER_ID = "stub";
export const STUB_PROVIDER_MODEL = "amc-stub-1";

/** The base URL the stub route registers. Never dialled — the transport is local. */
const STUB_BASE_URL = "http://stub.invalid";

export interface StubProviderOptions {
  /**
   * Answer the first N dispatches with HTTP 429, to exercise retry.
   *
   * Counted per transport instance, so one `run` sees exactly N failures no
   * matter how many steps it takes.
   */
  readonly failFirst?: number;
  /** The `Retry-After` the injected 429 asks for, in seconds. */
  readonly retryAfterSeconds?: number;
  /**
   * How long the stub "thinks" before answering, in ms.
   *
   * Exists so a cancellation has something to land in the middle of: an operator
   * verifying that stop produces a CLEAN cancelled turn needs a turn that is
   * still running when they press it.
   */
  readonly thinkMs?: number;
}

/** Wait, resolving early on abort so the dispatch can settle as aborted. */
function think(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0 || signal?.aborted === true) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The transport that answers the stub route in-process.
 *
 * Echoes the request bytes back as the response body. That is not laziness: the
 * adapter's whole job is to turn a wire response into chunks, and giving it the
 * exact bytes that a signed `request/header` row commits to means the reply is a
 * pure function of what was actually sent.
 */
export function stubProviderTransport(options: StubProviderOptions = {}): HttpTransport {
  let dispatches = 0;
  const failFirst = options.failFirst ?? 0;
  const retryAfterSeconds = options.retryAfterSeconds ?? 1;
  return async (request): Promise<HttpResponse> => {
    dispatches += 1;
    await think(options.thinkMs ?? 0, request.signal);
    if (request.signal?.aborted === true) {
      // The real transport rejects when the caller aborts; the stub must too, or
      // a cancelled dispatch would settle as a successful one.
      throw Object.assign(new Error("stub provider request aborted"), { name: "AbortError" });
    }
    if (dispatches <= failFirst) {
      return {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
        body: bodyFromChunks([
          JSON.stringify({ error: { type: "rate_limit_error", message: "stub provider: injected rate limit" } })
        ])
      };
    }
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: bodyFromChunks([request.body.toString("utf8")])
    };
  };
}

/** The shape the anthropic encoder produces, read back defensively. */
interface EchoedRequest {
  readonly messages: readonly { readonly role: string; readonly content: readonly Record<string, unknown>[] }[];
  readonly tools: readonly { readonly name: string }[];
}

/**
 * Read the echoed request without trusting its shape.
 *
 * The bytes came from AMC's own encoder, but this parse runs on whatever the
 * transport returned, and an adapter that assumed a shape would throw a
 * `TypeError` where it should be producing a typed failure.
 */
function readEchoedRequest(bodyText: string): EchoedRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { messages: [], tools: [] };
  }
  if (typeof parsed !== "object" || parsed === null) return { messages: [], tools: [] };
  const body = parsed as Record<string, unknown>;
  const messages = Array.isArray(body.messages)
    ? (body.messages as EchoedRequest["messages"]).filter((message) => typeof message?.role === "string")
    : [];
  const tools = Array.isArray(body.tools)
    ? (body.tools as EchoedRequest["tools"]).filter((tool) => typeof tool?.name === "string")
    : [];
  return { messages, tools };
}

/** The last thing a user said, as the encoder wrote it into the body. */
function lastUserText(request: EchoedRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index];
    if (message === undefined || message.role !== "user") continue;
    for (const block of [...message.content].reverse()) {
      if (block?.type === "text" && typeof block.text === "string") return block.text;
    }
  }
  return "";
}

/** True once a tool result is in the history, so the stub stops asking for tools. */
function hasToolResult(request: EchoedRequest): boolean {
  return request.messages.some((message) =>
    message.content.some((block) => block?.type === "tool_result")
  );
}

/** Zero, and true: no model ran, so nothing was consumed. See the module header. */
const STUB_USAGE = Object.freeze({ inputTokens: 0, outputTokens: 0 });

function* stubChunks(request: EchoedRequest): Generator<StreamChunk> {
  const asked = lastUserText(request);
  const tool = request.tools[0];
  if (tool !== undefined && !hasToolResult(request)) {
    const id = toolCallId(`stub-call-${request.messages.length}`);
    const args = JSON.stringify({ text: asked });
    yield { type: "block-start", index: 0, blockKind: "tool_use" };
    yield { type: "tool-call-delta", index: 0, id, name: tool.name, argumentsDelta: args };
    yield { type: "block-end", index: 0, block: { kind: "tool_use", id, name: tool.name, arguments: args } };
    yield { type: "usage", usage: STUB_USAGE };
    yield { type: "finish", reason: { kind: "tool_calls" } };
    return;
  }
  const text = `stub provider: ${request.messages.length} message(s) in view; you last said ${JSON.stringify(asked)}.`;
  yield { type: "block-start", index: 0, blockKind: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { kind: "text", text } };
  yield { type: "usage", usage: STUB_USAGE };
  yield { type: "finish", reason: { kind: "stop" } };
}

/** The stub adapter. Declares the same encoder the Anthropic route uses. */
export const stubProviderAdapter: LlmAdapter = {
  id: "amc-stub-echo",
  version: 1,
  encoderId: "anthropic-messages",
  encoderVersion: 1,
  envelope: (input) => ({
    url: `${input.baseUrl}/v1/messages`,
    method: "POST",
    headers: { "content-type": "application/json", ...input.extraHeaders },
    body: input.body,
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  }),
  decode: async function* decode(response: HttpResponse): AsyncIterable<StreamChunk> {
    const bodyText = await readBodyText(response.body);
    for (const chunk of stubChunks(readEchoedRequest(bodyText))) yield chunk;
  }
};

/**
 * The route an operator registers to run the loop without a provider.
 *
 * `credentialRef: null` is the honest spelling: this route authenticates with
 * nothing, and a reference that resolved to nothing would record a credential
 * the deployment does not have.
 */
export function stubProviderRoute(): LlmRouteConfig {
  return {
    providerId: STUB_PROVIDER_ID,
    adapter: stubProviderAdapter,
    baseUrl: STUB_BASE_URL,
    credentialRef: null,
    models: [STUB_PROVIDER_MODEL]
  };
}
