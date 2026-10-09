import { randomUUID } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect, isIP, type LookupFunction } from "node:net";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";
import { getPublicKeyPem } from "../crypto/keys.js";
import { canonicalHost, isNonPublicAddress, resolveAndCheck, type EgressCheck } from "../enforce/egressAllowlist.js";
import {
  loadGatewayConfig,
  resolveGatewayConfigEnv,
  routeBaseUrls,
  verifyGatewayConfigSignature,
  type GatewayConfig
} from "./config.js";
import { applyUpstreamAuth, missingUpstreamAuthRefs, upstreamCredentials } from "./upstreamAuth.js";
import type { CredentialsService } from "../credentials/credentialsService.js";
import { redactBody, redactHeaders } from "./redaction.js";
import { relayGatewayResponse } from "./streamPassthrough.js";
import { monitorPublicKeyFingerprint } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { loadLeaseRevocations, verifyLeaseRevocationsSignature } from "../leases/leaseStore.js";
import { extractLeaseCarrier } from "../leases/leaseCarriers.js";
import { evaluateBudgetStatus } from "../budgets/budgets.js";
import { CircuitOpenError, TimeoutError, withCircuitBreaker } from "../ops/circuitBreaker.js";
import { checkUpstreamEgress, pinnedLookup, prepareFieldGuard, requestFieldRefusal, type FieldGuard } from "./requestFieldGuard.js";

export interface StartGatewayOptions {
  workspace: string;
  workspaceId?: string;
  configPath?: string;
  logger?: Pick<Console, "log" | "error">;
  listenHost?: string;
  listenPort?: number;
  proxyPort?: number;
  allowedCidrs?: string[];
  allowQueryCarrierOverride?: boolean;
  /**
   * Credential source for outbound upstream auth. Defaults to the local
   * layered store; supply one to share a store the caller already owns and
   * closes (the composed tree, or a test).
   */
  credentials?: CredentialsService;
}

export interface GatewayHandle {
  gatewaySessionId: string;
  host: string;
  port: number;
  routes: Array<{ prefix: string; upstream: string; baseUrl: string; openaiCompatible: boolean; agentId?: string }>;
  signatureValid: boolean;
  signatureExists: boolean;
  proxyEnabled: boolean;
  proxyPort: number | null;
  close: () => Promise<void>;
}

interface ParsedJsonInfo {
  model?: string;
  usage?: Record<string, unknown>;
  requestKind?: string;
  hasToolCalls?: boolean;
}

function toHeaderObject(headers: IncomingHttpHeaders): Record<string, string | string[] | undefined> {
  const out = Object.create(null) as Record<string, string | string[] | undefined>;
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value;
  }
  return out;
}

function selectRoute(pathname: string, config: GatewayConfig): GatewayConfig["routes"][number] | null {
  const sorted = [...config.routes].sort((a, b) => b.prefix.length - a.prefix.length);
  // Match on a path-segment boundary: "/dsh" serves "/dsh" and "/dsh/...", never "/dsh2".
  return sorted.find((route) => pathname === route.prefix || pathname.startsWith(route.prefix.endsWith("/") ? route.prefix : `${route.prefix}/`)) ?? null;
}

function joinPath(basePathname: string, forwardedPathname: string): string {
  const left = basePathname.endsWith("/") ? basePathname.slice(0, -1) : basePathname;
  const right = forwardedPathname.startsWith("/") ? forwardedPathname : `/${forwardedPathname}`;
  if (!left) {
    return right;
  }
  if (right === "/") {
    return left || "/";
  }
  return `${left}${right}`;
}

async function readAll(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function routePath(pathname: string, route: GatewayConfig["routes"][number]): string {
  if (!route.stripPrefix) {
    return pathname;
  }
  const stripped = pathname.slice(route.prefix.length);
  if (!stripped) {
    return "/";
  }
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function normalizeResponseHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "undefined") {
      continue;
    }
    out[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return out;
}

interface GatewayResilienceConfig {
  upstreamTimeoutMs: number;
  upstreamMaxRetries: number;
  upstreamRetryBaseDelayMs: number;
  retryNonIdempotent: boolean;
  proxyConnectTimeoutMs: number;
}

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_UPSTREAM_MAX_RETRIES = 1;
const DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_PROXY_CONNECT_TIMEOUT_MS = 60_000;

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function gatewayResilienceConfig(): GatewayResilienceConfig {
  return {
    upstreamTimeoutMs: parsePositiveIntEnv(process.env.AMC_GATEWAY_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS),
    upstreamMaxRetries: parsePositiveIntEnv(process.env.AMC_GATEWAY_UPSTREAM_MAX_RETRIES, DEFAULT_UPSTREAM_MAX_RETRIES),
    upstreamRetryBaseDelayMs: parsePositiveIntEnv(
      process.env.AMC_GATEWAY_UPSTREAM_RETRY_BASE_DELAY_MS,
      DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS
    ),
    retryNonIdempotent: parseBooleanEnv(process.env.AMC_GATEWAY_RETRY_NON_IDEMPOTENT, false),
    proxyConnectTimeoutMs: parsePositiveIntEnv(process.env.AMC_GATEWAY_PROXY_CONNECT_TIMEOUT_MS, DEFAULT_PROXY_CONNECT_TIMEOUT_MS)
  };
}

function isRetryableMethod(method: string, retryNonIdempotent: boolean): boolean {
  if (retryNonIdempotent) {
    return true;
  }
  const normalized = method.toUpperCase();
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS" || normalized === "DELETE";
}

function isRetryableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof CircuitOpenError || error instanceof TimeoutError) {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
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

function gatewayErrorStatusCode(error: unknown): number {
  if (error instanceof CircuitOpenError) {
    return 503;
  }
  if (error instanceof TimeoutError) {
    return 504;
  }
  if (error instanceof Error && error.message.toLowerCase().includes("timeout")) {
    return 504;
  }
  return 502;
}

function gatewayErrorBody(error: unknown): { error: string } {
  if (error instanceof CircuitOpenError) {
    return { error: "upstream circuit is open; dependency is unhealthy" };
  }
  if (error instanceof TimeoutError || (error instanceof Error && error.message.toLowerCase().includes("timeout"))) {
    return { error: "upstream timeout" };
  }
  return { error: "gateway proxy failure" };
}

async function requestUpstreamWithResilience(params: {
  targetUrl: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
  circuitName: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryNonIdempotent: boolean;
  lookup?: LookupFunction;
}): Promise<IncomingMessage> {
  const totalAttempts = params.maxRetries + 1;
  const canRetry = isRetryableMethod(params.method, params.retryNonIdempotent);
  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const response = await withCircuitBreaker(
        params.circuitName,
        () =>
          new Promise<IncomingMessage>((resolvePromise, rejectPromise) => {
            const impl = params.targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
            // A pinned lookup needs a new socket: the keep-alive pool is keyed by name and would reuse a socket to another address.
            const outgoing = impl(
              params.targetUrl,
              { method: params.method, headers: params.headers, ...(params.lookup ? { lookup: params.lookup, agent: false } : {}) },
              (res) => resolvePromise(res)
            );
            outgoing.setTimeout(params.timeoutMs, () => {
              outgoing.destroy(new Error(`upstream timeout after ${params.timeoutMs}ms`));
            });
            outgoing.on("error", rejectPromise);
            outgoing.write(params.body);
            outgoing.end();
          }),
        { timeoutMs: params.timeoutMs + 1000 }
      );
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < totalAttempts && canRetry && isRetryableTransportError(error)) {
        await sleep(backoffMs(params.retryBaseDelayMs, attempt));
        continue;
      }
      throw error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("upstream request failed"));
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return ((values[0] ?? 0) << 24) + ((values[1] ?? 0) << 16) + ((values[2] ?? 0) << 8) + (values[3] ?? 0);
}

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || !bitsRaw) {
    return null;
  }
  const base = ipToInt(ip.trim());
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : Number((0xffffffff << (32 - bits)) >>> 0);
  return { base: Number(base >>> 0), mask };
}

