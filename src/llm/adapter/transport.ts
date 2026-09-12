/**
 * The HTTP seam every AMC LLM adapter dispatches through.
 *
 * WHY A SEAM AND NOT `fetch`. Two reasons, and only one of them is testing.
 *
 * The first is that a governed harness must be able to prove what it sent
 * without a network. VERIFY-4 asks for a forced 429; an adapter that reached
 * for the global `fetch` could only be tested by standing up a server or by
 * monkey-patching a global, and both make the test a statement about the test
 * harness rather than about the adapter.
 *
 * The second is that AMC's egress allowlist (P4.3) and its sandbox network
 * layer need one chokepoint to wrap. A seam that exists from the start is a
 * seam nobody has to retrofit through nine call sites later.
 *
 * WHAT AN ADAPTER MAY NOT DO HERE. It may not build the request body. The body
 * is the exact `PreparedRequest.toBytes()` buffer, and it arrives already
 * committed to by a signed `request/header` row. An adapter that could rewrite
 * it could make the transmitted bytes disagree with the signed digest, which is
 * precisely the property VERIFY-3 exists to guarantee. So {@link HttpRequest}
 * carries `body` as a `Buffer` the adapter receives rather than produces, and
 * the runtime is what puts it there.
 */

/** One outbound request. `body` is transmitted verbatim. */
export interface HttpRequest {
  readonly url: string;
  readonly method: "POST";
  /** Header names are lowercase by convention so a duplicate cannot hide behind case. */
  readonly headers: Readonly<Record<string, string>>;
  /** The exact bytes a signed `request/header` row committed to. */
  readonly body: Buffer;
  readonly signal?: AbortSignal;
  /** Opt-in for protocols carrying a custom credential header. */
  readonly redirect?: "error";
  readonly cancelBodyOnReturn?: true;
}

/**
 * One inbound response.
 *
 * `body` is an async iterable rather than a string because the success path is
 * a live token stream: buffering it would delete the streaming behaviour this
 * whole seam exists to carry. Error bodies are small and get read whole by
 * {@link readBodyText}.
 */
export interface HttpResponse {
  readonly status: number;
  /** Lowercased header names; repeated headers already joined by the transport. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
  /** Opt-in disposal even when a decoder refuses before reading the body. */
  readonly close?: () => Promise<void>;
}

/**
 * How a request becomes a response.
 *
 * A plain function type, not an interface with a method, so a test stub is a
 * closure and a production transport is a module-level constant. Rejections are
 * classified as transport failures by the runtime; a transport must not invent
 * a `Response` for a connection that never happened.
 */
export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** How much of an error body is worth reading before giving up on it. */
const MAX_ERROR_BODY_BYTES = 64 * 1024;

/**
 * Read a whole body as UTF-8, bounded.
 *
 * Bounded because this runs on the error path, where the remote end is by
 * definition not behaving as expected: an unbounded read of a hostile or
 * malfunctioning response is how an error handler becomes the outage. What is
 * read is enough to classify the failure and to quote it in a durable row.
 */
export async function readBodyText(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.byteLength;
    if (total >= MAX_ERROR_BODY_BYTES) break;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8").slice(0, MAX_ERROR_BODY_BYTES);
}

/** Lowercase every header name so lookups need no case dance. */
function lowercaseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/**
 * A body that yields nothing.
 *
 * `fetch` gives `null` for a 204 or a HEAD, and every consumer here iterates.
 * One empty iterable beats a null check at each of them.
 */
async function* emptyBody(): AsyncIterable<Uint8Array> {
  // Intentionally yields nothing.
}

async function* readableToIterable(stream: ReadableStream<Uint8Array>, cancelOnReturn = false): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  let ended = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { ended = true; return; }
      if (value !== undefined) yield value;
    }
  } finally {
    if (cancelOnReturn && !ended) {
      try { await reader.cancel(); } catch { /* retain the original decoder/abort outcome */ }
    }
    // Releasing matters on the abort path: a reader still holding the lock
    // keeps the underlying socket from being reclaimed for the life of the
    // process, and a cancelled turn is exactly when that happens.
    reader.releaseLock();
  }
}

/**
 * The production transport: the platform's `fetch`.
 *
 * Kept deliberately thin. Everything interesting — status classification, retry
 * policy, evidence — happens above it, so this stays a shape adapter and never
 * becomes a place where behaviour hides.
 */
export const fetchTransport: HttpTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: { ...request.headers },
    // A Buffer is a Uint8Array; passing the view directly avoids a copy of what
    // may be a large request body.
    body: new Uint8Array(request.body),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.redirect === undefined ? {} : { redirect: request.redirect })
  });
  return {
    status: response.status,
    headers: lowercaseHeaders(response.headers),
    body: response.body === null ? emptyBody() : readableToIterable(response.body, request.cancelBodyOnReturn === true),
    ...(request.cancelBodyOnReturn !== true ? {} : { close: async () => {
      if (response.body !== null && !response.body.locked) {
        try { await response.body.cancel(); } catch { /* completed/aborted bodies have nothing left to close */ }
      }
    } })
  };
};

/**
 * Build a body iterable from complete strings — the shape a stub upstream wants.
 *
 * Exported from the production module rather than a test helper because a stub
 * upstream is also how AMC's own gateway-as-provider is exercised offline, and a
 * helper that only tests can reach tends to drift from what production does.
 */
export function bodyFromChunks(chunks: readonly string[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) {
      yield new Uint8Array(Buffer.from(chunk, "utf8"));
    }
  })();
}
