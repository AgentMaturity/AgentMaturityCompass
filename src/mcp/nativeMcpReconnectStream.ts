import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  NativeMcpHttpRefused, nativeMcpAbortFailure,
  type NativeMcpReconnectBudget, type NativeMcpReconnectCursors, type NativeMcpResponseLease
} from "./nativeMcpReconnect.js";

interface SseFrame { id?: string; event: string; data: string }

/** Keep incomplete UTF-8, lines and events private until an entire SSE frame arrives. */
export class SseFrames {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private line = "";
  private skipLf = false;
  private id?: string;
  private event = "message";
  private data: string[] = [];
  constructor(private readonly onRetry: (milliseconds: number) => void) {}

  feed(bytes: Uint8Array): SseFrame[] {
    let text: string;
    try { text = this.decoder.decode(bytes, { stream: true }); }
    catch { throw new NativeMcpHttpRefused("MCP HTTP stream contains invalid UTF-8.", "PROTOCOL_ERROR"); }
    const frames: SseFrame[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      if (this.skipLf) {
        this.skipLf = false;
        if (char === "\n") { start = i + 1; continue; }
      }
      if (char !== "\r" && char !== "\n") continue;
      this.line += text.slice(start, i);
      this.consumeLine(frames);
      this.line = ""; start = i + 1; this.skipLf = char === "\r";
    }
    this.line += text.slice(start);
    return frames;
  }

  private consumeLine(frames: SseFrame[]): void {
    if (!this.line) {
      frames.push({ id: this.id, event: this.event, data: this.data.join("\n") });
      this.id = undefined; this.event = "message"; this.data = [];
      return;
    }
    if (this.line.startsWith(":")) return;
    const colon = this.line.indexOf(":");
    const field = colon < 0 ? this.line : this.line.slice(0, colon);
    let value = colon < 0 ? "" : this.line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "id") this.id = value;
    else if (field === "event") this.event = value || "message";
    // SSE retry takes effect when its line is parsed, even without a final blank line.
    else if (field === "retry" && /^\d+$/.test(value)) this.onRetry(Number(value));
  }
}

export interface NativeMcpRecoverableStreamOptions {
  readonly first: NativeMcpResponseLease;
  readonly streamId: number;
  readonly requestId?: string | number;
  readonly signal: AbortSignal;
  readonly budget: NativeMcpReconnectBudget;
  readonly cursors: NativeMcpReconnectCursors;
  readonly responseByteLimit: number;
  readonly recoveryTimeoutMs: number;
  /** Charges even discarded partial frames and duplicate events to the mount budget. */
  readonly charge: (bytes: number) => void;
  readonly resume: (cursor: string, minimumDelayMs: number) => Promise<NativeMcpResponseLease>;
  readonly onGap: () => void;
  readonly onRecovered: () => void;
  /** Latch revocation before releasing recovery waiters or SDK delivery microtasks. */
  readonly onCatalogChanged: () => void;
  readonly cleanup: () => void;
  readonly onFailure: (error: unknown) => NativeMcpHttpRefused;
}

/**
 * Recovery is GET-only and retains the original request id, session, deadline and
 * credential snapshot. The SDK sees complete frames without private id/retry
 * fields: its separate reconnect timers and response-id remapping stay disabled.
 */