function normalizeRemoteIp(remote: string | undefined): string {
  if (!remote || remote.length === 0) {
    return "127.0.0.1";
  }
  if (remote.startsWith("::ffff:")) {
    return remote.slice("::ffff:".length);
  }
  return remote;
}

function ipAllowedByCidrs(ip: string, cidrs: string[]): boolean {
  if (cidrs.length === 0) {
    return true;
  }
  if (ip === "::1") {
    return cidrs.includes("::1/128") || cidrs.includes("::1");
  }
  const value = ipToInt(ip);
  if (value === null) {
    return false;
  }
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      continue;
    }
    const network = parsed.base & parsed.mask;
    if ((Number(value >>> 0) & parsed.mask) === network) {
      return true;
    }
  }
  return false;
}

const AGENT_AUTH_HEADER_KEYS = [
  "x-amc-lease",
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "api-key",
  "x-openai-key",
  "x-anthropic-api-key"
] as const;
const AGENT_AUTH_QUERY_KEYS = ["key", "api_key", "api-key", "access_token", "amc_lease"] as const;

function stripAgentProvidedCredentials(
  headers: Record<string, string>,
  targetUrl: URL,
  acceptedLease?: {
    carrier: "x-amc-lease" | "authorization" | "x-api-key" | "x-goog-api-key" | "api-key" | "query";
    token: string;
  }
): {
  hadCredential: boolean;
  strippedHeaders: string[];
  strippedQueryKeys: string[];
} {
  const strippedHeaders: string[] = [];
  const strippedQueryKeys: string[] = [];
  let hadCredential = false;

  for (const key of AGENT_AUTH_HEADER_KEYS) {
    if (typeof headers[key] === "string" && headers[key].length > 0) {
      const raw = headers[key];
      const isAcceptedLeaseHeader =
        acceptedLease &&
        ((acceptedLease.carrier === "x-amc-lease" && key === "x-amc-lease" && raw === acceptedLease.token) ||
          (acceptedLease.carrier === "authorization" && key === "authorization" && raw === `Bearer ${acceptedLease.token}`) ||
          (acceptedLease.carrier === "x-api-key" && key === "x-api-key" && raw === acceptedLease.token) ||
          (acceptedLease.carrier === "x-goog-api-key" && key === "x-goog-api-key" && raw === acceptedLease.token) ||
          (acceptedLease.carrier === "api-key" && key === "api-key" && raw === acceptedLease.token));
      if (!isAcceptedLeaseHeader) {
        hadCredential = true;
      }
      strippedHeaders.push(key);
      delete headers[key];
    }
  }

  for (const key of AGENT_AUTH_QUERY_KEYS) {
    if (targetUrl.searchParams.has(key)) {
      const value = targetUrl.searchParams.get(key);
      const isAcceptedLeaseQuery = acceptedLease && acceptedLease.carrier === "query" && key === "amc_lease" && value === acceptedLease.token;
      if (!isAcceptedLeaseQuery) {
        hadCredential = true;
      }
      strippedQueryKeys.push(key);
      targetUrl.searchParams.delete(key);
    }
  }

  return {
    hadCredential,
    strippedHeaders,
    strippedQueryKeys
  };
}

function verifyLeaseAndMapError(input: {
  workspace: string;
  expectedWorkspaceId?: string;
  leaseToken: string | undefined;
  expectedAgentId: string;
  requiredScope: "gateway:llm" | "proxy:connect";
  routePath?: string;
  model?: string | null;
}): {
  ok: boolean;
  payload?: {
    maxRequestsPerMinute: number;
    maxTokensPerMinute: number;
    leaseId: string;
    agentId: string;
  };
  statusCode: number;
  auditType:
    | "LEASE_INVALID_OR_MISSING"
    | "LEASE_WORKSPACE_MISMATCH_ATTEMPT"
    | "LEASE_AGENT_MISMATCH"
    | "LEASE_SCOPE_DENIED"
    | "LEASE_ROUTE_DENIED"
    | "LEASE_MODEL_DENIED";
  message: string;
} {
  if (!input.leaseToken) {
    return {
      ok: false,
      statusCode: 401,
      auditType: "LEASE_INVALID_OR_MISSING",
      message: "missing lease token"
    };
  }

  const revocationSig = verifyLeaseRevocationsSignature(input.workspace);
  if (!revocationSig.valid) {
    return {
      ok: false,
      statusCode: 401,
      auditType: "LEASE_INVALID_OR_MISSING",
      message: `lease revocation signature invalid: ${revocationSig.reason ?? "unknown"}`
    };
  }

  const revoked = new Set(loadLeaseRevocations(input.workspace).revocations.map((row) => row.leaseId));
  const verification = verifyLeaseToken({
    workspace: input.workspace,
    token: input.leaseToken,
    expectedWorkspaceId: input.expectedWorkspaceId,
    expectedAgentId: input.expectedAgentId,
    requiredScope: input.requiredScope,
    routePath: input.routePath,
    model: input.model,
    revokedLeaseIds: revoked
  });
  if (verification.ok) {
    return {
      ok: true,
      payload: verification.payload
        ? {
            maxRequestsPerMinute: verification.payload.maxRequestsPerMinute,
            maxTokensPerMinute: verification.payload.maxTokensPerMinute,
            leaseId: verification.payload.leaseId,
            agentId: verification.payload.agentId
          }
        : undefined,
      statusCode: 200,
      auditType: "LEASE_INVALID_OR_MISSING",
      message: "ok"
    };
  }

  const error = verification.error ?? "lease verification failed";
  if (error.includes("agent mismatch")) {
    return { ok: false, statusCode: 403, auditType: "LEASE_AGENT_MISMATCH", message: error };
  }
  if (error.includes("workspace mismatch")) {
    return { ok: false, statusCode: 403, auditType: "LEASE_WORKSPACE_MISMATCH_ATTEMPT", message: error };
  }
  if (error.includes("scope denied")) {
    return { ok: false, statusCode: 403, auditType: "LEASE_SCOPE_DENIED", message: error };
  }
  if (error.includes("route denied")) {
    return { ok: false, statusCode: 403, auditType: "LEASE_ROUTE_DENIED", message: error };
  }
  if (error.includes("model denied")) {
    return { ok: false, statusCode: 403, auditType: "LEASE_MODEL_DENIED", message: error };
  }
  return { ok: false, statusCode: 401, auditType: "LEASE_INVALID_OR_MISSING", message: error };
}

