import { checkScopedEgress, EgressBlocked } from "../residency/checkEgress.js";

export interface PreparedTelemetryRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: string;
  workspace: string | undefined;
  run<T>(callback: () => T): T;
}

export interface TelemetryDispatchOptions {
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused")
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

export async function dispatchTelemetryRequest(
  request: PreparedTelemetryRequest,
  options: TelemetryDispatchOptions
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const endpoint = request.endpoint;
  const headers = { ...request.headers };
  const body = request.body;
  const workspace = request.workspace;
  const run = request.run;
  const timeoutMs = options.timeoutMs;
  const maxRetries = options.maxRetries;
  const retryBaseDelayMs = options.retryBaseDelayMs;
  const totalAttempts = maxRetries + 1;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const init: RequestInit = {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual"
      };
      const response = await run(() => {
        checkScopedEgress(workspace, "network-tool", endpoint, { dataClasses: null, purpose: null, agentId: "system" });
        return fetch(endpoint, init);
      });
      if (attempt < totalAttempts && isRetryableStatus(response.status)) {
        try {
          await response.body?.cancel();
        } catch {
          // best effort cleanup before retry
        }
        await sleep(backoffMs(retryBaseDelayMs, attempt));
        continue;
      }
      return {
        ok: response.ok,
        status: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      if (error instanceof EgressBlocked) {
        return { ok: false, error: error.message };
      }
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < totalAttempts && isRetryableError(error)) {
        await sleep(backoffMs(retryBaseDelayMs, attempt));
        continue;
      }
      break;
    }
  }

  return { ok: false, error: lastError ?? "dispatch failed" };
}
