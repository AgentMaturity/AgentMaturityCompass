import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isJSONRPCRequest, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  NativeMcpHttpRefused, NativeMcpReconnectTransient, NativeMcpReconnectBudget, NativeMcpReconnectCursors,
  NATIVE_MCP_RECONNECT_LIMITS, nativeMcpAbortFailure, nativeMcpRetryAfter, nativeMcpRetryableStatus,
  nativeMcpWaitFor, type NativeMcpHttpFailureCode, type NativeMcpResponseLease
} from "./nativeMcpReconnect.js";
import { nativeMcpRecoverableStream } from "./nativeMcpReconnectStream.js";

export { NativeMcpHttpRefused } from "./nativeMcpReconnect.js";

export interface NativeMcpHttpServer {
  readonly transport: "streamable-http";
  readonly id: string;
  readonly url: string;
  readonly origin: string;
  /** Private resolved values. Configuration files must use headerRefs instead. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Independent absolute lifetime for the optional notification channel, including recovery. */
  readonly notificationLifetimeMs?: number;
}

export const NATIVE_MCP_HTTP_LIMITS = Object.freeze({ responseBytes: 4 * 1024 * 1024,
  lifetimeBytes: 32 * 1024 * 1024, requests: 1024, notifications: 256, activeRequests: 8,
  defaultNotificationLifetimeMs: 8 * 60 * 60 * 1000, maxNotificationLifetimeMs: 24 * 60 * 60 * 1000 });

export function nativeMcpNotificationLifetime(value?: number): number {
  const duration = value ?? NATIVE_MCP_HTTP_LIMITS.defaultNotificationLifetimeMs;
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > NATIVE_MCP_HTTP_LIMITS.maxNotificationLifetimeMs) {
    throw new NativeMcpHttpRefused("MCP HTTP notificationLifetimeMs must be an integer from 1 through 86400000.");
  }
  return duration;
}

const CONTROL_HEADERS = new Set(["accept", "accept-encoding", "connection", "content-length", "content-type",
  "cookie", "host", "origin", "referer", "te", "trailer", "transfer-encoding", "upgrade", "user-agent",
  "mcp-session-id", "mcp-protocol-version", "last-event-id"]);

/** Origin and endpoint are explicit operator choices, never learned from a server. */
export function nativeMcpHttpEndpoint(url: string, origin: string): URL {
  let endpoint: URL;
  try { endpoint = new URL(url); }
  catch { throw new NativeMcpHttpRefused("MCP HTTP requires a valid absolute endpoint URL and its exact origin."); }
  if (typeof origin !== "string" || origin !== endpoint.origin || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || /[\x00-\x20\x7f]/.test(url) || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:"
        && ["127.0.0.1", "[::1]"].includes(endpoint.hostname)))) {
    throw new NativeMcpHttpRefused("MCP HTTP requires a pinned HTTPS origin (literal loopback HTTP is allowed for development), without URL credentials, query or fragment.");
  }
  return endpoint;
}

export function validateNativeMcpHeaderNames(names: readonly string[]): void {
  const normalized = names.map(name => name.toLowerCase());
  if (names.length > 32 || new Set(normalized).size !== names.length || names.some((name, i) =>
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || CONTROL_HEADERS.has(normalized[i]!)
    || /^(proxy-|sec-|content-)/.test(normalized[i]!))) {
    throw new NativeMcpHttpRefused("MCP header references contain duplicate, invalid or transport-controlled header names.");
  }
}

interface RequestScope {
  readonly controller: AbortController;
  readonly budget: NativeMcpReconnectBudget;
  readonly deadline: number;
  timedOut: boolean;
  networkTimedOut: boolean;
  cleanup(): void;
}

/** Never forward SDK/network diagnostics, which may contain headers or response bodies. */
export class NativeMcpHttpTransport implements Transport {
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  onmessage?: Transport["onmessage"];
  private readonly inner: StreamableHTTPClientTransport;
  private readonly endpoint: URL;
  private readonly headers: Headers;
  private readonly secrets: string[] = [];
  private readonly lifetime = new AbortController();
  private readonly cursors = new NativeMcpReconnectCursors();
  private readonly toolRequestIds = new Set<string | number>();
  private readonly controllers = new Set<AbortController>();
  private closePromise?: Promise<void>;
  private closing = false;
  private initialized = false;
  private initializeAttempted = false;
  private notificationStarted = false;
  private pinnedSession?: string;
  private requests = 0;
  private bytes = 0;
  private notifications = 0;
  private failure?: string;
  private failureKind?: NativeMcpHttpFailureCode;
  private timeoutFailure = false;
  private readonly notificationLifetime: number;
  private streamSequence = 0;
  private generation = 0;
  private catalogChanged = false;
  private notificationRecovery?: { promise: Promise<void>; resolve: () => void };
  private negotiatedProtocol?: string;

