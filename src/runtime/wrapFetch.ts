import { logTrace } from "./traceLogger.js";
import { withCircuitBreaker } from "../ops/circuitBreaker.js";
import type { SteerPipeline, SteerRequestContext, SteerResponseContext } from "../steer/index.js";
import { raceModels, type RaceOptions } from "../steer/race.js";
import {
  createLiquidStreamState,
  flushRemaining,
  ingestDelta,
  parseSSEDelta,
  type LiquidOptions,
} from "../steer/liquid.js";

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
  steerPipeline?: SteerPipeline;
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

function isTextEventStream(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("text/event-stream");
}

async function applyLiquidStreamingTransform(
  response: Response,
  liquidOptions: LiquidOptions,
): Promise<Response> {
  if (!response.body || !isTextEventStream(response)) {
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state = createLiquidStreamState();

  let pending = "";
  const transformedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          pending += decoder.decode(value, { stream: true });
          const parts = pending.split("\n\n");
          pending = parts.pop() ?? "";

          for (const part of parts) {
            const line = `${part}\n\n`;
            const delta = parseSSEDelta(line);
            if (delta === null) {
              if (line.trim() === "data: [DONE]") {
                const remainder = flushRemaining(state, liquidOptions);
                if (remainder) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: remainder })}\n\n`),
                  );
                }
                controller.enqueue(encoder.encode(line));
              } else {
                controller.enqueue(encoder.encode(line));
              }
              continue;
            }

            const flushed = ingestDelta(state, delta, liquidOptions);
            if (flushed) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: flushed })}\n\n`),
              );
            }
          }
        }

        if (pending) {
          const delta = parseSSEDelta(pending);
          if (delta !== null) {
            const flushed = ingestDelta(state, delta, liquidOptions);
            if (flushed) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: flushed })}\n\n`),
              );
            }
          } else {
            controller.enqueue(encoder.encode(pending));
          }
        }

        const remainder = flushRemaining(state, liquidOptions);
        if (remainder) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: remainder })}\n\n`),
          );
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(transformedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
    const rewrittenUrl =
      opts.forceBaseUrl && incomingUrl
        ? rewriteUrl(incomingUrl, opts.gatewayBaseUrl)
        : incomingUrl;

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
    const requestContext: SteerRequestContext = opts.steerPipeline
      ? await opts.steerPipeline.runRequest({
          agentId: opts.agentId,
          providerId,
          url: rewrittenUrl ?? incomingUrl ?? opts.gatewayBaseUrl,
          init: nextInit,
          metadata: {},
        })
      : {
          agentId: opts.agentId,
          providerId,
          url: rewrittenUrl ?? incomingUrl ?? opts.gatewayBaseUrl,
          init: nextInit,
          metadata: {},
        };
    const finalUrl = requestContext.url;
    const finalInit: RequestInit = {
      ...requestContext.init,
      headers: mergeHeaders(requestContext.init.headers, {
        "x-amc-agent-id": opts.agentId,
        ...(process.env.AMC_LEASE ? { "x-amc-lease": process.env.AMC_LEASE } : {}),
        ...(process.env.AMC_WORKORDER_ID ? { "x-amc-workorder-id": process.env.AMC_WORKORDER_ID } : {}),
        ...(opts.injectHeaders ?? {})
      })
    };

    // ── Race fan-out: if raceOptions tagged by createRaceStage, fan out ──
    const raceOptions = requestContext.metadata.raceOptions as RaceOptions | undefined;
    if (raceOptions && raceOptions.candidates.length > 0) {
      logTrace({
        agentId: opts.agentId,
        event: "llm_call",
        providerId,
        note: `race fan-out to ${raceOptions.candidates.length} candidates`
      });

      const raceResult = await raceModels(finalInit, raceOptions);

      // Find the winning candidate's full result to build a proper Response
      const winnerIdx = raceResult.candidates.findIndex(c => c.id === raceResult.winnerId);
      const winnerCandidate = raceOptions.candidates[winnerIdx >= 0 ? winnerIdx : 0]!;

      // Re-fetch the winner to get the actual Response object
      // (raceModels consumed the response bodies for scoring)
      const fetchWinner = await originalFetch(winnerCandidate.url, {
        ...finalInit,
        ...(winnerCandidate.headers ? { headers: mergeHeaders(finalInit.headers, winnerCandidate.headers) } : {}),
        ...(winnerCandidate.bodyOverrides && typeof finalInit.body === "string" ? {
          body: JSON.stringify({ ...JSON.parse(finalInit.body), ...winnerCandidate.bodyOverrides })
        } : {}),
      });

      logTrace({
        agentId: opts.agentId,
        event: "llm_result",
        providerId,
        note: `race winner=${raceResult.winnerId};score=${raceResult.winnerScore.composite.toFixed(3)};candidates=${raceResult.candidates.length}`
      });

      const liquidOptions = requestContext.metadata.liquidOptions as LiquidOptions | undefined;
      const raceResponse = liquidOptions
        ? await applyLiquidStreamingTransform(fetchWinner, liquidOptions)
        : fetchWinner;

      // Run response pipeline on the winner
      const responseContext: SteerResponseContext = opts.steerPipeline
        ? await opts.steerPipeline.runResponse({
            ...requestContext,
            response: raceResponse,
            metadata: {
              ...requestContext.metadata,
              raceResult,
            },
          })
        : {
            ...requestContext,
            response: raceResponse,
            metadata: {
              ...requestContext.metadata,
              raceResult,
            },
          };

      return responseContext.response;
    }
    // ── End race fan-out ────────────────────────────────────────────────

    const method = resolveMethod(input, finalInit);
    const retryableRequest =
      hasReplayableBody(input, finalInit) && (retryNonIdempotent || isIdempotentMethod(method));
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
              ...finalInit,
              signal: combineSignals(finalInit.signal ?? undefined, timeoutSignal)
            }),
          { timeoutMs: timeoutMs + 1000 }
        );

        if (attempt < totalAttempts && shouldRetryStatus(response.status, retryOn)) {
          await cancelResponseBody(response);
          await sleep(backoffDelayMs(retryBaseDelayMs, attempt));
          continue;
        }

        const liquidOptions = requestContext.metadata.liquidOptions as LiquidOptions | undefined;
        const maybeLiquidResponse = liquidOptions
          ? await applyLiquidStreamingTransform(response, liquidOptions)
          : response;

        const responseContext: SteerResponseContext = opts.steerPipeline
          ? await opts.steerPipeline.runResponse({
              ...requestContext,
              response: maybeLiquidResponse,
            })
          : {
              ...requestContext,
              response: maybeLiquidResponse,
            };
        const requestId = responseContext.response.headers.get("x-amc-request-id") ?? undefined;
        const receipt = responseContext.response.headers.get("x-amc-receipt") ?? undefined;
        logTrace({
          agentId: opts.agentId,
          event: "llm_result",
          providerId,
          request_id: requestId,
          receipt,
          note: `status=${responseContext.response.status};attempt=${attempt}`
        });
        return responseContext.response;
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