function usageCountersLastMinute(ledger: ReturnType<typeof openLedger>, agentId: string, now = Date.now()): {
  llmRequests: number;
  llmTokens: number;
} {
  const minuteStart = now - 60_000;
  const events = ledger.getEventsBetween(minuteStart, now);
  let requests = 0;
  let tokens = 0;

  for (const event of events) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(event.meta_json) as Record<string, unknown>;
    } catch {
      meta = {};
    }
    if ((meta.agentId ?? "default") !== agentId) {
      continue;
    }
    if (event.event_type === "llm_request") {
      requests += 1;
    }
    if (event.event_type === "llm_response" && meta.usage && typeof meta.usage === "object") {
      const usage = meta.usage as Record<string, unknown>;
      const values = [
        usage.total_tokens,
        usage.totalTokens,
        usage.input_tokens,
        usage.inputTokens,
        usage.output_tokens,
        usage.outputTokens
      ].filter((value) => typeof value === "number") as number[];
      tokens += values.reduce((sum, value) => sum + value, 0);
    }
  }

  return {
    llmRequests: requests,
    llmTokens: tokens
  };
}

function bestEffortJsonInfo(bytes: Buffer, pathname?: string, openaiCompatible = false): ParsedJsonInfo {
  if (bytes.length === 0) {
    return {
      requestKind: pathname?.includes("embeddings")
        ? "embeddings"
        : pathname?.includes("images")
          ? "images"
          : pathname?.includes("audio")
            ? "audio"
            : pathname?.includes("responses")
              ? "responses"
              : pathname?.includes("chat")
                ? "chat"
                : "other"
    };
  }

  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    const info: ParsedJsonInfo = {};

    if (typeof parsed.model === "string") {
      info.model = parsed.model;
    } else if (typeof parsed.modelId === "string") {
      info.model = parsed.modelId;
    }

    if (parsed.usage && typeof parsed.usage === "object") {
      info.usage = parsed.usage as Record<string, unknown>;
    } else if (parsed.usageMetadata && typeof parsed.usageMetadata === "object") {
      info.usage = parsed.usageMetadata as Record<string, unknown>;
    }

    if (Array.isArray(parsed.tools) || Array.isArray(parsed.tool_calls)) {
      info.hasToolCalls = true;
      info.requestKind = "tools";
    } else if (pathname?.includes("embeddings")) {
      info.requestKind = "embeddings";
    } else if (pathname?.includes("images")) {
      info.requestKind = "images";
    } else if (pathname?.includes("audio")) {
      info.requestKind = "audio";
    } else if (pathname?.includes("responses")) {
      info.requestKind = "responses";
    } else if (pathname?.includes("chat")) {
      info.requestKind = "chat";
    } else if (openaiCompatible && (Array.isArray(parsed.messages) || Array.isArray(parsed.input))) {
      info.requestKind = "chat";
    } else {
      info.requestKind = "other";
    }

    return info;
  } catch {
    return { requestKind: "other" };
  }
}

/** One proxied connection's egress check, made as it opens (P1-66); the caller connects only to the returned addresses. */
async function hostAllowed(params: { config: GatewayConfig; fieldGuard: FieldGuard }, host: string): Promise<EgressCheck> {
  // Without deny-by-default any name or public IP literal passes by name; every address still meets the non-public rule.
  const name = canonicalHost(host);
  const anyHost = !params.config.proxy.denyByDefault && (isIP(name) === 0 || !isNonPublicAddress(name));
  // A gateway entry covers the host and its subdomains. A leading-dot entry matched nothing here before and still does.
  const allowHosts = [...params.config.proxy.allowlistHosts.flatMap((entry) => entry.startsWith(".") ? [] : [entry, `.${entry}`]), ...(anyHost ? [name] : [])];
  const egress = await resolveAndCheck(host, { allowHosts });
  const guarded = egress.decision.allowed ? await params.fieldGuard.targetRefused(host, egress.addresses) : null;
  return guarded === null ? egress : { addresses: egress.addresses, unresolved: guarded.unresolved, decision: { allowed: false, reason: guarded.reason } };
}

function extractAgentId(route: GatewayConfig["routes"][number], headers: IncomingHttpHeaders): string {
  const headerAgentId = firstString(headers["x-amc-agent-id"] ?? headers["amc-agent-id"]);
  return headerAgentId ?? route.agentId ?? "default";
}

function appendNetworkBlockedAudit(
  appendEvidence: (input: {
    eventType: "audit";
    payload: string;
    meta: Record<string, unknown>;
  }) => void,
  requestId: string,
  agentId: string,
  destinationHost: string,
  destinationPort: number,
  egress: EgressCheck
): void {
  // The reason names the refused address; resolvedAddresses is what the name resolved to when the connection opened.
  // agentId is the lease-verified requester, so the row counts only against that agent.
  const row = { auditType: "NETWORK_EGRESS_BLOCKED", severity: "HIGH", request_id: requestId, agentId, destinationHost, destinationPort,
    reason: egress.decision.reason, resolvedAddresses: egress.addresses };
  appendEvidence({ eventType: "audit", payload: JSON.stringify(row), meta: { ...row, trustTier: "OBSERVED" } });
}

