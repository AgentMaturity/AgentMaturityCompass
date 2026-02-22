import { logTrace } from "./traceLogger.js";
import { withCircuitBreaker } from "../ops/circuitBreaker.js";

export interface WrapFetchOptions {
  agentId: string;
  gatewayBaseUrl: string;
  injectHeaders?: Record<string, string>;
  forceBaseUrl: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryOnStatuses?: number[];
  retryNonIdempotent?: boolean;
  circuitName?: string;
}

export type FetchLike = typeof fetch;

function providerFromGatewayBase(gatewayBaseUrl: string): string {
  try {
    const parsed = new URL(gatewayBaseUrl);
    const segment = parsed.pathname.split("/").find((item) => item.length > 0);
    return segment ?? "unknown";
  } catch {
    return "unknown";
  }
}

function inputUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === "object" && input !== null && "url" in input) {
    const candidate = (input as { url?: unknown }).url;
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
}

function joinPath(basePath: string, incomingPath: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const incoming = incomingPath.startsWith("/") ? incomingPath : `/${incomingPath}`;
  if (!base || base === "/") {
    return incoming;
  }
  if (incoming.startsWith(`${base}/`) || incoming === base) {
    return incoming;
  }
  return `${base}${incoming}`;
}

function rewriteUrl(original: string, gatewayBaseUrl: string): string {
  const from = new URL(original);
  const gateway = new URL(gatewayBaseUrl);
  const rewritten = new URL(gateway.toString());
  rewritten.pathname = joinPath(gateway.pathname, from.pathname);
  rewritten.search = from.search;
  return rewritten.toString();
}

function mergeHeaders(input: HeadersInit | undefined, append: Record<string, string>): Headers {
  const headers = new Headers(input ?? {});
  for (const [key, value] of Object.entries(append)) {
    headers.set(key, value);
  }
  return headers;
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value ?? fallback);
  return rounded > 0 ? rounded : fallback;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method && init.method.trim().length > 0) {
    return init.method.toUpperCase();
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function isIdempotentMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "DELETE";
}

function hasReplayableBody(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof Request !== "undefined" && input instanceof Request && init?.body === undefined) {
    // Request bodies are streams and generally single-consume.
    return false;
  }
  const body = init?.body;
  if (body === undefined || body === null) {
    return true;
  }
  if (typeof body === "string" || body instanceof URLSearchParams) {
    return true;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    return true;
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return true;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return true;
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return true;
  }
  return false;
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  if (a.aborted) {
    return a;
  }
  if (b.aborted) {
    return b;
  }

  const controller = new AbortController();
  const onAbortA = () => controller.abort(a.reason);
  const onAbortB = () => controller.abort(b.reason);
  a.addEventListener("abort", onAbortA, { once: true });
  b.addEventListener("abort", onAbortB, { once: true });
  return controller.signal;
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  if (error.name === "CircuitOpenError") {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused")
  );
}

function shouldRetryStatus(status: number, retryOn: Set<number>): boolean {
  return retryOn.has(status);
}

function backoffDelayMs(baseDelayMs: number, attempt: number): number {
  const factor = Math.pow(2, Math.max(0, attempt - 1));
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.floor(baseDelayMs * factor * jitter);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    if (response.body) {
      await response.body.cancel();
    }
  } catch {
    // best-effort cancel to free sockets before retrying
  }
}

export function wrapFetch(originalFetch: FetchLike, opts: WrapFetchOptions): FetchLike {
  const providerId = providerFromGatewayBase(opts.gatewayBaseUrl);
  const timeoutMs = normalizePositiveInt(opts.timeoutMs, 30_000);
  const maxRetries = normalizePositiveInt(opts.maxRetries, 1);
  const retryBaseDelayMs = normalizePositiveInt(opts.retryBaseDelayMs, 250);
  const retryOn = new Set(opts.retryOnStatuses ?? [429, 500, 502, 503, 504]);
  const retryNonIdempotent = opts.retryNonIdempotent === true;
  const circuitName = opts.circuitName ?? `wrapFetch:${providerId}`;
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const incomingUrl = inputUrl(input);
    const finalUrl =
      opts.forceBaseUrl && incomingUrl
        ? rewriteUrl(incomingUrl, opts.gatewayBaseUrl)
        : input;

    const headers = mergeHeaders(init?.headers, {
      "x-amc-agent-id": opts.agentId,
      ...(process.env.AMC_LEASE ? { "x-amc-lease": process.env.AMC_LEASE } : {}),
      ...(process.env.AMC_WORKORDER_ID ? { "x-amc-workorder-id": process.env.AMC_WORKORDER_ID } : {}),
      ...(opts.injectHeaders ?? {})
    });
    const nextInit: RequestInit = {
      ...init,
      headers
    };
    const method = resolveMethod(input, nextInit);
    const retryableRequest =
      hasReplayableBody(input, nextInit) && (retryNonIdempotent || isIdempotentMethod(method));
    const totalAttempts = retryableRequest ? maxRetries + 1 : 1;

    logTrace({
      agentId: opts.agentId,
      event: "llm_call",
      providerId,
      note: typeof finalUrl === "string" ? finalUrl : incomingUrl ?? undefined
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const response = await withCircuitBreaker(
          circuitName,
          () =>
            originalFetch(finalUrl as RequestInfo | URL, {
              ...nextInit,
              signal: combineSignals(nextInit.signal, timeoutSignal)
            }),
          { timeoutMs: timeoutMs + 1000 }
        );

        if (attempt < totalAttempts && shouldRetryStatus(response.status, retryOn)) {
          await cancelResponseBody(response);
          await sleep(backoffDelayMs(retryBaseDelayMs, attempt));
          continue;
        }

        const requestId = response.headers.get("x-amc-request-id") ?? undefined;
        const receipt = response.headers.get("x-amc-receipt") ?? undefined;
        logTrace({
          agentId: opts.agentId,
          event: "llm_result",
          providerId,
          request_id: requestId,
          receipt,
          note: `status=${response.status};attempt=${attempt}`
        });
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < totalAttempts && isRetriableError(error)) {
          await sleep(backoffDelayMs(retryBaseDelayMs, attempt));
          continue;
        }
        logTrace({
          agentId: opts.agentId,
          event: "llm_result",
          providerId,
          note: `error=${error instanceof Error ? error.message : String(error)};attempt=${attempt}`
        });
        throw error;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error("wrapped fetch failed"));
  }) as FetchLike;
}
