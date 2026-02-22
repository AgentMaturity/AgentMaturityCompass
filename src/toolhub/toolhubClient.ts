import { randomUUID } from "node:crypto";
import { withCircuitBreaker } from "../ops/circuitBreaker.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function retryConfig(): {
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
} {
  return {
    timeoutMs: parsePositiveInt(process.env.AMC_TOOLHUB_HTTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: parsePositiveInt(process.env.AMC_TOOLHUB_HTTP_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: parsePositiveInt(process.env.AMC_TOOLHUB_HTTP_RETRY_BASE_DELAY_MS, DEFAULT_RETRY_BASE_DELAY_MS)
  };
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "CircuitOpenError") {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("network")
  );
}

function backoffMs(baseDelayMs: number, attempt: number): number {
  const factor = Math.pow(2, Math.max(0, attempt - 1));
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.floor(baseDelayMs * factor * jitter);
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function postWithPolicy(params: {
  endpoint: string;
  lease: string;
  body: Record<string, unknown>;
  circuitName: string;
  maxRetriesOverride?: number;
}): Promise<{ status: number; body: string }> {
  const config = retryConfig();
  const payload = JSON.stringify(params.body);
  const configuredRetries =
    params.maxRetriesOverride !== undefined
      ? Math.max(0, Math.floor(params.maxRetriesOverride))
      : config.maxRetries;
  const totalAttempts = configuredRetries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await withCircuitBreaker(
        params.circuitName,
        () =>
          fetch(params.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-amc-lease": params.lease,
              "x-amc-request-id": randomUUID()
            },
            body: payload,
            signal: AbortSignal.timeout(config.timeoutMs)
          }),
        { timeoutMs: config.timeoutMs + 1000 }
      );

      if (attempt < totalAttempts && shouldRetryStatus(response.status)) {
        try {
          await response.body?.cancel();
        } catch {
          // best effort cleanup before retrying
        }
        await sleep(backoffMs(config.retryBaseDelayMs, attempt));
        continue;
      }

      return {
        status: response.status,
        body: await response.text()
      };
    } catch (error) {
      lastError = error;
      if (attempt < totalAttempts && isRetriableError(error)) {
        await sleep(backoffMs(config.retryBaseDelayMs, attempt));
        continue;
      }
      throw error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("toolhub request failed"));
}

export async function postToolIntent(params: {
  studioBaseUrl: string;
  lease: string;
  body: Record<string, unknown>;
}): Promise<{ status: number; body: string }> {
  return postWithPolicy({
    endpoint: `${params.studioBaseUrl}/toolhub/intent`,
    lease: params.lease,
    body: params.body,
    circuitName: "toolhub:intent",
    maxRetriesOverride: parsePositiveInt(process.env.AMC_TOOLHUB_INTENT_MAX_RETRIES, DEFAULT_MAX_RETRIES)
  });
}

export async function postToolExecute(params: {
  studioBaseUrl: string;
  lease: string;
  body: Record<string, unknown>;
}): Promise<{ status: number; body: string }> {
  return postWithPolicy({
    endpoint: `${params.studioBaseUrl}/toolhub/execute`,
    lease: params.lease,
    body: params.body,
    circuitName: "toolhub:execute",
    maxRetriesOverride: process.env.AMC_TOOLHUB_EXECUTE_MAX_RETRIES
      ? parsePositiveInt(process.env.AMC_TOOLHUB_EXECUTE_MAX_RETRIES, 0)
      : 0
  });
}