function createProxyServer(params: {
  workspace: string;
  workspaceId?: string;
  config: GatewayConfig;
  gatewaySessionId: string;
  allowedCidrs?: string[];
  fieldGuard: FieldGuard;
  logger: Pick<Console, "error">;
  appendEvidence: (input: {
    eventType: "gateway" | "audit";
    payload: string;
    meta: Record<string, unknown>;
  }) => void;
}): Server {
  const resilience = gatewayResilienceConfig();
  // A refusal by name, address or guarded target is a NETWORK_EGRESS_BLOCKED audit for the lease-verified agent. A DNS failure (the
  // target's, or a guarded upstream's) is not an egress attempt: HTTP 502 and an egress_unresolved gateway row for that agent, no audit.
  const recordRefusal = (requestId: string, agentId: string, host: string, port: number, egress: EgressCheck, meta: Record<string, unknown>): void => {
    if (egress.unresolved !== true) {
      appendNetworkBlockedAudit(({ payload, meta: row }) => params.appendEvidence({ eventType: "audit", payload, meta: { ...row, ...meta } }),
        requestId, agentId, host, port, egress);
      return;
    }
    const row = { request_id: requestId, agentId, destinationHost: host, destinationPort: port, stage: "egress_unresolved", status: 502, reason: egress.decision.reason };
    params.appendEvidence({ eventType: "gateway", payload: JSON.stringify(row), meta: { ...row, ...meta, proxyMode: true, trustTier: "OBSERVED" } });
  };
  const onRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const requestId = randomUUID();
    const method = (req.method ?? "GET").toUpperCase();
    const clientIp = normalizeRemoteIp(req.socket.remoteAddress);
    if (!ipAllowedByCidrs(clientIp, params.allowedCidrs ?? [])) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp,
          proxyMode: true
        }),
        meta: {
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
      res.statusCode = 403;
      res.end("client IP not allowed");
      return;
    }
    let targetUrl: URL | null = null;
    try {
      targetUrl = new URL(req.url ?? "");
    } catch {
      res.statusCode = 400;
      res.end("invalid proxy request url");
      return;
    }

    const proxyAgentId = firstString(req.headers["x-amc-agent-id"] ?? req.headers["amc-agent-id"]);
    const leaseCarrier = extractLeaseCarrier({
      headers: req.headers,
      url: targetUrl,
      allowQueryCarrier: params.config.lease.allowQueryCarrier
    });
    if (leaseCarrier.nonLeaseCarrier) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "AGENT_PROVIDED_KEY_IGNORED",
          severity: "MED",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          leaseCarrier: leaseCarrier.nonLeaseCarrier,
          proxyMode: true
        }),
        meta: {
          auditType: "AGENT_PROVIDED_KEY_IGNORED",
          severity: "MED",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          leaseCarrier: leaseCarrier.nonLeaseCarrier,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
    }
    if (leaseCarrier.queryCarrierUsed) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "LEASE_QUERY_CARRIER_USED",
          severity: "LOW",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          proxyMode: true
        }),
        meta: {
          auditType: "LEASE_QUERY_CARRIER_USED",
          severity: "LOW",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
    }
    const leaseVerification = verifyLeaseAndMapError({
      workspace: params.workspace,
      expectedWorkspaceId: params.workspaceId,
      leaseToken: leaseCarrier.leaseToken ?? undefined,
      expectedAgentId: proxyAgentId ?? "unknown",
      requiredScope: "proxy:connect"
    });
    if (!proxyAgentId || !leaseVerification.ok) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: leaseVerification.ok ? "LEASE_INVALID_OR_MISSING" : leaseVerification.auditType,
          severity: "HIGH",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          message: proxyAgentId ? leaseVerification.message : "missing x-amc-agent-id for proxy request"
        }),
        meta: {
          auditType: leaseVerification.ok ? "LEASE_INVALID_OR_MISSING" : leaseVerification.auditType,
          severity: "HIGH",
          request_id: requestId,
          agentId: proxyAgentId ?? null,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
      res.statusCode = proxyAgentId ? leaseVerification.statusCode : 401;
      res.end(proxyAgentId ? leaseVerification.message : "missing x-amc-agent-id");
      return;
    }

    const host = targetUrl.hostname;
    const port = Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80));
    // A host outside the allowlist is refused before any DNS query; a listed one is resolved now and checked by address.
    const egress = await hostAllowed(params, host);
    if (!egress.decision.allowed) {
      recordRefusal(requestId, proxyAgentId, host, port, egress, { sessionType: "proxy", sessionId: params.gatewaySessionId });
      res.statusCode = egress.unresolved === true ? 502 : 403;
      res.end(egress.unresolved === true ? "proxy target not checked: a name did not resolve" : "blocked by AMC proxy allowlist");
      return;
    }

    const body = await readAll(req);
    const outboundHeaders = normalizeResponseHeaders(req.headers);
    delete outboundHeaders.host;
    delete outboundHeaders["x-amc-agent-id"];
    delete outboundHeaders["amc-agent-id"];
    stripAgentProvidedCredentials(
      outboundHeaders,
      targetUrl,
      leaseCarrier.leaseToken && leaseCarrier.leaseCarrier
        ? { carrier: leaseCarrier.leaseCarrier, token: leaseCarrier.leaseToken }
        : undefined
    );
    const startedTs = Date.now();
    let upstream: IncomingMessage;
    try {
      upstream = await requestUpstreamWithResilience({
        targetUrl,
        method,
        headers: outboundHeaders,
        body,
        circuitName: `gateway-proxy-http:${host}:${port}`,
        timeoutMs: resilience.upstreamTimeoutMs,
        maxRetries: resilience.upstreamMaxRetries,
        retryBaseDelayMs: resilience.upstreamRetryBaseDelayMs,
        retryNonIdempotent: resilience.retryNonIdempotent,
        lookup: pinnedLookup(egress.addresses)
      });
    } catch (error) {
      const status = gatewayErrorStatusCode(error);
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(gatewayErrorBody(error)));
      // resolvedAddresses: the checked addresses the failed connection was pinned to.
      const row = { request_id: requestId, destinationHost: host, destinationPort: port, resolvedAddresses: egress.addresses, method, stage: "request_error", status };
      params.appendEvidence({ eventType: "gateway", payload: JSON.stringify({ ...row, proxyType: "http", error: error instanceof Error ? error.message : String(error) }),
        meta: { ...row, proxyMode: true, trustTier: "OBSERVED" } });
      return;
    }
    const responseBody = await readAll(upstream);
    res.statusCode = upstream.statusCode ?? 502;
    for (const [headerKey, headerValue] of Object.entries(upstream.headers)) {
      if (typeof headerValue !== "undefined") {
        res.setHeader(headerKey, headerValue);
      }
    }
    res.end(responseBody);

    params.appendEvidence({
      eventType: "gateway",
      payload: JSON.stringify({
        request_id: requestId,
        proxyType: "http",
        destinationHost: host,
        destinationPort: port,
        resolvedAddresses: egress.addresses,
        method,
        bytesIn: body.length,
        bytesOut: responseBody.length,
        durationMs: Date.now() - startedTs
      }),
      meta: {
        request_id: requestId,
        proxyMode: true,
        destinationHost: host,
        destinationPort: port,
        resolvedAddresses: egress.addresses,
        method,
        bytesIn: body.length,
        bytesOut: responseBody.length,
        trustTier: "OBSERVED"
      }
    });
  };
  // A rejected handler (a client reset during a body read, a ledger write failure) ends its own connection, never the gateway process.
  const contain = (end: () => void) => (error: unknown): void => { params.logger.error(`gateway proxy error: ${String(error)}`); end(); };
  const proxy = createServer((req, res) => {
    onRequest(req, res).catch(contain(() => { if (res.headersSent || req.destroyed) res.destroy(); else res.writeHead(502).end("gateway proxy failure"); }));
  });

  const onConnect = async (req: IncomingMessage, clientSocket: Duplex, head: Buffer): Promise<void> => {
    const requestId = randomUUID();
    const clientIp = normalizeRemoteIp(req.socket.remoteAddress);
    if (!ipAllowedByCidrs(clientIp, params.allowedCidrs ?? [])) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp,
          proxyMode: true
        }),
        meta: {
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
    const [hostRaw, portRaw] = (req.url ?? "").split(":");
    const host = hostRaw ?? "";
    const port = Number(portRaw ?? "443");
    const proxyAgentId = firstString(req.headers["x-amc-agent-id"] ?? req.headers["amc-agent-id"]);
    let connectUrl: URL | undefined;
    try {
      connectUrl = new URL(`http://${req.url ?? ""}`);
    } catch {
      connectUrl = undefined;
    }
    const leaseCarrier = extractLeaseCarrier({
      headers: req.headers,
      url: connectUrl,
      allowQueryCarrier: params.config.lease.allowQueryCarrier
    });
    if (leaseCarrier.nonLeaseCarrier) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "AGENT_PROVIDED_KEY_IGNORED",
          severity: "MED",
          request_id: requestId,
          destinationHost: host,
          destinationPort: port,
          agentId: proxyAgentId ?? null,
          leaseCarrier: leaseCarrier.nonLeaseCarrier,
          proxyMode: true
        }),
        meta: {
          auditType: "AGENT_PROVIDED_KEY_IGNORED",
          severity: "MED",
          request_id: requestId,
          destinationHost: host,
          destinationPort: port,
          agentId: proxyAgentId ?? null,
          leaseCarrier: leaseCarrier.nonLeaseCarrier,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
    }
    const leaseVerification = verifyLeaseAndMapError({
      workspace: params.workspace,
      expectedWorkspaceId: params.workspaceId,
      leaseToken: leaseCarrier.leaseToken ?? undefined,
      expectedAgentId: proxyAgentId ?? "unknown",
      requiredScope: "proxy:connect"
    });

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      clientSocket.destroy();
      return;
    }

    if (!proxyAgentId || !leaseVerification.ok) {
      params.appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: leaseVerification.ok ? "LEASE_INVALID_OR_MISSING" : leaseVerification.auditType,
          severity: "HIGH",
          request_id: requestId,
          destinationHost: host,
          destinationPort: port,
          agentId: proxyAgentId ?? null,
          message: proxyAgentId ? leaseVerification.message : "missing x-amc-agent-id for proxy connect"
        }),
        meta: {
          auditType: leaseVerification.ok ? "LEASE_INVALID_OR_MISSING" : leaseVerification.auditType,
          severity: "HIGH",
          request_id: requestId,
          destinationHost: host,
          destinationPort: port,
          agentId: proxyAgentId ?? null,
          proxyMode: true,
          trustTier: "OBSERVED"
        }
      });
      clientSocket.write(`HTTP/1.1 ${proxyAgentId ? leaseVerification.statusCode : 401} Unauthorized\r\n\r\n`);
      clientSocket.destroy();
      return;
    }

    clientSocket.on("error", () => clientSocket.destroy()); // the client may fail while the target resolves
    const egress = await hostAllowed(params, host);
    if (!egress.decision.allowed) {
      recordRefusal(requestId, proxyAgentId, host, port, egress, { proxyMode: true });
      clientSocket.write(egress.unresolved === true ? "HTTP/1.1 502 Bad Gateway\r\n\r\n" : "HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
    if (clientSocket.destroyed) return; // the client left during the lookup: open nothing

    // Only the checked addresses (a pinned lookup keeps every one as a fallback), never a fresh resolution.
    let connectedAddress: string | null = null;
    const upstreamSocket = netConnect({ port, host: canonicalHost(host), lookup: pinnedLookup(egress.addresses) }, () => {
      connectedAddress = upstreamSocket.remoteAddress ?? null; // which checked address the tunnel reached
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {
        upstreamSocket.write(head);
      }
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });

    let bytesIn = head.length;
    let bytesOut = 0;
    let finalized = false;
    const startedTs = Date.now();

    clientSocket.on("data", (chunk: Buffer) => {
      bytesIn += chunk.length;
    });
    upstreamSocket.on("data", (chunk: Buffer) => {
      bytesOut += chunk.length;
    });

    const finalize = (reason: string): void => {
      if (finalized) return;
      finalized = true;
      const row = { request_id: requestId, destinationHost: host, destinationPort: port, resolvedAddresses: egress.addresses, connectedAddress, bytesIn, bytesOut, reason };
      params.appendEvidence({ eventType: "gateway", payload: JSON.stringify({ ...row, proxyType: "connect", durationMs: Date.now() - startedTs }),
        meta: { ...row, proxyMode: true, trustTier: "OBSERVED" } });
    };

    // An error or an idle timeout on either side ends both sockets; a client that goes away closes the upstream too.
    const closeBoth = (reason: string): void => {
      finalize(reason);
      clientSocket.destroy();
      upstreamSocket.destroy();
    };

    (upstreamSocket as unknown as { setTimeout: (ms: number, cb: () => void) => void }).setTimeout(resilience.proxyConnectTimeoutMs, () => closeBoth("upstream_timeout"));
    (clientSocket as unknown as { setTimeout: (ms: number, cb: () => void) => void }).setTimeout(resilience.proxyConnectTimeoutMs, () => closeBoth("client_timeout"));
    upstreamSocket.on("error", () => closeBoth("upstream_error"));
    clientSocket.on("error", () => closeBoth("client_error"));
    upstreamSocket.on("close", () => finalize("upstream_close"));
    clientSocket.on("close", () => { finalize("client_close"); upstreamSocket.destroy(); });
  };
  proxy.on("connect", (req: IncomingMessage, clientSocket: Duplex, head: Buffer) => { onConnect(req, clientSocket, head).catch(contain(() => clientSocket.destroy())); });

  return proxy;
}

