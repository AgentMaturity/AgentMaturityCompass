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
import { connect as netConnect } from "node:net";
import { join } from "node:path";
import { URL } from "node:url";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";
import { getPublicKeyPem } from "../crypto/keys.js";
import {
  extractMissingAuthEnvVars,
  loadGatewayConfig,
  resolveGatewayConfigEnv,
  routeBaseUrls,
  verifyGatewayConfigSignature,
  type GatewayConfig
} from "./config.js";
import { redactBody, redactHeaders } from "./redaction.js";
import { monitorPublicKeyFingerprint } from "../receipts/receipt.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { loadLeaseRevocations, verifyLeaseRevocationsSignature } from "../leases/leaseStore.js";
import { extractLeaseCarrier } from "../leases/leaseCarriers.js";
import { evaluateBudgetStatus } from "../budgets/budgets.js";
import { CircuitOpenError, TimeoutError, withCircuitBreaker } from "../ops/circuitBreaker.js";

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
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value;
  }
  return out;
}

function selectRoute(pathname: string, config: GatewayConfig): GatewayConfig["routes"][number] | null {
  const sorted = [...config.routes].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find((route) => pathname.startsWith(route.prefix)) ?? null;
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

function applyAuth(
  url: URL,
  headers: Record<string, string>,
  auth: GatewayConfig["upstreams"][string]["auth"],
  env: NodeJS.ProcessEnv
): { ok: boolean; error?: string } {
  if (auth.type === "none") {
    return { ok: true };
  }

  const value = env[auth.env];
  if (!value) {
    return { ok: false, error: `missing API key env: ${auth.env}` };
  }

  if (auth.type === "bearer_env") {
    headers.authorization = `Bearer ${value}`;
    return { ok: true };
  }
  if (auth.type === "header_env") {
    headers[auth.header.toLowerCase()] = value;
    return { ok: true };
  }
  url.searchParams.set(auth.param, value);
  return { ok: true };
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
  const out: Record<string, string> = {};
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
            const outgoing = impl(
              params.targetUrl,
              {
                method: params.method,
                headers: params.headers
              },
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

function hostAllowed(config: GatewayConfig, host: string): boolean {
  const normalizedHost = host.toLowerCase();
  if (!config.proxy.enabled) {
    return true;
  }
  if (!config.proxy.denyByDefault) {
    if (config.proxy.allowlistHosts.length === 0) {
      return true;
    }
  }

  const allowlist = config.proxy.allowlistHosts.map((item) => item.toLowerCase());
  const match = allowlist.some((allowed) => normalizedHost === allowed || normalizedHost.endsWith(`.${allowed}`));
  return config.proxy.denyByDefault ? match : true;
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
  destinationHost: string,
  destinationPort: number
): void {
  appendEvidence({
    eventType: "audit",
    payload: JSON.stringify({
      auditType: "NETWORK_EGRESS_BLOCKED",
      severity: "HIGH",
      request_id: requestId,
      destinationHost,
      destinationPort
    }),
    meta: {
      auditType: "NETWORK_EGRESS_BLOCKED",
      severity: "HIGH",
      request_id: requestId,
      destinationHost,
      destinationPort,
      trustTier: "OBSERVED"
    }
  });
}

function createProxyServer(params: {
  workspace: string;
  workspaceId?: string;
  config: GatewayConfig;
  gatewaySessionId: string;
  allowedCidrs?: string[];
  appendEvidence: (input: {
    eventType: "gateway" | "audit";
    payload: string;
    meta: Record<string, unknown>;
  }) => void;
}): Server {
  const resilience = gatewayResilienceConfig();
  const proxy = createServer(async (req, res) => {
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
    if (!hostAllowed(params.config, host)) {
      appendNetworkBlockedAudit(
        ({ payload, meta }) =>
          params.appendEvidence({
            eventType: "audit",
            payload,
            meta: {
              ...meta,
              sessionType: "proxy",
              sessionId: params.gatewaySessionId
            }
          }),
        requestId,
        host,
        port
      );
      res.statusCode = 403;
      res.end("blocked by AMC proxy allowlist");
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
        retryNonIdempotent: resilience.retryNonIdempotent
      });
    } catch (error) {
      const status = gatewayErrorStatusCode(error);
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(gatewayErrorBody(error)));
      params.appendEvidence({
        eventType: "gateway",
        payload: JSON.stringify({
          request_id: requestId,
          proxyType: "http",
          destinationHost: host,
          destinationPort: port,
          method,
          stage: "request_error",
          status,
          error: error instanceof Error ? error.message : String(error)
        }),
        meta: {
          request_id: requestId,
          proxyMode: true,
          destinationHost: host,
          destinationPort: port,
          method,
          stage: "request_error",
          status,
          trustTier: "OBSERVED"
        }
      });
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
        method,
        bytesIn: body.length,
        bytesOut: responseBody.length,
        trustTier: "OBSERVED"
      }
    });
  });

  proxy.on("connect", (req, clientSocket, head) => {
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

    if (!host || Number.isNaN(port)) {
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

    if (!hostAllowed(params.config, host)) {
      appendNetworkBlockedAudit(
        ({ payload, meta }) =>
          params.appendEvidence({
            eventType: "audit",
            payload,
            meta: {
              ...meta,
              proxyMode: true
            }
          }),
        requestId,
        host,
        port
      );
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }

    const upstreamSocket = netConnect(port, host, () => {
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
      if (finalized) {
        return;
      }
      finalized = true;
      params.appendEvidence({
        eventType: "gateway",
        payload: JSON.stringify({
          request_id: requestId,
          proxyType: "connect",
          destinationHost: host,
          destinationPort: port,
          bytesIn,
          bytesOut,
          durationMs: Date.now() - startedTs,
          reason
        }),
        meta: {
          request_id: requestId,
          proxyMode: true,
          destinationHost: host,
          destinationPort: port,
          bytesIn,
          bytesOut,
          reason,
          trustTier: "OBSERVED"
        }
      });
    };

    const onSocketError = (socket: { destroy: () => void }, reason: string): void => {
      finalize(reason);
      socket.destroy();
    };

    upstreamSocket.setTimeout(resilience.proxyConnectTimeoutMs, () => onSocketError(clientSocket, "upstream_timeout"));
    clientSocket.setTimeout(resilience.proxyConnectTimeoutMs, () => onSocketError(upstreamSocket, "client_timeout"));
    upstreamSocket.on("error", () => onSocketError(clientSocket, "upstream_error"));
    clientSocket.on("error", () => onSocketError(upstreamSocket, "client_error"));
    upstreamSocket.on("close", () => finalize("upstream_close"));
    clientSocket.on("close", () => finalize("client_close"));
  });

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
  const runtimeListenHost = options.listenHost ?? resolvedConfig.listen.host;
  const runtimeListenPort = options.listenPort ?? resolvedConfig.listen.port;
  const runtimeProxyPort = options.proxyPort ?? config.proxy.port;
  const signature = verifyGatewayConfigSignature(options.workspace, options.configPath);
  const missingEnvs = extractMissingAuthEnvVars(config);
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
      const authResult = applyAuth(targetUrl, outboundHeaders, upstreamResolved.auth, process.env);

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
        retryNonIdempotent: resilience.retryNonIdempotent
      });

      const responseHeaders = normalizeResponseHeaders(upstreamResponse.headers);
      const responseHeaderRedaction = redactHeaders(responseHeaders, config.redaction.headerKeysDenylist);
      const streamPassthrough = config.streamPassthrough === true;
      let responseBody: Buffer;

      if (streamPassthrough) {
        res.statusCode = upstreamResponse.statusCode ?? 500;
        for (const [headerKey, headerValue] of Object.entries(upstreamResponse.headers)) {
          if (typeof headerValue !== "undefined" && headerKey.toLowerCase() !== "content-length") {
            res.setHeader(headerKey, headerValue as string | string[]);
          }
        }
        const upstreamTrailer = upstreamResponse.headers["trailer"];
        const trailerHeader =
          typeof upstreamTrailer === "string" && upstreamTrailer.trim().length > 0
            ? `${upstreamTrailer}, x-amc-receipt-trailer`
            : "x-amc-receipt-trailer";
        res.setHeader("Trailer", trailerHeader);
        res.setHeader("x-amc-request-id", requestId);
        res.setHeader("x-amc-request-receipt", requestEvent.receipt);
        res.setHeader("x-amc-monitor-pub-fpr", monitorPubFingerprint);
        res.setHeader("x-amc-receipt-mode", "trailer");

        const chunks: Buffer[] = [];
        await new Promise<void>((resolvePromise, rejectPromise) => {
          upstreamResponse.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            chunks.push(buffer);
            res.write(buffer);
          });
          upstreamResponse.once("end", () => resolvePromise());
          upstreamResponse.once("error", rejectPromise);
        });
        responseBody = Buffer.concat(chunks);
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
