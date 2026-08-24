/**
 * What an LLM adapter IS in AMC — and, more importantly, what it is not.
 *
 * dsh's adapter owns the whole call: it builds the request from `GenerateOptions`,
 * sends it, and decodes the reply. AMC splits that in half, because the request
 * half is already spoken for. By the time an adapter is reached, a signed
 * `request/header` row has committed to `sha256(exact transmitted bytes)` and
 * `PreparedRequest` is the only holder of them. An adapter that could also
 * BUILD the body would be able to send something other than what was signed,
 * and every guarantee VERIFY-3 provides would become a convention.
 *
 * So an adapter here does exactly three things:
 *
 *   1. `envelope()` — wraps bytes it did not produce in a URL and headers.
 *   2. `decode()`   — turns one wire response into {@link StreamChunk}s.
 *   3. `describeFailure()` — reads a provider's own error shape, optionally.
 *
 * It does not assemble blocks (the {@link import("../blockAssembler.js").BlockAssembler}
 * does, once, for every provider). It does not decide what is retryable (a
 * policy does). It does not read `process.env` for a key (the credential is
 * handed to it, resolved per request through the P3.0 seam). It does not write
 * evidence. Every one of those is a decision that must be identical across
 * providers, and the way to make it identical is to give the adapter no place to
 * put a different one.
 *
 * NOTE ON THE NAME. `src/adapters/**` is an unrelated, older concept in this
 * tree — external agent runtimes such as `claudeCli`, with their own registry,
 * catalog and CLI. Nothing here extends it, and the two must not be conflated:
 * that one wraps somebody else's agent, this one speaks a model provider's wire
 * format.
 */
import type { StreamChunk } from "../streamChunk.js";
import type { HttpRequest, HttpResponse } from "./transport.js";

/** Everything an adapter needs to address one dispatch. */
export interface AdapterEnvelopeInput {
  /** Route origin, without a trailing slash. The adapter appends its own path. */
  readonly baseUrl: string;
  /** The model, for adapters whose URL carries it. The BODY already names it. */
  readonly model: string;
  /**
   * The exact bytes a signed `request/header` row committed to.
   *
   * Transmit verbatim. Appending, re-serialising or "fixing" them breaks the
   * commitment and turns a later derivation into a false tamper alarm.
   */
  readonly body: Buffer;
  /**
   * The credential value, resolved for THIS request through the credentials
   * seam, or null when the route configures none.
   *
   * Null is legitimate: a local model server has no key, and requiring a
   * reference that resolves to nothing would mean recording a credential the
   * deployment does not have. What is never legitimate is an adapter reading
   * one from anywhere else.
   */
  readonly credential: string | null;
  /** Route-pinned headers — an agent id, a tenant, an API version override. */
  readonly extraHeaders: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

/**
 * What an adapter can add to a failure the runtime already classified.
 *
 * Every field is optional and every field is a REFINEMENT. The runtime decides
 * the code from the HTTP status first, so 429 means `RATE_LIMIT` for every
 * provider whether or not its adapter has an opinion; an adapter may narrow
 * that (a 429 whose body says the account is out of credit is `QUOTA`) but the
 * baseline classification does not depend on it having done so.
 */
export interface AdapterFailureHint {
  readonly message?: string;
  readonly code?: string;
  readonly requestId?: string;
  readonly providerRetryAfterMs?: number;
}

/** What the adapter is shown of a non-2xx response. */
export interface AdapterFailureInput {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** The error body, already read and bounded. */
  readonly bodyText: string;
}

/**
 * One provider's wire format.
 *
 * `id` and `version` are recorded on every settlement row, so a stream that
 * decoded strangely can be attributed to a specific adapter build rather than to
 * "the LLM seam". `version` moves when the DECODING changes in a way that could
 * alter the blocks a stream produces — it is the same discipline
 * `RequestEncoder.version` applies to the send half.
 */
export interface LlmAdapter {
  readonly id: string;
  readonly version: number;
  /**
   * The encoder whose output this adapter transmits.
   *
   * Declared rather than assumed so the runtime can REFUSE a route that pairs an
   * Anthropic adapter with an OpenAI body. Sending a well-formed request of the
   * wrong shape is a 400 that looks like a model problem, and the mismatch is
   * cheap to catch at registration.
   */
  readonly encoderId: string;
  readonly encoderVersion: number;

  /**
   * Refuse a request this adapter cannot carry, BEFORE anything durable exists.
   *
   * Optional, and deliberately a refusal rather than a fixer: an adapter that
   * repaired params would produce bytes the caller did not ask for, and a
   * `request/header` row would then commit to a request nobody wrote. Called by
   * the runtime before the request is encoded or logged, so a refusal costs
   * nothing durable.
   *
   * The case that motivates it: `anthropic-messages@1` does not set `stream`
   * itself, so a caller who omits it gets a plain JSON response that the
   * streaming decoder can only report, sixty seconds later, as a connection that
   * ended early. Refusing up front turns that into one clear sentence.
   */
  assertParams?(params: Record<string, unknown>): void;

  envelope(input: AdapterEnvelopeInput): HttpRequest;

  /**
   * Decode one successful response into chunks.
   *
   * May throw: a malformed frame is a real failure and the runtime turns it into
   * a typed terminal failure with a durable row. What it must NOT do is silently
   * skip a frame it does not understand, because a silently skipped `usage`
   * frame becomes a signed row claiming a step cost nothing.
   */
  decode(response: HttpResponse): AsyncIterable<StreamChunk>;

  describeFailure?(input: AdapterFailureInput): AdapterFailureHint;
}
