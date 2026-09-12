import { createHash } from "node:crypto";

/** Hard bounds apply to a logical request/stream, including all of its recoveries. */
export const NATIVE_MCP_RECONNECT_LIMITS = Object.freeze({
  retries: 3, initialDelayMs: 250, maxBackoffMs: 4000, totalWaitMs: 10_000,
  connectionTimeoutMs: 10_000, eventIds: 1024, eventIdBytes: 1024
});

export type NativeMcpHttpFailureCode = "REFUSED" | "AUTH_REQUIRED" | "SESSION_EXPIRED"
  | "SESSION_CHANGED" | "RETRY_EXHAUSTED" | "CANCELLED" | "TIMED_OUT"
  | "STREAM_NOT_RESUMABLE" | "PROTOCOL_ERROR" | "BOUND_EXCEEDED" | "CLOSED" | "NOT_DISPATCHED";

/** Only fixed local diagnostics belong in this error, never network error text. */
export class NativeMcpHttpRefused extends Error {
  constructor(
    message = "MCP HTTP connection refused; review the pinned endpoint and reconnect explicitly.",
    readonly code: NativeMcpHttpFailureCode = "REFUSED"
  ) { super(message); this.name = "NativeMcpHttpRefused"; }
}

/** Private classification: the original fetch/reader error is deliberately discarded. */
export class NativeMcpReconnectTransient extends Error {
  constructor(readonly timedOut = false) {
    super("MCP HTTP connection interrupted."); this.name = "NativeMcpReconnectTransient";
  }
}

export function nativeMcpAbortFailure(): NativeMcpHttpRefused {
  return new NativeMcpHttpRefused("MCP HTTP operation cancelled; no recovery will be attempted.", "CANCELLED");
}

export function nativeMcpRetryableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

/** Untrusted retry hints are minimum waits, not permission to exceed local bounds. */
export function nativeMcpRetryAfter(value: string | null, now = Date.now()): number {
  if (value === null) return 0;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // Do not interpret arbitrary numeric strings as implementation-dependent dates.
  if (!/^[A-Za-z]{3}, /.test(text)) return 0;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function nativeMcpWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(nativeMcpAbortFailure()); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(nativeMcpAbortFailure()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Interrupt a shared readiness wait without cancelling another caller's promise. */
export function nativeMcpWaitFor(promise: Promise<void>, signals: readonly (AbortSignal | undefined)[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    const cleanup = () => { for (const signal of present) signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(nativeMcpAbortFailure()); };
    if (present.some(signal => signal.aborted)) { abort(); return; }
    for (const signal of present) signal.addEventListener("abort", abort, { once: true });
    promise.then(() => { cleanup(); resolve(); }, () => { cleanup(); reject(nativeMcpAbortFailure()); });
  });
}

export class NativeMcpReconnectBudget {
  private retries = 0;
  private waited = 0;
  constructor(private readonly signal: AbortSignal, private readonly deadline: number) {}

  async wait(minimumDelayMs = 0): Promise<void> {
    if (this.signal.aborted) throw nativeMcpAbortFailure();
    const delay = Math.max(minimumDelayMs, Math.min(NATIVE_MCP_RECONNECT_LIMITS.maxBackoffMs,
      NATIVE_MCP_RECONNECT_LIMITS.initialDelayMs * 2 ** this.retries));
    if (this.retries >= NATIVE_MCP_RECONNECT_LIMITS.retries || !Number.isFinite(delay) || delay < 0
      || this.waited + delay > NATIVE_MCP_RECONNECT_LIMITS.totalWaitMs || Date.now() + delay >= this.deadline) {
      throw new NativeMcpHttpRefused("MCP HTTP recovery budget exhausted; review and mount again. No tool call was replayed.", "RETRY_EXHAUSTED");
    }
    this.retries++; this.waited += delay;
    await nativeMcpWait(delay, this.signal);
  }
}

/** A response keeps its abort linkage until its body is consumed or cancelled. */
export interface NativeMcpResponseLease {
  readonly response: Response;
  release(): void;
  cancel(): void;
}

/** Mount-local cursor ownership prevents replay across concurrent response streams. */
export class NativeMcpReconnectCursors {
  private readonly seen = new Map<string, { stream: number; digest: string }>();

  accept(id: string, stream: number, event: string, data: string): boolean {
    if (!/^[\x21-\x7e]+$/.test(id) || Buffer.byteLength(id) > NATIVE_MCP_RECONNECT_LIMITS.eventIdBytes) {
      throw new NativeMcpHttpRefused("MCP HTTP stream has an unsupported or oversized event cursor.", "PROTOCOL_ERROR");
    }
    const digest = createHash("sha256").update(JSON.stringify([event, data])).digest("hex");
    const previous = this.seen.get(id);
    if (previous) {
      if (previous.stream !== stream || previous.digest !== digest) {
        throw new NativeMcpHttpRefused("MCP HTTP event cursor changed content or crossed response streams; review and mount again.", "PROTOCOL_ERROR");
      }
      return false;
    }
    if (this.seen.size >= NATIVE_MCP_RECONNECT_LIMITS.eventIds) {
      throw new NativeMcpHttpRefused("MCP HTTP event-cursor limit exceeded; review and mount again.", "BOUND_EXCEEDED");
    }
    this.seen.set(id, { stream, digest });
    return true;
  }

}
