/** Per-route bounds for headers, the first body byte, and subsequent body bytes. */
import { setImmediate } from "node:timers/promises";
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "./transport.js";

export interface LlmStreamTimeouts {
  /** Includes DNS, connection, TLS and waiting for response headers. */
  readonly connectTimeoutMs: number;
  readonly firstByteTimeoutMs: number;
  readonly streamIdleTimeoutMs: number;
}

export const DEFAULT_STREAM_TIMEOUTS: LlmStreamTimeouts = Object.freeze({
  connectTimeoutMs: 30_000,
  firstByteTimeoutMs: 60_000,
  streamIdleTimeoutMs: 300_000
});

/** Reject invalid timers rather than letting Node clamp them to one millisecond. */
export function resolveStreamTimeouts(config: Partial<LlmStreamTimeouts>): LlmStreamTimeouts {
  const result = { ...DEFAULT_STREAM_TIMEOUTS };
  for (const key of Object.keys(result) as (keyof LlmStreamTimeouts)[]) {
    const value = config[key] === undefined ? result[key] : config[key];
    if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647) {
      throw new Error(`${key} must be an integer from 1 through 2147483647`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

/** Race each pending operation without retaining an abort reaction per chunk. */
async function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel = () => {};
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      cancel = () => reject(signal.reason);
      if (signal.aborted) cancel();
      else signal.addEventListener("abort", cancel, { once: true });
    })]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/**
 * Bound injected transports as well as fetch. Racing the signal also settles a
 * noncooperative transport/body; aborting alone cannot guarantee that property.
 */
export async function dispatchWithTimeouts(
  transport: HttpTransport, request: HttpRequest, timeouts: LlmStreamTimeouts
): Promise<HttpResponse & { readonly assertActive: () => void }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: HttpResponse | undefined;
  let iterator: AsyncIterator<Uint8Array> | undefined;
  let failure: LlmError | undefined;
  let closed = false;
  const assertActive = () => { if (failure !== undefined) throw failure; };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  // Disposal must not wait for an iterator/transport that already ignored abort.
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimer();
    request.signal?.removeEventListener("abort", cancel);
    controller.abort(new LlmError("model stream closed", LLM_FAILURE_CODE.ABORTED));
    try { void Promise.resolve(iterator?.return?.()).catch(() => {}); } catch { /* retain the original outcome */ }
    try { void Promise.resolve(response?.close?.()).catch(() => {}); } catch { /* retain the original outcome */ }
  };
  const fail = (error: LlmError) => {
    failure ??= error;
    controller.abort(failure);
    void close();
  };
  const cancel = () => fail(new LlmError("request cancelled by the caller", LLM_FAILURE_CODE.ABORTED));
  const arm = (stage: "connect" | "first-byte" | "idle", ms: number) => {
    clearTimer();
    timer = setTimeout(() => fail(new LlmError(`model stream ${stage} timeout after ${ms}ms`, LLM_FAILURE_CODE.TIMEOUT)), ms);
  };
  if (request.signal?.aborted) cancel();
  else request.signal?.addEventListener("abort", cancel, { once: true });
  try {
    assertActive();
    arm("connect", timeouts.connectTimeoutMs);
    const pending = transport({ ...request, signal: controller.signal, cancelBodyOnReturn: true }).then((received) => {
      // Capture before the awaiting continuation: caller cancellation can race
      // that continuation. A response arriving after close still needs disposal.
      response = received;
      if (closed) { try { void Promise.resolve(received.close?.()).catch(() => {}); } catch { /* already failed */ } }
      return received;
    });
    response = await abortable(pending, controller.signal);
    assertActive();
    arm("first-byte", timeouts.firstByteTimeoutMs);
    const received = response;
    return {
      ...received,
      close,
      assertActive,
      body: (async function* () {
        try {
          iterator = received.body[Symbol.asyncIterator]();
          for (;;) {
            assertActive();
            const next = await abortable(iterator.next(), controller.signal);
            assertActive();
            if (next.done) return;
            if (next.value.byteLength === 0) {
              // Empty chunks are not progress; let timers run even for a bad iterator.
              await setImmediate();
              continue;
            }
            arm("idle", timeouts.streamIdleTimeoutMs);
            yield next.value;
          }
        } finally {
          await close();
        }
      })()
    };
  } catch (error) {
    await close();
    throw error;
  }
}