  constructor(server: NativeMcpHttpServer, private readonly timeout: number) {
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
      throw new NativeMcpHttpRefused("MCP timeout must be between 1 and 300000 milliseconds.");
    }
    this.notificationLifetime = nativeMcpNotificationLifetime(server.notificationLifetimeMs);
    this.endpoint = nativeMcpHttpEndpoint(server.url, server.origin);
    validateNativeMcpHeaderNames(Object.keys(server.headers ?? {}));
    this.headers = new Headers();
    let headerBytes = 0;
    for (const [name, value] of Object.entries(server.headers ?? {})) {
      if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value) || Buffer.byteLength(value) > 8192) {
        throw new NativeMcpHttpRefused("MCP header credentials must be nonempty bounded single-line values.");
      }
      headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
      this.headers.set(name, value);
      const wireValue = this.headers.get(name)!;
      this.secrets.push(value, wireValue);
      if (name.toLowerCase() === "authorization" && /^Bearer\s+/i.test(wireValue)) this.secrets.push(wireValue.replace(/^Bearer\s+/i, ""));
    }
    if (headerBytes > 16_384) throw new NativeMcpHttpRefused("MCP header credentials exceed the accepted size.");
    this.inner = new StreamableHTTPClientTransport(this.endpoint, {
      fetch: (url, init) => this.fetchPinned(url, init),
      reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 0, initialReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 }
      // No authProvider: authorization never enrolls a client or follows a challenge URL.
    });
    this.inner.onmessage = message => {
      if (this.closing) return;
      if ("method" in message && message.method === "notifications/tools/list_changed") this.catalogChanged = true;
      if ("method" in message && ++this.notifications > NATIVE_MCP_HTTP_LIMITS.notifications) {
        this.refuse(new NativeMcpHttpRefused("MCP HTTP server-message limit exceeded; review and mount again.", "BOUND_EXCEEDED")); return;
      }
      this.onmessage?.(message);
    };
    // Transient network failures never reach the SDK. Its own recovery remains
    // disabled: it otherwise owns unbounded/resettable and shared SSE timers.
    this.inner.onerror = error => this.refuse(error instanceof NativeMcpHttpRefused ? error : new NativeMcpHttpRefused(this.failure
      ?? "MCP HTTP disconnected or returned invalid protocol data; review and mount again.", this.failureKind ?? "PROTOCOL_ERROR"));
    this.inner.onclose = () => { try { this.onclose?.(); } catch { /* A consumer callback cannot prevent session cleanup. */ } };
  }

  get sessionId(): string | undefined { return this.pinnedSession; }
  get failureMessage(): string | undefined { return this.failure; }
  get failureCode(): NativeMcpHttpFailureCode | undefined { return this.failureKind; }
  get failureTimedOut(): boolean { return this.timeoutFailure; }
  get recoveryGeneration(): number { return this.generation; }

  /** Used by the catalog reader; it does not create a session or renew authority. */
  async waitForRecovery(signal?: AbortSignal): Promise<void> {
    if (this.closing || signal?.aborted) throw nativeMcpAbortFailure();
    if (this.catalogChanged) throw new NativeMcpHttpRefused("MCP tool catalog changed; review and mount again.", "NOT_DISPATCHED");
    if (!this.notificationRecovery) return;
    const timer = setTimeout(() => {
      this.timeoutFailure = true;
      this.refuse(new NativeMcpHttpRefused("MCP HTTP notification recovery timed out; review and mount again.", "TIMED_OUT"));
    }, this.timeout);
    try {
      while (this.notificationRecovery) {
        await nativeMcpWaitFor(this.notificationRecovery.promise, [signal, this.lifetime.signal]);
      }
    } finally { clearTimeout(timer); }
    if (this.closing || signal?.aborted) throw nativeMcpAbortFailure();
    if (this.catalogChanged) throw new NativeMcpHttpRefused("MCP tool catalog changed; review and mount again.", "NOT_DISPATCHED");
  }

  /** Redaction uses the actual immutable transport snapshot, not a mutable caller object. */
  redactString(text: string): string {
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) text = text.split(secret).join("[REDACTED]");
    return text;
  }

  containsSensitiveMaterial(json: string): boolean {
    return this.secrets.some(secret => json.includes(JSON.stringify(secret).slice(1, -1)));
  }

  setProtocolVersion(version: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(version) || (this.negotiatedProtocol !== undefined && version !== this.negotiatedProtocol)) {
      throw new NativeMcpHttpRefused("MCP HTTP protocol version changed; fresh review is required.", "PROTOCOL_ERROR");
    }
    this.negotiatedProtocol = version; this.inner.setProtocolVersion(version);
  }
  start(): Promise<void> {
    if (this.closing) return Promise.reject(new NativeMcpHttpRefused("MCP HTTP connection is closed.", "CLOSED"));
    return this.inner.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.closing) throw new NativeMcpHttpRefused("MCP HTTP connection is closed; no new request was dispatched.", "CLOSED");
    if (options?.resumptionToken !== undefined) {
      throw new NativeMcpHttpRefused("MCP HTTP external resumption requires an explicit fresh reviewed mount.", "NOT_DISPATCHED");
    }
    if ("method" in message && message.method === "tools/call" && this.catalogChanged) {
      throw new NativeMcpHttpRefused("MCP tool catalog changed; no new tool call was dispatched. Review and mount again.", "NOT_DISPATCHED");
    }
    if ("method" in message && message.method === "tools/call" && this.notificationRecovery) {
      throw new NativeMcpHttpRefused("MCP HTTP notification recovery is in progress; no new tool call was dispatched.", "NOT_DISPATCHED");
    }
    if (isJSONRPCRequest(message) && message.method === "tools/call") {
      if (this.toolRequestIds.has(message.id)) throw new NativeMcpHttpRefused("Duplicate MCP tool request id refused; no tool call was replayed.", "NOT_DISPATCHED");
      this.toolRequestIds.add(message.id);
    }
    try { await this.inner.send(message, options); }
    catch {
      // The SDK's thrown error is not necessarily the sanitized onerror value.
      throw new NativeMcpHttpRefused(this.failure ?? "MCP HTTP request failed; review and mount again.", this.failureKind);
    }
  }

  private refuse(error: NativeMcpHttpRefused): void {
    if (this.closing) return;
    this.failure ??= error.message;
    this.failureKind ??= error.code;
    // Set the close latch before calling user/SDK handlers that may reenter.
    const closing = this.close();
    void closing.catch(() => {});
    try { this.onerror?.(new NativeMcpHttpRefused(this.failure, this.failureKind)); }
    catch { /* Preserve the classified failure and complete shutdown despite consumer callbacks. */ }
  }

  private requestScope(init: RequestInit, notification: boolean): RequestScope {
    const controller = new AbortController(); this.controllers.add(controller);
    const duration = notification ? this.notificationLifetime : this.timeout;
    const deadline = Date.now() + duration;
    const abort = () => controller.abort();
    const cleanup = () => {
      clearTimeout(timer); init.signal?.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", cleanup); this.controllers.delete(controller);
    };
    const scope: RequestScope = { controller, deadline, cleanup, timedOut: false, networkTimedOut: false,
      budget: new NativeMcpReconnectBudget(controller.signal, deadline) };
    const timer = setTimeout(() => { scope.timedOut = true; controller.abort(); }, duration);
    controller.signal.addEventListener("abort", cleanup, { once: true });
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted || this.closing) controller.abort();
    return scope;
  }

  private failureFor(error: unknown, scope: RequestScope): NativeMcpHttpRefused {
    this.timeoutFailure ||= scope.timedOut || scope.networkTimedOut || (error instanceof NativeMcpReconnectTransient && error.timedOut);
    if (scope.timedOut) return new NativeMcpHttpRefused("MCP HTTP request or notification lifetime expired; recovery stopped.", "TIMED_OUT");
    if (error instanceof NativeMcpHttpRefused) return error;
    if (error instanceof NativeMcpReconnectTransient && error.timedOut) {
      return new NativeMcpHttpRefused("MCP HTTP connection timed out; review and mount again.", "TIMED_OUT");
    }
    return new NativeMcpHttpRefused("MCP HTTP connection failed; review the endpoint and credential references.");
  }

  private charge(bytes: number): void {
    this.bytes += bytes;
    if (this.bytes > NATIVE_MCP_HTTP_LIMITS.lifetimeBytes) {
      throw new NativeMcpHttpRefused("MCP HTTP connection byte limit exceeded; review and mount again.", "BOUND_EXCEEDED");
    }
  }

  private async fetchOnce(scope: RequestScope, method: string, headers: Headers, body?: string, initialize = false): Promise<NativeMcpResponseLease> {
    if (this.closing || scope.controller.signal.aborted) throw nativeMcpAbortFailure();
    if (++this.requests > NATIVE_MCP_HTTP_LIMITS.requests) {
      throw new NativeMcpHttpRefused("MCP HTTP request bound refused; review and mount again.", "BOUND_EXCEEDED");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    scope.controller.signal.addEventListener("abort", abort, { once: true });
    let openTimedOut = false;
    const timer = setTimeout(() => { openTimedOut = true; controller.abort(); },
      method === "GET" ? Math.min(this.timeout, NATIVE_MCP_RECONNECT_LIMITS.connectionTimeoutMs) : this.timeout);
    const release = () => { clearTimeout(timer); scope.controller.signal.removeEventListener("abort", abort); };
    let response: Response | undefined;
    const cancel = () => { release(); controller.abort(); void response?.body?.cancel().catch(() => {}); };
    try {
      // No challenge/redirect URL, ambient cookie, caller mutation or refreshed
      // credential can change this mount's endpoint and authorization snapshot.
      const pinned = new Headers(headers);
      this.headers.forEach((value, name) => pinned.set(name, value));
      pinned.set("origin", this.endpoint.origin);
      response = await fetch(this.endpoint, { method, headers: pinned, ...(body === undefined ? {} : { body }),
        signal: controller.signal, redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      clearTimeout(timer);
      if (scope.controller.signal.aborted || this.closing) throw nativeMcpAbortFailure();
      if (openTimedOut) throw new NativeMcpReconnectTransient(true);
      if (response.redirected || response.url !== this.endpoint.href || (response.status >= 300 && response.status < 400)) {
        throw new NativeMcpHttpRefused("MCP HTTP redirects or endpoint changes are refused; review the configured endpoint explicitly.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new NativeMcpHttpRefused("MCP HTTP authentication refused. Configure explicit headerRefs; automatic OAuth enrollment is not enabled.", "AUTH_REQUIRED");
      }
      if (response.status === 404) {
        throw new NativeMcpHttpRefused("MCP HTTP session expired or endpoint is absent; review and create a fresh mount.", "SESSION_EXPIRED");
      }
      const session = response.headers.get("mcp-session-id");
      if (session !== null && (!/^[\x21-\x7e]{1,256}$/.test(session)
        || (initialize ? !response.ok : session !== this.pinnedSession))) {
        throw new NativeMcpHttpRefused("MCP HTTP server changed its session identity; fresh review is required.", "SESSION_CHANGED");
      }
      if (initialize && response.ok) {
        this.initialized = true; this.pinnedSession = session ?? undefined;
        if (session) this.secrets.push(session);
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > NATIVE_MCP_HTTP_LIMITS.responseBytes) {
        throw new NativeMcpHttpRefused("MCP HTTP response exceeds its size limit.", "BOUND_EXCEEDED");
      }
      return { response, release, cancel };
    } catch (error) {
      cancel();
      if (scope.controller.signal.aborted) throw nativeMcpAbortFailure();
      if (error instanceof NativeMcpHttpRefused) throw error;
      throw new NativeMcpReconnectTransient(openTimedOut);
    }
  }

  private async open(scope: RequestScope, method: string, headers: Headers, body: string | undefined,
    replaySafe: boolean, initialize = false, optionalGet = false, minimumRetryMs = 0): Promise<NativeMcpResponseLease> {
    while (true) {
      let lease: NativeMcpResponseLease | undefined;
      try {
        lease = await this.fetchOnce(scope, method, headers, body, initialize);
        if (optionalGet && lease.response.status === 405) return lease;
        if (!lease.response.ok) {
          if (replaySafe && nativeMcpRetryableStatus(lease.response.status)) {
            const minimum = Math.max(minimumRetryMs, nativeMcpRetryAfter(lease.response.headers.get("retry-after")));
            lease.cancel(); await scope.budget.wait(minimum); continue;
          }
          throw new NativeMcpHttpRefused(`MCP HTTP request refused (HTTP ${lease.response.status}); review and mount again. No tool call was replayed.`);
        }
        return lease;
      } catch (error) {
        lease?.cancel();
        if (!(error instanceof NativeMcpReconnectTransient) || !replaySafe) throw error;
        try { await scope.budget.wait(minimumRetryMs); }
        catch (exhausted) { scope.networkTimedOut = error.timedOut; throw exhausted; }
      }
    }
  }

  private async readJson(lease: NativeMcpResponseLease, scope: RequestScope): Promise<Uint8Array> {
    const reader = lease.response.body?.getReader();
    if (!reader) throw new NativeMcpHttpRefused("MCP HTTP response body is missing.", "PROTOCOL_ERROR");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        if (scope.controller.signal.aborted) throw nativeMcpAbortFailure();
        const chunk = await reader.read();
        if (scope.controller.signal.aborted) throw nativeMcpAbortFailure();
        if (chunk.done) break;
        bytes += chunk.value.byteLength; this.charge(chunk.value.byteLength);
        if (bytes > NATIVE_MCP_HTTP_LIMITS.responseBytes) throw new NativeMcpHttpRefused("MCP HTTP response exceeds its size limit.", "BOUND_EXCEEDED");
        chunks.push(chunk.value);
      }
      lease.release(); return Buffer.concat(chunks, bytes);
    } catch (error) {
      lease.cancel(); void reader.cancel().catch(() => {});
      if (scope.controller.signal.aborted) throw nativeMcpAbortFailure();
      if (error instanceof NativeMcpHttpRefused) throw error;
      throw new NativeMcpReconnectTransient();
    } finally { reader.releaseLock(); }
  }

  private async fetchPinned(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? "GET";
    if (this.closing || String(url) !== this.endpoint.href || !["POST", "GET"].includes(method)
      || this.controllers.size >= NATIVE_MCP_HTTP_LIMITS.activeRequests) {
      throw new NativeMcpHttpRefused("MCP HTTP endpoint or request bound refused; review and mount again.");
    }
    let rpc: { method?: string; id?: string | number } = {};
    let body: string | undefined;
    if (method === "POST") {
      if (typeof init.body !== "string" || Buffer.byteLength(init.body) > 1024 * 1024) throw new NativeMcpHttpRefused("MCP HTTP request exceeds its size limit.");
      body = init.body;
      try { rpc = JSON.parse(body) as typeof rpc; }
      catch { throw new NativeMcpHttpRefused("MCP HTTP request is not valid JSON.", "PROTOCOL_ERROR"); }
      if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) throw new NativeMcpHttpRefused("MCP HTTP requires one JSON-RPC message.", "PROTOCOL_ERROR");
    }
    const initialize = rpc.method === "initialize";
    if (initialize) {
      if (this.initializeAttempted) throw new NativeMcpHttpRefused("MCP HTTP session renewal requires a fresh reviewed mount.");
      this.initializeAttempted = true;
    } else if (!this.initialized) throw new NativeMcpHttpRefused("MCP HTTP initialization is required before further requests.");
    if (method === "GET") {
      if (this.notificationStarted) throw new NativeMcpHttpRefused("MCP HTTP unbound stream reopening is refused.");
      this.notificationStarted = true;
    }
    const headers = new Headers(init.headers);
    if (headers.has("last-event-id") || (headers.get("mcp-session-id") ?? undefined) !== this.pinnedSession) {
      throw new NativeMcpHttpRefused("MCP HTTP session identity or external resumption changed; review and mount again.");
    }
    const scope = this.requestScope(init, method === "GET");
    // Server annotations and operator READ_ONLY grants never make tools/call
    // replayable. Only the protocol's fixed read/control methods are retried.
    const replaySafe = method === "GET" || (rpc.id !== undefined && (rpc.method === "tools/list" || rpc.method === "ping"));
    let lease: NativeMcpResponseLease | undefined;
    try {
      while (true) {
        lease = await this.open(scope, method, headers, body, replaySafe, initialize, method === "GET");
        const response = lease.response;
        if ((method === "GET" && response.status === 405) || (method === "POST" && rpc.id === undefined)) {
          lease.cancel(); scope.cleanup();
          return new Response(null, { status: response.status, headers: response.headers });
        }
        const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (response.status !== 200 || (mediaType !== "text/event-stream" && (method !== "POST" || mediaType !== "application/json"))) {
          throw new NativeMcpHttpRefused("MCP HTTP response has an unsupported status or content type.", "PROTOCOL_ERROR");
        }
        if (mediaType === "text/event-stream") {
          if (!response.body) throw new NativeMcpHttpRefused("MCP HTTP SSE response body is missing.", "PROTOCOL_ERROR");
          const stream = nativeMcpRecoverableStream({ first: lease, streamId: ++this.streamSequence, requestId: rpc.id,
            signal: scope.controller.signal, budget: scope.budget, cursors: this.cursors,
            responseByteLimit: NATIVE_MCP_HTTP_LIMITS.responseBytes, charge: bytes => this.charge(bytes),
            recoveryTimeoutMs: Math.min(this.timeout, NATIVE_MCP_RECONNECT_LIMITS.connectionTimeoutMs),
            resume: async (cursor, minimumRetryMs) => {
              const resumed = new Headers({ accept: "text/event-stream", "last-event-id": cursor });
              if (this.pinnedSession) resumed.set("mcp-session-id", this.pinnedSession);
              if (this.inner.protocolVersion) resumed.set("mcp-protocol-version", this.inner.protocolVersion);
              const next = await this.open(scope, "GET", resumed, undefined, true, false, false, minimumRetryMs);
              if (next.response.status !== 200 || next.response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "text/event-stream") {
                next.cancel(); throw new NativeMcpHttpRefused("MCP HTTP recovery requires the original SSE stream.", "PROTOCOL_ERROR");
              }
              return next;
            },
            onGap: () => {
              if (method !== "GET" || this.notificationRecovery) return;
              this.generation++;
              let resolve!: () => void;
              const promise = new Promise<void>(done => { resolve = done; });
              this.notificationRecovery = { promise, resolve };
            },
            onRecovered: () => {
              if (method !== "GET") return;
              const pending = this.notificationRecovery; this.notificationRecovery = undefined; pending?.resolve();
            },
            onCatalogChanged: () => { this.catalogChanged = true; },
            cleanup: () => { scope.cleanup(); scope.controller.abort(); },
            onFailure: error => { const safe = this.failureFor(error, scope); this.refuse(safe); return safe; }
          });
          const streamHeaders = new Headers(response.headers); streamHeaders.delete("content-length");
          return new Response(stream, { status: 200, headers: streamHeaders });
        }
        try {
          const bytes = await this.readJson(lease, scope);
          scope.cleanup(); return new Response(Buffer.from(bytes), { status: 200, headers: response.headers });
        } catch (error) {
          if (!(error instanceof NativeMcpReconnectTransient) || !replaySafe) throw error;
          await scope.budget.wait();
        }
      }
    } catch (error) {
      lease?.cancel(); scope.cleanup(); scope.controller.abort();
      const safe = this.failureFor(error, scope); this.refuse(safe); throw safe;
    }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    // Assign before inner.close invokes callbacks that may reenter this method.
    this.closePromise = Promise.resolve().then(async () => {
      await this.inner.close();
      if (!this.pinnedSession) return;
      const headers = new Headers(this.headers); headers.set("origin", this.endpoint.origin);
      headers.set("mcp-session-id", this.pinnedSession);
      if (this.inner.protocolVersion) headers.set("mcp-protocol-version", this.inner.protocolVersion);
      try {
        const response = await fetch(this.endpoint, { method: "DELETE", headers, redirect: "manual", credentials: "omit",
          referrerPolicy: "no-referrer", signal: AbortSignal.timeout(Math.min(this.timeout, 3000)) });
        await response.body?.cancel();
        if (response.redirected || response.url !== this.endpoint.href || (!response.ok && ![404, 405].includes(response.status))) {
          throw new Error("termination refused");
        }
      } catch { throw new NativeMcpHttpRefused("MCP HTTP local connection closed, but remote session termination could not be confirmed."); }
      finally { this.pinnedSession = undefined; }
    });
    this.lifetime.abort();
    for (const controller of this.controllers) controller.abort();
    return this.closePromise;
  }
}