export function nativeMcpRecoverableStream(options: NativeMcpRecoverableStreamOptions): ReadableStream<Uint8Array> {
  let lease = options.first;
  let reader = lease.response.body?.getReader();
  let serverRetry = 0;
  let frames = new SseFrames(value => { serverRetry = value; });
  let responseBytes = 0;
  let cursor: string | undefined;
  let resumable = false;
  let finished = false;
  let recovering = false;
  let responseReceived = false;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let target: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const cleanup = () => {
    clearTimeout(recoveryTimer);
    options.signal.removeEventListener("abort", abort);
    lease.cancel();
    void reader?.cancel().catch(() => {});
    options.cleanup();
  };
  const fail = (error: unknown) => {
    if (finished) return;
    finished = true;
    // Close the mount before exposing an error to the SDK's stream processor.
    const safe = options.onFailure(error);
    cleanup(); target.error(safe);
  };
  const abort = () => fail(nativeMcpAbortFailure());

  const recover = async () => {
    if (options.signal.aborted) throw nativeMcpAbortFailure();
    if (!cursor || !resumable) {
      throw new NativeMcpHttpRefused("MCP HTTP stream ended without a safe event cursor; its outcome is unknown. Review and mount again; do not replay the tool call.", "STREAM_NOT_RESUMABLE");
    }
    recovering = true; options.onGap();
    clearTimeout(recoveryTimer);
    lease.cancel(); void reader?.cancel().catch(() => {});
    // Never join a partial frame or decoder state from two HTTP responses.
    frames = new SseFrames(value => { serverRetry = value; }); responseBytes = 0;
    await options.budget.wait(serverRetry);
    if (finished || options.signal.aborted) throw nativeMcpAbortFailure();
    lease = await options.resume(cursor, serverRetry);
    if (finished || options.signal.aborted) { lease.cancel(); throw nativeMcpAbortFailure(); }
    reader = lease.response.body?.getReader();
    if (!reader) throw new NativeMcpHttpRefused("MCP HTTP recovery did not return an SSE body.", "PROTOCOL_ERROR");
    // A 200 header without a complete frame does not establish stream recovery.
    // Interrupt this lease (not the logical request), then use the same retry budget.
    recoveryTimer = setTimeout(() => {
      if (!finished && recovering) { lease.cancel(); void reader?.cancel().catch(() => {}); }
    }, options.recoveryTimeoutMs);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      target = controller;
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.signal.aborted) abort();
    },
    async pull(controller) {
      try {
        while (!finished) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try { chunk = reader ? await reader.read() : { done: true, value: undefined }; }
          catch {
            if (finished) return;
            if (options.signal.aborted) throw nativeMcpAbortFailure();
            await recover(); continue;
          }
          if (finished) return;
          if (chunk.done) { await recover(); continue; }
          responseBytes += chunk.value.byteLength;
          options.charge(chunk.value.byteLength);
          if (responseBytes > options.responseByteLimit) {
            throw new NativeMcpHttpRefused("MCP HTTP response exceeds its size limit.", "BOUND_EXCEEDED");
          }
          const complete = frames.feed(chunk.value);
          let output = "";
          for (const frame of complete) {
            // A completed response is terminal; trailing request/response data is invalid.
            if (responseReceived && frame.data) {
              throw new NativeMcpHttpRefused("MCP HTTP stream sent data after its terminal response.", "PROTOCOL_ERROR");
            }
            let terminal = false;
            let catalogChanged = false;
            if (frame.event === "message" && frame.data) {
              let message: ReturnType<typeof JSONRPCMessageSchema.parse>;
              try { message = JSONRPCMessageSchema.parse(JSON.parse(frame.data)); }
              catch { throw new NativeMcpHttpRefused("MCP HTTP stream returned invalid protocol data.", "PROTOCOL_ERROR"); }
              if (!("method" in message)) {
                if (options.requestId === undefined || message.id !== options.requestId) {
                  throw new NativeMcpHttpRefused("MCP HTTP response crossed request streams; no response id was remapped.", "PROTOCOL_ERROR");
                }
                terminal = true;
              }
              else catalogChanged = message.method === "notifications/tools/list_changed";
            }
            if (frame.id !== undefined) {
              if (frame.id === "") { cursor = undefined; resumable = false; }
              else {
                if (!options.cursors.accept(frame.id, options.streamId, frame.event, frame.data)) continue;
                cursor = frame.id; resumable = true;
              }
            } else if (frame.data) {
              // A checkpoint before an already-delivered id-less event cannot deduplicate it.
              resumable = false;
            }
            if (catalogChanged) options.onCatalogChanged();
            if (frame.data && frame.event === "message") {
              output += `event: message\n${frame.data.split("\n").map(line => `data: ${line}\n`).join("")}\n`;
            }
            responseReceived ||= terminal;
          }
          if (recovering && complete.length) { clearTimeout(recoveryTimer); recovering = false; options.onRecovered(); }
          if (output) controller.enqueue(encoder.encode(output));
          if (responseReceived) {
            finished = true; cleanup(); controller.close(); return;
          }
          if (output) return;
        }
      } catch (error) { fail(error); }
    },
    cancel() { if (!finished) { finished = true; cleanup(); } }
  });
}