export async function startGateway(options: StartGatewayOptions): Promise<GatewayHandle> {
  const logger = options.logger ?? console;
  const config = loadGatewayConfig(options.workspace, options.configPath);
  const resolvedConfig = resolveGatewayConfigEnv({
    ...config,
    lease: {
      ...config.lease,
      allowQueryCarrier: options.allowQueryCarrierOverride ?? config.lease.allowQueryCarrier
    }
  });
  const fieldGuard = prepareFieldGuard(resolvedConfig); // resolves guarded upstreams per request, only when a route refuses fields
  const runtimeListenHost = options.listenHost ?? resolvedConfig.listen.host;
  const runtimeListenPort = options.listenPort ?? resolvedConfig.listen.port;
  const runtimeProxyPort = options.proxyPort ?? config.proxy.port;
  const signature = verifyGatewayConfigSignature(options.workspace, options.configPath);
  // Bound once, resolved per request. The binding is a store; the resolution is
  // a call, and only the second one happens on the request path.
  const credentials = upstreamCredentials(options.workspace, options.credentials);
  const missingEnvs = missingUpstreamAuthRefs(config, credentials.resolve);
  const resilience = gatewayResilienceConfig();

  const ledger = openLedger(options.workspace);
  const monitorPubFingerprint = monitorPublicKeyFingerprint(getPublicKeyPem(options.workspace, "monitor"));
  const gatewaySessionId = randomUUID();

  const appendEvidence = (input: {
    eventType: "gateway" | "audit";
    payload: string;
    meta: Record<string, unknown>;
  }): void => {
    ledger.appendEvidence({
      sessionId: gatewaySessionId,
      runtime: "gateway",
      eventType: input.eventType,
      payload: input.payload,
      payloadExt: "json",
      inline: input.eventType === "audit",
      meta: {
        ...input.meta,
        trustTier: "OBSERVED"
      }
    });
  };

  ledger.startSession({
    sessionId: gatewaySessionId,
    runtime: "gateway",
    binaryPath: join(options.workspace, "dist", "cli.js"),
    binarySha256: hashBinaryOrPath("amc-gateway", "1")
  });

  appendEvidence({
    eventType: "gateway",
    payload: JSON.stringify({
      stage: "start",
      signatureValid: signature.valid,
      signatureExists: signature.signatureExists,
      missingEnvVars: missingEnvs,
      proxyEnabled: config.proxy.enabled
    }),
    meta: {
      stage: "start",
      signatureValid: signature.valid,
      signatureExists: signature.signatureExists,
      proxyEnabled: config.proxy.enabled
    }
  });

  if (!signature.valid) {
    appendEvidence({
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "CONFIG_UNSIGNED",
        severity: "HIGH",
        message: signature.reason ?? "gateway config unsigned"
      }),
      meta: {
        auditType: "CONFIG_UNSIGNED",
        severity: "HIGH",
        reason: signature.reason ?? "gateway config unsigned"
      }
    });
    appendEvidence({
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "UNSIGNED_GATEWAY_CONFIG",
        severity: "HIGH",
        message: signature.reason ?? "gateway config unsigned"
      }),
      meta: {
        auditType: "UNSIGNED_GATEWAY_CONFIG",
        severity: "HIGH",
        reason: signature.reason ?? "gateway config unsigned"
      }
    });
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestId = randomUUID();
    const method = (req.method ?? "GET").toUpperCase();
    const clientIp = normalizeRemoteIp(req.socket.remoteAddress);
    if (!ipAllowedByCidrs(clientIp, options.allowedCidrs ?? [])) {
      appendEvidence({
        eventType: "audit",
        payload: JSON.stringify({
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp
        }),
        meta: {
          auditType: "NETWORK_EGRESS_BLOCKED",
          severity: "HIGH",
          request_id: requestId,
          reason: "client_cidr_denied",
          clientIp
        }
      });
      res.statusCode = 403;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "client IP not allowed" }));
      return;
    }

    try {
      const hostForUrl = req.headers.host ?? `${resolvedConfig.listen.host}:${resolvedConfig.listen.port}`;
      const incomingUrl = new URL(req.url ?? "/", `http://${hostForUrl}`);

      if (incomingUrl.pathname === "/__amc/health") {
        const body = JSON.stringify({
          ok: true,
          sessionId: gatewaySessionId,
          routes: routeBaseUrls(config),
          signatureValid: signature.valid,
          listenHost: runtimeListenHost,
          listenPort: runtimeListenPort,
          proxy: {
            enabled: config.proxy.enabled,
            port: runtimeProxyPort
          }
        });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(body);
        return;
      }

      const route = selectRoute(incomingUrl.pathname, resolvedConfig);
      if (!route) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `no route configured for ${incomingUrl.pathname}` }));
        return;
      }

      const upstreamResolved = resolvedConfig.upstreams[route.upstream];
      const upstreamConfigured = config.upstreams[route.upstream];
      if (!upstreamResolved || !upstreamConfigured) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `invalid upstream ${route.upstream}` }));
        return;
      }

      if (!upstreamResolved.baseUrl) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `missing resolved baseUrl for upstream ${route.upstream}` }));
        return;
      }

      const upstreamUrl = new URL(upstreamResolved.baseUrl);
      const forwardedPath = routePath(incomingUrl.pathname, route);
      const targetUrl = new URL(upstreamUrl.toString());
      targetUrl.pathname = joinPath(upstreamUrl.pathname, forwardedPath);
      targetUrl.search = incomingUrl.search;

      const requestBody = await readAll(req);
      const requestInfo = bestEffortJsonInfo(requestBody, incomingUrl.pathname, route.openaiCompatible);
      const attributedAgentId = extractAgentId(route, req.headers);
      const leaseCarrier = extractLeaseCarrier({
        headers: req.headers,
        url: incomingUrl,
        allowQueryCarrier: config.lease.allowQueryCarrier
      });
      if (leaseCarrier.nonLeaseCarrier) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "AGENT_PROVIDED_KEY_IGNORED",
            severity: "MED",
            request_id: requestId,
            agentId: attributedAgentId,
            leaseCarrier: leaseCarrier.nonLeaseCarrier
          }),
          meta: {
            auditType: "AGENT_PROVIDED_KEY_IGNORED",
            severity: "MED",
            request_id: requestId,
            agentId: attributedAgentId,
            leaseCarrier: leaseCarrier.nonLeaseCarrier,
            trustTier: "OBSERVED"
          }
        });
      }
      if (leaseCarrier.queryCarrierUsed) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "LEASE_QUERY_CARRIER_USED",
            severity: "LOW",
            request_id: requestId,
            agentId: attributedAgentId
          }),
          meta: {
            auditType: "LEASE_QUERY_CARRIER_USED",
            severity: "LOW",
            request_id: requestId,
            agentId: attributedAgentId,
            trustTier: "OBSERVED"
          }
        });
      }
      const leaseVerification = verifyLeaseAndMapError({
        workspace: options.workspace,
        expectedWorkspaceId: options.workspaceId,
        leaseToken: leaseCarrier.leaseToken ?? undefined,
        expectedAgentId: attributedAgentId,
        requiredScope: "gateway:llm",
        routePath: incomingUrl.pathname,
        model: requestInfo.model ?? null
      });
      if (!leaseVerification.ok) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: leaseVerification.auditType,
            severity: "HIGH",
            request_id: requestId,
            upstreamId: route.upstream,
            agentId: attributedAgentId,
            message: leaseVerification.message
          }),
          meta: {
            auditType: leaseVerification.auditType,
            severity: "HIGH",
            request_id: requestId,
            upstreamId: route.upstream,
            agentId: attributedAgentId
          }
        });
        res.statusCode = leaseVerification.statusCode;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: leaseVerification.message }));
        return;
      }

      // The upstream is resolved and checked now (P1-66); refused fields (e.g. dsh_session_log) are decided on these addresses and the connection
      // below is pinned to them. An unreadable body is refused; the audit keeps names and size, never content.
      const upstreamEgress = await checkUpstreamEgress(upstreamConfigured, upstreamResolved, signature.valid);
      // An upstream that did not resolve is a transport failure, as before P1-66 (502, request_error, no audit).
      if (upstreamEgress.unresolved === true) {
        logger.error(`gateway error: ${upstreamEgress.decision.reason}`);
        const failure = { stage: "request_error", request_id: requestId, status: 502, upstreamId: route.upstream, agentId: attributedAgentId };
        appendEvidence({ eventType: "gateway", payload: JSON.stringify({ ...failure, error: upstreamEgress.decision.reason }), meta: failure });
        res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: `upstream ${route.upstream} did not resolve` }));
        return;
      }
      // A non-public address the configuration does not opt in is this route's fault, not an egress attempt by the agent.
      if (!upstreamEgress.decision.allowed) {
        const unsafe = { auditType: "UNSAFE_PROVIDER_ROUTE", severity: "HIGH", request_id: requestId, upstreamId: route.upstream, agentId: attributedAgentId,
          destinationHost: upstreamUrl.hostname, reason: upstreamEgress.decision.reason, resolvedAddresses: upstreamEgress.addresses };
        appendEvidence({ eventType: "audit", payload: JSON.stringify(unsafe), meta: unsafe });
        res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ error: `upstream ${route.upstream} refused by the gateway egress check` }));
        return;
      }
      const fieldRefusal = requestFieldRefusal(requestBody, req.headers, await fieldGuard.fieldsFor(route.upstream, upstreamEgress.addresses));
      if (fieldRefusal) {
        const refusal = { auditType: "REQUEST_FIELD_REFUSED", severity: "HIGH", request_id: requestId, route: route.prefix, upstreamId: route.upstream,
          agentId: attributedAgentId, reason: fieldRefusal.reason, fields: fieldRefusal.fields, requestBytes: requestBody.byteLength };
        appendEvidence({ eventType: "audit", payload: JSON.stringify(refusal), meta: refusal });
        res.statusCode = 403;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `request refused by the route field guard (${fieldRefusal.reason})` }));
        return;
      }

      const minuteUsage = usageCountersLastMinute(ledger, attributedAgentId);
      if (
        minuteUsage.llmRequests >= (leaseVerification.payload?.maxRequestsPerMinute ?? Number.MAX_SAFE_INTEGER) ||
        minuteUsage.llmTokens >= (leaseVerification.payload?.maxTokensPerMinute ?? Number.MAX_SAFE_INTEGER)
      ) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "LEASE_RATE_LIMITED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId,
            leaseId: leaseVerification.payload?.leaseId ?? null,
            maxRequestsPerMinute: leaseVerification.payload?.maxRequestsPerMinute ?? null,
            maxTokensPerMinute: leaseVerification.payload?.maxTokensPerMinute ?? null,
            minuteUsage
          }),
          meta: {
            auditType: "LEASE_RATE_LIMITED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId,
            leaseId: leaseVerification.payload?.leaseId ?? null
          }
        });
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "BUDGET_EXCEEDED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId,
            reason: "lease per-minute limit exceeded",
            minuteUsage
          }),
          meta: {
            auditType: "BUDGET_EXCEEDED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId
          }
        });
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "lease rate limit exceeded" }));
        return;
      }

      const budgetStatus = evaluateBudgetStatus(options.workspace, attributedAgentId);
      if (!budgetStatus.ok && budgetStatus.reasons.some((reason) => reason.includes("llm "))) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "BUDGET_EXCEEDED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId,
            reasons: budgetStatus.reasons
          }),
          meta: {
            auditType: "BUDGET_EXCEEDED",
            severity: "HIGH",
            request_id: requestId,
            agentId: attributedAgentId
          }
        });
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "budget exceeded" }));
        return;
      }

      const outboundHeaders = normalizeResponseHeaders(req.headers);
      delete outboundHeaders.host;
      delete outboundHeaders["content-length"];
      delete outboundHeaders["x-amc-lease"];
      delete outboundHeaders["x-amc-agent-id"];
      delete outboundHeaders["x-amc-workorder-id"];
      delete outboundHeaders["x-amc-client-process"];
      const strippedAuth = stripAgentProvidedCredentials(
        outboundHeaders,
        targetUrl,
        leaseCarrier.leaseToken && leaseCarrier.leaseCarrier
          ? { carrier: leaseCarrier.leaseCarrier, token: leaseCarrier.leaseToken }
          : undefined
      );
      if (strippedAuth.hadCredential) {
        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "AGENT_PROVIDED_KEY_IGNORED",
            severity: "MED",
            request_id: requestId,
            agentId: attributedAgentId,
            strippedHeaders: strippedAuth.strippedHeaders,
            strippedQueryKeys: strippedAuth.strippedQueryKeys
          }),
          meta: {
            auditType: "AGENT_PROVIDED_KEY_IGNORED",
            severity: "MED",
            request_id: requestId,
            agentId: attributedAgentId
          }
        });
      }
      const authResult = applyUpstreamAuth(targetUrl, outboundHeaders, upstreamResolved.auth, credentials.resolve);

      if (!authResult.ok) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: authResult.error }));

        appendEvidence({
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "UPSTREAM_AUTH_MISSING",
            severity: "HIGH",
            request_id: requestId,
            upstreamId: route.upstream,
            agentId: attributedAgentId,
            message: authResult.error
          }),
          meta: {
            auditType: "UPSTREAM_AUTH_MISSING",
            severity: "HIGH",
            request_id: requestId,
            upstreamId: route.upstream,
            agentId: attributedAgentId
          }
        });
        return;
      }

      const requestHeaderRedaction = redactHeaders(toHeaderObject(req.headers), config.redaction.headerKeysDenylist);
      const requestBodyRedaction = redactBody(requestBody, req.headers["content-type"], config.redaction);
      const workOrderId = firstString(req.headers["x-amc-workorder-id"]);
      const providerId = upstreamConfigured.providerId ?? route.upstream;
      const clientProcess = firstString(req.headers["x-amc-client-process"]);
      const correlationId = firstString(req.headers["x-amc-correlation-id"]);
      const runId = firstString(req.headers["x-amc-run-id"]);

      const llmRequestMeta: Record<string, unknown> = {
        request_id: requestId,
        upstreamId: route.upstream,
        providerId,
        upstreamBaseUrl: upstreamConfigured.baseUrl,
        upstreamResolvedBaseUrl: upstreamResolved.baseUrl,
        model: requestInfo.model,
        usage: requestInfo.usage,
        request_kind: requestInfo.requestKind ?? "other",
        openaiCompatible: route.openaiCompatible,
        hasToolCalls: requestInfo.hasToolCalls === true,
        bodyRedacted: requestBodyRedaction.wasRedacted || requestHeaderRedaction.wasRedacted,
        redactionReasons: requestBodyRedaction.redactionReasons,
        originalHashOmitted: requestBodyRedaction.originalHashOmitted,
        agentId: attributedAgentId,
        workOrderId: workOrderId ?? null,
        clientProcess: clientProcess ?? null,
        correlation_id: correlationId ?? null,
        run_id: runId ?? null,
        leaseId: leaseVerification.payload?.leaseId ?? null,
        lease_carrier: leaseCarrier.leaseCarrier,
        trustTier: "OBSERVED",
        bodySha256: sha256Hex(requestBodyRedaction.redactedBytes)
      };
      if (requestBodyRedaction.originalPayloadSha256) {
        llmRequestMeta.originalPayloadSha256 = requestBodyRedaction.originalPayloadSha256;
      }
      if (isLocalhostUrl(upstreamResolved.baseUrl)) {
        llmRequestMeta.localhostApproved = upstreamConfigured.allowLocalhost === true;
      }

      const requestEvent = ledger.appendEvidenceWithReceipt({
        sessionId: gatewaySessionId,
        runtime: "gateway",
        eventType: "llm_request",
        payload: JSON.stringify({
          request_id: requestId,
          method,
          path: incomingUrl.pathname,
          query: incomingUrl.search,
          headers: requestHeaderRedaction.headers,
          body: requestBodyRedaction.redactedBytes.toString("utf8")
        }),
        payloadExt: "json",
        meta: llmRequestMeta,
        receipt: {
          kind: "llm_request",
          agentId: attributedAgentId,
          providerId,
          model: requestInfo.model ?? null,
          bodySha256: sha256Hex(requestBodyRedaction.redactedBytes)
        }
      });

      const upstreamResponse = await requestUpstreamWithResilience({
        targetUrl,
        method,
        headers: outboundHeaders,
        body: requestBody,
        circuitName: `gateway-upstream:${route.upstream}`,
        timeoutMs: resilience.upstreamTimeoutMs,
        maxRetries: resilience.upstreamMaxRetries,
        retryBaseDelayMs: resilience.upstreamRetryBaseDelayMs,
        retryNonIdempotent: resilience.retryNonIdempotent,
        lookup: pinnedLookup(upstreamEgress.addresses)
      });

      const responseHeaders = normalizeResponseHeaders(upstreamResponse.headers);
      const responseHeaderRedaction = redactHeaders(responseHeaders, config.redaction.headerKeysDenylist);
      const streamPassthrough = config.streamPassthrough === true;
      let responseBody: Buffer;

      if (streamPassthrough) {
        responseBody = await relayGatewayResponse(upstreamResponse, res, {
          requestId, requestReceipt: requestEvent.receipt, monitorPubFingerprint
        });
      } else {
        responseBody = await readAll(upstreamResponse);
      }

      const responseBodyRedaction = redactBody(responseBody, upstreamResponse.headers["content-type"], config.redaction);
      const responseInfo = bestEffortJsonInfo(responseBody, incomingUrl.pathname, route.openaiCompatible);

      const llmResponseMeta: Record<string, unknown> = {
        request_id: requestId,
        upstreamId: route.upstream,
        providerId,
        upstreamBaseUrl: upstreamConfigured.baseUrl,
        upstreamResolvedBaseUrl: upstreamResolved.baseUrl,
        statusCode: upstreamResponse.statusCode ?? 0,
        model: responseInfo.model ?? requestInfo.model,
        usage: responseInfo.usage ?? requestInfo.usage,
        request_kind: requestInfo.requestKind ?? responseInfo.requestKind ?? "other",
        openaiCompatible: route.openaiCompatible,
        hasToolCalls: responseInfo.hasToolCalls === true || requestInfo.hasToolCalls === true,
        bodyRedacted: responseBodyRedaction.wasRedacted || responseHeaderRedaction.wasRedacted,
        redactionReasons: responseBodyRedaction.redactionReasons,
        originalHashOmitted: responseBodyRedaction.originalHashOmitted,
        agentId: attributedAgentId,
        workOrderId: workOrderId ?? null,
        clientProcess: clientProcess ?? null,
        correlation_id: correlationId ?? null,
        run_id: runId ?? null,
        leaseId: leaseVerification.payload?.leaseId ?? null,
        trustTier: "OBSERVED",
        bodySha256: sha256Hex(responseBodyRedaction.redactedBytes)
      };
      if (responseBodyRedaction.originalPayloadSha256) {
        llmResponseMeta.originalPayloadSha256 = responseBodyRedaction.originalPayloadSha256;
      }
      if (isLocalhostUrl(upstreamResolved.baseUrl)) {
        llmResponseMeta.localhostApproved = upstreamConfigured.allowLocalhost === true;
      }

      const responseEvent = ledger.appendEvidenceWithReceipt({
        sessionId: gatewaySessionId,
        runtime: "gateway",
        eventType: "llm_response",
        payload: JSON.stringify({
          request_id: requestId,
          statusCode: upstreamResponse.statusCode ?? 0,
          headers: responseHeaderRedaction.headers,
          body: responseBodyRedaction.redactedBytes.toString("utf8")
        }),
        payloadExt: "json",
        meta: llmResponseMeta,
        receipt: {
          kind: "llm_response",
          agentId: attributedAgentId,
          providerId,
          model: responseInfo.model ?? requestInfo.model ?? null,
          bodySha256: sha256Hex(responseBodyRedaction.redactedBytes)
        }
      });

      if (streamPassthrough) {
        res.addTrailers({
          "x-amc-receipt-trailer": responseEvent.receipt
        });
        res.end();
      } else {
        res.statusCode = upstreamResponse.statusCode ?? 500;
        for (const [headerKey, headerValue] of Object.entries(upstreamResponse.headers)) {
          if (typeof headerValue !== "undefined") {
            res.setHeader(headerKey, headerValue as string | string[]);
          }
        }
        res.setHeader("x-amc-request-id", requestId);
        res.setHeader("x-amc-receipt", responseEvent.receipt);
        res.setHeader("x-amc-request-receipt", requestEvent.receipt);
        res.setHeader("x-amc-monitor-pub-fpr", monitorPubFingerprint);
        res.end(responseBody);
      }
    } catch (error) {
      logger.error(`gateway error: ${String(error)}`);
      const status = gatewayErrorStatusCode(error);
      const body = gatewayErrorBody(error);
      appendEvidence({
        eventType: "gateway",
        payload: JSON.stringify({
          request_id: requestId,
          status,
          error: error instanceof Error ? error.message : String(error)
        }),
        meta: {
          stage: "request_error",
          request_id: requestId,
          status
        }
      });
      // A partial stream cannot be replaced by a JSON error or a successful receipt.
      if (res.headersSent || res.destroyed || res.writableEnded) {
        if (!res.destroyed && !res.writableEnded) res.destroy();
        return;
      }
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(runtimeListenPort, runtimeListenHost, () => resolvePromise());
  });
  const httpAddress = server.address();
  if (!httpAddress || typeof httpAddress === "string") {
    throw new Error("Failed to start gateway server on TCP address");
  }

  let proxyServer: Server | null = null;
  let proxyPort: number | null = null;
  if (config.proxy.enabled) {
    proxyServer = createProxyServer({
      workspace: options.workspace,
      workspaceId: options.workspaceId,
      config: resolvedConfig,
      gatewaySessionId,
      allowedCidrs: options.allowedCidrs,
      fieldGuard,
      logger,
      appendEvidence
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      proxyServer!.once("error", rejectPromise);
      proxyServer!.listen(runtimeProxyPort, runtimeListenHost, () => resolvePromise());
    });
    const proxyAddress = proxyServer.address();
    if (proxyAddress && typeof proxyAddress !== "string") {
      proxyPort = proxyAddress.port;
    }
  }

  logger.log(`AMC gateway listening on http://${runtimeListenHost}:${httpAddress.port}`);
  if (proxyPort !== null) {
    logger.log(`AMC gateway proxy listening on http://${runtimeListenHost}:${proxyPort}`);
  }

  return {
    gatewaySessionId,
    host: runtimeListenHost,
    port: httpAddress.port,
    routes: routeBaseUrls(config),
    signatureValid: signature.valid,
    signatureExists: signature.signatureExists,
    proxyEnabled: config.proxy.enabled,
    proxyPort,
    close: async () => {
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      });
      if (proxyServer) {
        await new Promise<void>((resolvePromise) => {
          proxyServer!.close(() => resolvePromise());
        });
      }

      appendEvidence({
        eventType: "gateway",
        payload: JSON.stringify({ stage: "stop" }),
        meta: { stage: "stop" }
      });
      ledger.sealSession(gatewaySessionId);
      ledger.close();
      // Releases the file watcher, but only on a store this gateway created.
      await credentials.close();
    }
  };
}

