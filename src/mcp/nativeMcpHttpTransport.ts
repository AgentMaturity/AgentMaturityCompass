import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export interface NativeMcpHttpServer {
  readonly transport: "streamable-http";
  readonly id: string;
  readonly url: string;
  readonly origin: string;
  /** Private resolved values. Configuration files must use headerRefs instead. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Independent lifetime for the optional notification channel. No renewal. */
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

export class NativeMcpHttpRefused extends Error {
  constructor(message = "MCP HTTP connection refused; review the pinned endpoint and reconnect explicitly.") {
    super(message); this.name = "NativeMcpHttpRefused";
  }
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

/** Never forward SDK/network diagnostics, which may contain headers or response bodies. */
export class NativeMcpHttpTransport implements Transport {
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  onmessage?: Transport["onmessage"];
  private readonly inner: StreamableHTTPClientTransport;
  private readonly endpoint: URL;
  private readonly headers: Headers;
  private readonly controllers = new Set<AbortController>();
  private closePromise?: Promise<void>;
  private closing = false;
  private initialized = false;
  private pinnedSession?: string;
  private requests = 0;
  private bytes = 0;
  private notifications = 0;
  private failure?: string;
  private timeoutFailure = false;
  private readonly notificationLifetime: number;

  constructor(server: NativeMcpHttpServer, private readonly timeout: number) {
    this.notificationLifetime = nativeMcpNotificationLifetime(server.notificationLifetimeMs);
    this.endpoint = nativeMcpHttpEndpoint(server.url, server.origin);
    validateNativeMcpHeaderNames(Object.keys(server.headers ?? {}));
    this.headers = new Headers();
    let headerBytes = 0;
    for (const [name, value] of Object.entries(server.headers ?? {})) {
      if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value) || Buffer.byteLength(value) > 8192) {
        throw new NativeMcpHttpRefused("MCP header credentials must be nonempty bounded single-line values.");
      }
      headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
      this.headers.set(name, value);
    }
    if (headerBytes > 16_384) throw new NativeMcpHttpRefused("MCP header credentials exceed the accepted size.");
    this.inner = new StreamableHTTPClientTransport(this.endpoint, {
      fetch: (url, init) => this.fetchPinned(url, init),
      reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 0, initialReconnectionDelay: 0, reconnectionDelayGrowFactor: 1 }
      // No authProvider: authorization never enrolls a client or follows a challenge URL.
    });
    this.inner.onmessage = message => {
      if (this.closing) return;
      if ("method" in message && ++this.notifications > NATIVE_MCP_HTTP_LIMITS.notifications) {
        this.refuse("MCP HTTP server-message limit exceeded; review and mount again."); return;
      }
      this.onmessage?.(message);
    };
    this.inner.onerror = () => this.refuse(this.failure ?? "MCP HTTP disconnected or returned invalid protocol data; review and mount again.");
    this.inner.onclose = () => this.onclose?.();
  }

  get sessionId(): string | undefined { return this.pinnedSession; }
  get failureMessage(): string | undefined { return this.failure; }
  get failureTimedOut(): boolean { return this.timeoutFailure; }
  setProtocolVersion(version: string): void { this.inner.setProtocolVersion(version); }
  start(): Promise<void> { return this.inner.start(); }
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.closing || options?.resumptionToken) return Promise.reject(new NativeMcpHttpRefused("MCP HTTP resumption requires an explicit fresh reviewed mount."));
    return this.inner.send(message, options);
  }

  private refuse(message: string): void {
    if (this.closing) return;
    this.failure ??= message;
    // Set the close latch before calling user/SDK handlers that may reenter.
    const closing = this.close();
    this.onerror?.(new NativeMcpHttpRefused(this.failure));
    void closing.catch(() => {});
  }

  private async fetchPinned(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const method = init.method ?? "GET";
    if (this.closing || String(url) !== this.endpoint.href || !["POST", "GET"].includes(method)
      || ++this.requests > NATIVE_MCP_HTTP_LIMITS.requests || this.controllers.size >= NATIVE_MCP_HTTP_LIMITS.activeRequests) {
      throw new NativeMcpHttpRefused("MCP HTTP endpoint or request bound refused; review and mount again.");
    }
    let initialize = false;
    if (method === "POST") {
      if (typeof init.body !== "string" || Buffer.byteLength(init.body) > 1024 * 1024) throw new NativeMcpHttpRefused("MCP HTTP request exceeds its size limit.");
      const message = JSON.parse(init.body) as { method?: string };
      initialize = message.method === "initialize";
      if (initialize && this.initialized) throw new NativeMcpHttpRefused("MCP HTTP session renewal requires a fresh reviewed mount.");
    }
    const headers = new Headers(init.headers);
    if (headers.has("last-event-id") || (headers.get("mcp-session-id") ?? undefined) !== this.pinnedSession) {
      throw new NativeMcpHttpRefused("MCP HTTP session identity or resumption changed; review and mount again.");
    }
    this.headers.forEach((value, name) => headers.set(name, value));
    headers.set("origin", this.endpoint.origin);
    const controller = new AbortController(); this.controllers.add(controller);
    const abort = () => controller.abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) controller.abort();
    // The optional GET channel has an independent operator-controlled lifetime,
    // so ordinary request timeouts do not expire a healthy idle coding session.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, method === "GET" ? this.notificationLifetime : this.timeout);
    const cleanup = () => { clearTimeout(timer); init.signal?.removeEventListener("abort", abort); this.controllers.delete(controller); };
    try {
      const response = await fetch(this.endpoint, { ...init, headers, signal: controller.signal,
        redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      const refused = (message: string): never => { void response.body?.cancel().catch(() => {}); throw new NativeMcpHttpRefused(message); };
      if (response.redirected || response.url !== this.endpoint.href || (response.status >= 300 && response.status < 400)) {
        return refused("MCP HTTP redirects or endpoint changes are refused; review the configured endpoint explicitly.");
      }
      if (response.status === 401 || response.status === 403) return refused("MCP HTTP authentication refused. Configure explicit headerRefs; automatic OAuth enrollment is not enabled.");
      if (response.status === 404) return refused("MCP HTTP session expired or endpoint is absent; review and create a fresh mount.");
      const session = response.headers.get("mcp-session-id");
      if (session !== null && (!response.ok || !/^[\x21-\x7e]{1,256}$/.test(session) || (!initialize && session !== this.pinnedSession))) {
        return refused("MCP HTTP server changed its session identity; fresh review is required.");
      }
      if (initialize) { this.initialized = true; this.pinnedSession = session ?? undefined; }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > NATIVE_MCP_HTTP_LIMITS.responseBytes) return refused("MCP HTTP response exceeds its size limit.");
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader(); let bytes = 0; let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull: async target => {
          try {
            const chunk = await reader.read();
            if (cancelled) return;
            if (chunk.done) { cleanup(); target.close(); return; }
            bytes += chunk.value.byteLength; this.bytes += chunk.value.byteLength;
            if (bytes > NATIVE_MCP_HTTP_LIMITS.responseBytes || this.bytes > NATIVE_MCP_HTTP_LIMITS.lifetimeBytes) {
              throw new NativeMcpHttpRefused("MCP HTTP response or connection byte limit exceeded; review and mount again.");
            }
            target.enqueue(chunk.value);
          } catch (error) {
            cleanup(); controller.abort(); void reader.cancel().catch(() => {});
            // The SDK deliberately discards 202/405 bodies. That per-response
            // cancellation is not a broken MCP connection or lost authority.
            if (cancelled) return;
            this.timeoutFailure ||= timedOut;
            this.refuse(error instanceof NativeMcpHttpRefused ? error.message : "MCP HTTP stream ended unexpectedly; review and mount again.");
            target.error(new NativeMcpHttpRefused(this.failure));
          }
        },
        cancel: async () => { cancelled = true; cleanup(); controller.abort(); await reader.cancel().catch(() => {}); }
      });
      return new Response(stream, { status: response.status, statusText: "", headers: response.headers });
    } catch (error) {
      cleanup(); controller.abort();
      this.timeoutFailure ||= timedOut;
      const message = error instanceof NativeMcpHttpRefused ? error.message : "MCP HTTP connection failed; review the endpoint and credential references.";
      this.failure ??= message;
      throw new NativeMcpHttpRefused(message);
    }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    // Assign before inner.close invokes callbacks that may reenter this method.
    this.closePromise = Promise.resolve().then(async () => {
      for (const controller of this.controllers) controller.abort();
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
    return this.closePromise;
  }
}
