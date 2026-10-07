import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isJSONRPCRequest, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  NativeMcpHttpRefused, NativeMcpReconnectTransient, NativeMcpReconnectBudget, NativeMcpReconnectCursors,
  NATIVE_MCP_RECONNECT_LIMITS, nativeMcpAbortFailure, nativeMcpRetryAfter, nativeMcpRetryableStatus,
  nativeMcpWaitFor, type NativeMcpHttpFailureCode, type NativeMcpResponseLease
} from "./nativeMcpReconnect.js";
import { SseFrames, nativeMcpRecoverableStream } from "./nativeMcpReconnectStream.js";
import { MCP_PROTOCOL_VERSION_META, MCP_STATELESS_PROTOCOL_VERSION } from "./protocol/version.js";
import { mcpHeaderValue, mcpParamHeaders, type McpParamHeader } from "./protocol/headers.js";
import { NATIVE_MCP_AUTHORIZE_HINT, parseNativeMcpBearerChallenge, type NativeMcpOAuthChallenge } from "./oauth/discovery.js";
import type { NativeMcpOAuthReceipt } from "./oauth/authorize.js";

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
  /** Exact protocol version; absent means probe server/discover, then fall back to initialize. */
  readonly protocolVersion?: string;
  /** Set by the OAuth resolver beside the private Authorization header; never the token. */
  readonly auth?: NativeMcpOAuthReceipt;
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
  "mcp-session-id", "mcp-protocol-version", "last-event-id", "mcp-method", "mcp-name"]);
/** Methods whose name or URI is mirrored into Mcp-Name (2026-07-28 streamable-http §Standard Request Headers). */
const NAMED_METHODS = new Set(["tools/call", "resources/read", "prompts/get"]);
/** Idempotent methods re-issued once, with a new id, after a broken response (ADR-010). Never tools/call. */
const REISSUABLE_METHODS = new Set(["server/discover", "tools/list", "resources/read", "prompts/get"]);

type Rpc = { method?: string; id?: string | number; params?: Record<string, unknown> };

/** One JSON-RPC response for `id`; an error may carry a null id when the server could not read it. */
function statelessResponse(data: string, id: string | number): Record<string, unknown> | undefined {
  let value: unknown;
  try { value = JSON.parse(data); } catch { return undefined; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  const { result } = message;
  const error = message.error as Record<string, unknown> | undefined;
  if (message.jsonrpc !== "2.0") return undefined;
  if (result && typeof result === "object" && !Array.isArray(result) && message.id === id) return { jsonrpc: "2.0", id, result };
  if (error && typeof error === "object" && Number.isSafeInteger(error.code) && typeof error.message === "string" && (message.id === id || message.id === null)) {
    return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) } };
  }
  return undefined;
}