export async function gatewayStatus(workspace: string, configPath?: string): Promise<{
  reachable: boolean;
  baseUrl: string;
  routes: Array<{ prefix: string; upstream: string; baseUrl: string; openaiCompatible: boolean; agentId?: string }>;
  signatureValid: boolean;
  signatureExists: boolean;
  proxy: { enabled: boolean; baseUrl: string | null };
}> {
  const config = loadGatewayConfig(workspace, configPath);
  const resolved = resolveGatewayConfigEnv(config);
  const signature = verifyGatewayConfigSignature(workspace, configPath);
  const healthUrl = `http://${resolved.listen.host}:${resolved.listen.port}/__amc/health`;

  const reachable = await new Promise<boolean>((resolvePromise) => {
    const req = httpRequest(healthUrl, { method: "GET", timeout: 1000 }, (res) => {
      resolvePromise((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500);
      res.resume();
    });
    req.on("error", () => resolvePromise(false));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(false);
    });
    req.end();
  });

  return {
    reachable,
    baseUrl: `http://${resolved.listen.host}:${resolved.listen.port}`,
    routes: routeBaseUrls(config),
    signatureValid: signature.valid,
    signatureExists: signature.signatureExists,
    proxy: {
      enabled: config.proxy.enabled,
      baseUrl: config.proxy.enabled ? `http://${resolved.listen.host}:${config.proxy.port}` : null
    }
  };
}