/** Local marker consumed only by the era probe: not a 2026-07-28 DiscoverResult or modern error. */
function legacyProbeResponse(id: string | number): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Not a 2026-07-28 server/discover response." } };
}

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
    || /^(proxy-|sec-|content-|mcp-param-)/.test(normalized[i]!))) {
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
  /** Set while probing or speaking the 2026-07-28 stateless protocol. */
  private statelessVersion?: string;
  private probing = false;
  private reissues = 0;
  private readonly toolHeaders = new Map<string, readonly McpParamHeader[]>();
  private readonly oauth: boolean;
  private scopesRequired?: readonly string[];

  constructor(server: NativeMcpHttpServer, private readonly timeout: number) {
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
      throw new NativeMcpHttpRefused("MCP timeout must be between 1 and 300000 milliseconds.");
    }
    this.notificationLifetime = nativeMcpNotificationLifetime(server.notificationLifetimeMs);
    this.oauth = server.auth !== undefined;
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
  /** Validated scope tokens from the latest insufficient_scope challenge. */
  get requiredScopes(): readonly string[] | undefined { return this.scopesRequired; }

  /** Era probe (basic/versioning §Backward Compatibility): one 2026-07-28 request before any session exists. */
  beginStatelessProbe(): void {
    if (this.requests > 0 || this.initializeAttempted) throw new NativeMcpHttpRefused("MCP HTTP protocol probe must precede every other request.", "PROTOCOL_ERROR");
    this.statelessVersion = MCP_STATELESS_PROTOCOL_VERSION; this.probing = true;
  }
  useStateless(): void { if (this.statelessVersion === undefined) throw new NativeMcpHttpRefused("MCP HTTP stateless mode requires the protocol probe.", "PROTOCOL_ERROR"); this.probing = false; }
  useLegacy(): void { this.statelessVersion = undefined; this.probing = false; }
  /** Reviewed x-mcp-header bindings for a granted tool; tools/call refuses a tool without them. */
  pinToolHeaders(name: string, bindings: readonly McpParamHeader[]): void { this.toolHeaders.set(name, Object.freeze([...bindings])); }

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
      throw new NativeMcpHttpRefused(this.failure ?? "MCP HTTP request failed; review and mount again.", this.failureKind, this.scopesRequired);
    }
  }

  private refuse(error: NativeMcpHttpRefused): void {
    if (this.closing) return;
    this.failure ??= error.message;
    this.failureKind ??= error.code;
    // Set the close latch before calling user/SDK handlers that may reenter.
    const closing = this.close();
    void closing.catch(() => {});
    try { this.onerror?.(new NativeMcpHttpRefused(this.failure, this.failureKind, this.scopesRequired)); }
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

  private authFailure(status: number, challenge: NativeMcpOAuthChallenge): string {
    if (!this.oauth) {
      return "MCP HTTP authentication refused. Configure explicit headerRefs, or auth.kind \"oauth2\" and run `amc agent-loop mcp-catalog --authorize`; OAuth is never enrolled automatically.";
    }
    if (status === 403 && challenge.error === "insufficient_scope") {
      return `MCP server requires OAuth scopes the stored grant lacks${challenge.scopes ? ` (${challenge.scopes.join(" ")})` : ""}. Add them to auth.scopes if this run needs them. ${NATIVE_MCP_AUTHORIZE_HINT}`;
    }
    return `MCP OAuth access token was refused (HTTP ${status}). ${NATIVE_MCP_AUTHORIZE_HINT}`;
  }

  private async fetchOnce(scope: RequestScope, method: string, headers: Headers, body?: string, initialize = false, stateless = false): Promise<NativeMcpResponseLease> {
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
        const challenge = parseNativeMcpBearerChallenge(response.headers.get("www-authenticate"));
        if (response.status === 403 && challenge.error === "insufficient_scope" && challenge.scopes) this.scopesRequired = challenge.scopes;
        throw new NativeMcpHttpRefused(this.authFailure(response.status, challenge), "AUTH_REQUIRED", this.scopesRequired);
      }
      // 2026-07-28 has no sessions: a 404 carries a JSON-RPC error and session headers are ignored.
      if (!stateless && response.status === 404) {
        throw new NativeMcpHttpRefused("MCP HTTP session expired or endpoint is absent; review and create a fresh mount.", "SESSION_EXPIRED");
      }
      const session = stateless ? null : response.headers.get("mcp-session-id");
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
    let rpc: Rpc = {};
    let body: string | undefined;
    if (method === "POST") {
      if (typeof init.body !== "string" || Buffer.byteLength(init.body) > 1024 * 1024) throw new NativeMcpHttpRefused("MCP HTTP request exceeds its size limit.");
      body = init.body;
      try { rpc = JSON.parse(body) as typeof rpc; }
      catch { throw new NativeMcpHttpRefused("MCP HTTP request is not valid JSON.", "PROTOCOL_ERROR"); }
      if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) throw new NativeMcpHttpRefused("MCP HTTP requires one JSON-RPC message.", "PROTOCOL_ERROR");
    }
    if (this.statelessVersion !== undefined) return this.fetchStateless(method, init, rpc, body);
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

  /**
   * 2026-07-28 Streamable HTTP: one POST per request with the request-metadata
   * headers; no session, GET stream or resumption. The SDK receives one JSON
   * response under its own id. Origin pinning and redirect refusal are unchanged.
   */
  private async fetchStateless(method: string, init: RequestInit, rpc: Rpc, body: string | undefined): Promise<Response> {
    if (method !== "POST" || body === undefined || typeof rpc.method !== "string") {
      throw new NativeMcpHttpRefused("MCP HTTP 2026-07-28 has no GET stream or session; review and mount again.", "PROTOCOL_ERROR");
    }
    // §Sending Messages: no client notifications on HTTP; closing a response stream is the cancellation.
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    const params = rpc.params ?? {};
    const meta = params._meta as Record<string, unknown> | undefined;
    if (meta?.[MCP_PROTOCOL_VERSION_META] !== this.statelessVersion) {
      throw new NativeMcpHttpRefused("MCP request lacks its per-request protocol metadata; nothing was dispatched.", "NOT_DISPATCHED");
    }
    const headers = new Headers(init.headers);
    headers.delete("mcp-session-id"); headers.delete("last-event-id");
    headers.set("mcp-protocol-version", this.statelessVersion!); headers.set("mcp-method", rpc.method);
    if (NAMED_METHODS.has(rpc.method)) {
      const name = rpc.method === "resources/read" ? params.uri : params.name;
      if (typeof name !== "string") throw new NativeMcpHttpRefused("MCP request has no name for its Mcp-Name header; nothing was dispatched.", "NOT_DISPATCHED");
      headers.set("mcp-name", mcpHeaderValue(name));
    }
    if (rpc.method === "tools/call") {
      const bindings = this.toolHeaders.get(params.name as string);
      if (!bindings) throw new NativeMcpHttpRefused("MCP tool header bindings were not pinned for this mount; nothing was dispatched.", "NOT_DISPATCHED");
      try { for (const [name, value] of mcpParamHeaders(bindings, params.arguments)) headers.set(name, value); }
      catch { throw new NativeMcpHttpRefused("MCP tool header parameter cannot be encoded; nothing was dispatched.", "NOT_DISPATCHED"); }
    }
    const scope = this.requestScope(init, false);
    const reissuable = REISSUABLE_METHODS.has(rpc.method);
    try {
      for (let attempt = 0; ; attempt++) {
        const id = attempt === 0 ? rpc.id : `amc-reissue-${++this.reissues}`;
        try {
          const message = await this.exchangeStateless(scope, headers, attempt === 0 ? body : JSON.stringify({ ...rpc, id }), id, reissuable);
          scope.cleanup();
          return new Response(JSON.stringify({ ...message, id: rpc.id }), { status: 200, headers: { "content-type": "application/json" } });
        } catch (error) {
          if (!(error instanceof NativeMcpReconnectTransient)) throw error;
          // §Sending Messages: a broken stream loses the request. Re-issue only idempotent reads, once, with a new id.
          if (reissuable && attempt === 0) continue;
          if (this.probing) { scope.cleanup(); return new Response(JSON.stringify(legacyProbeResponse(rpc.id)), { status: 200, headers: { "content-type": "application/json" } }); }
          if (error.timedOut) this.timeoutFailure = true;
          if (rpc.method === "tools/call") {
            throw new NativeMcpHttpRefused("MCP tool call outcome unknown (TOOL_OUTCOME_UNKNOWN): the response stream broke before a result arrived.", "TOOL_OUTCOME_UNKNOWN");
          }
          throw error;
        }
      }
    } catch (error) {
      scope.cleanup(); scope.controller.abort();
      const safe = this.failureFor(error, scope); this.refuse(safe); throw safe;
    }
  }

  private async exchangeStateless(scope: RequestScope, headers: Headers, body: string, id: string | number, reissuable: boolean): Promise<Record<string, unknown>> {
    const lease = await this.fetchOnce(scope, "POST", headers, body, false, true);
    const { status } = lease.response;
    const mediaType = lease.response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (status === 200 && mediaType === "text/event-stream") return this.readStatelessStream(lease, scope, id);
    if (reissuable && nativeMcpRetryableStatus(status)) {
      lease.cancel(); await scope.budget.wait(nativeMcpRetryAfter(lease.response.headers.get("retry-after")));
      throw new NativeMcpReconnectTransient();
    }
    let bytes: Uint8Array = new Uint8Array();
    if (lease.response.body) bytes = await this.readJson(lease, scope); else lease.release();
    const message = statelessResponse(Buffer.from(bytes).toString("utf8"), id);
    if (message && (status === 200 ? mediaType === "application/json" : status >= 400 && status < 500 && "error" in message)) return message;
    // §Backward Compatibility: a 4xx without a recognized JSON-RPC error identifies a legacy server.
    if (this.probing && [400, 404, 405].includes(status)) return legacyProbeResponse(id);
    throw new NativeMcpHttpRefused(status === 200 ? "MCP HTTP response is not one JSON-RPC response for its request."
      : `MCP HTTP request refused (HTTP ${status}); review and mount again. No tool call was replayed.`, status === 200 ? "PROTOCOL_ERROR" : "REFUSED");
  }

  /** Reads one request-scoped SSE stream to its response; there is no resumption. */
  private async readStatelessStream(lease: NativeMcpResponseLease, scope: RequestScope, id: string | number): Promise<Record<string, unknown>> {
    const reader = lease.response.body?.getReader();
    if (!reader) throw new NativeMcpHttpRefused("MCP HTTP SSE response body is missing.", "PROTOCOL_ERROR");
    const frames = new SseFrames(() => {});
    let bytes = 0;
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); }
        catch { if (scope.controller.signal.aborted) throw nativeMcpAbortFailure(); throw new NativeMcpReconnectTransient(); }
        if (scope.controller.signal.aborted) throw nativeMcpAbortFailure();
        if (chunk.done) throw new NativeMcpReconnectTransient();
        bytes += chunk.value.byteLength; this.charge(chunk.value.byteLength);
        if (bytes > NATIVE_MCP_HTTP_LIMITS.responseBytes) throw new NativeMcpHttpRefused("MCP HTTP response exceeds its size limit.", "BOUND_EXCEEDED");
        for (const frame of frames.feed(chunk.value)) {
          if (frame.event !== "message" || !frame.data) continue;
          let message: unknown;
          try { message = JSON.parse(frame.data); } catch { throw new NativeMcpHttpRefused("MCP HTTP stream returned invalid protocol data.", "PROTOCOL_ERROR"); }
          const method = message && typeof message === "object" ? (message as Rpc).method : undefined;
          if (typeof method === "string") {
            // Servers never send requests in 2026-07-28 (MRTR replaces them); notifications here are request-scoped.
            if ((message as Rpc).id !== undefined) throw new NativeMcpHttpRefused("MCP server sent a request on a response stream; it was refused.", "PROTOCOL_ERROR");
            if (++this.notifications > NATIVE_MCP_HTTP_LIMITS.notifications) throw new NativeMcpHttpRefused("MCP HTTP server-message limit exceeded; review and mount again.", "BOUND_EXCEEDED");
            if (method === "notifications/tools/list_changed") this.catalogChanged = true;
            continue;
          }
          const response = statelessResponse(frame.data, id);
          if (!response) throw new NativeMcpHttpRefused("MCP HTTP response crossed request streams or is invalid; no response id was remapped.", "PROTOCOL_ERROR");
          return response;
        }
      }
    } finally { lease.cancel(); void reader.cancel().catch(() => {}); }
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
