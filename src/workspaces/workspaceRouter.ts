import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { renameSync } from "node:fs";
import { URL } from "node:url";
import { startStudioApiServer } from "../studio/studioServer.js";
import { ensureAdminToken } from "../studio/studioState.js";
import { WorkspaceManager } from "./workspaceManager.js";
import { DEFAULT_WORKSPACE_ID, normalizeWorkspaceId } from "./workspaceId.js";
import {
  appendHostAudit,
  authenticateHostUser,
  createHostUser,
  createWorkspaceRecord,
  disableHostUser,
  getWorkspaceRecord,
  grantMembership,
  listAccessibleWorkspaces,
  listHostUsers,
  revokeMembershipRole,
  setWorkspaceStatus
} from "./hostDb.js";
import { issueHostSessionToken, verifyHostSessionToken } from "./hostAuth.js";
import { parseCookieHeader, issueSessionToken, type SessionPayload } from "../auth/sessionTokens.js";
import { extractLeaseCarrier } from "../leases/leaseCarriers.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { initWorkspace } from "../workspace.js";
import { hostDeletedWorkspacesDir, hostWorkspaceDir } from "./workspacePaths.js";
import {
  loadIdentityConfig,
  verifyIdentityConfigSignature
} from "../identity/identityConfig.js";
import {
  clearIdentityCookieHeader,
  localPasswordLogin,
  resolveIdentityRequestContext,
  setIdentityCookieHeader
} from "../identity/identityApi.js";
import { completeOidcCallback, startOidcLogin } from "../identity/oidc/oidcRoutes.js";
import { completeSamlAcs, samlMetadataXml, startSamlLogin } from "../identity/saml/samlRoutes.js";
import { handleScimRoute } from "../identity/scim/scimRoutes.js";
import { rolesForUserIdInWorkspace } from "./hostDb.js";
import { loadLatestForecastArtifact } from "../forecast/forecastStore.js";
import { benchComparisonLatestForApi, benchImportsForApi } from "../bench/benchApi.js";
import { loadBinderCache } from "../audit/binderStore.js";

interface WorkspaceApiRuntime {
  workspaceId: string;
  port: number;
  host: string;
  close: () => Promise<void>;
}

interface HostRuntime {
  host: string;
  port: number;
  close: () => Promise<void>;
}

interface StartWorkspaceRouterOptions {
  hostDir: string;
  host: string;
  port: number;
  defaultWorkspaceId?: string;
  allowedCidrs?: string[];
  trustedProxyHops?: number;
  maxRequestBytes?: number;
  corsAllowedOrigins?: string[];
}

interface HostEventPayload {
  type: string;
  ts: number;
  workspaceId?: string;
  summaryHash?: string;
  version?: number;
}

class HostSseHub {
  private readonly clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    this.clients.add(res);
  }

  remove(res: ServerResponse): void {
    this.clients.delete(res);
  }

  emit(event: HostEventPayload): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  closeAll(): void {
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        // noop
      }
    }
    this.clients.clear();
  }
}

async function pickFreeLocalPort(host = "127.0.0.1"): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    probe.once("error", rejectPromise);
    probe.listen(0, host, () => resolvePromise());
  });
  const addr = probe.address();
  await new Promise<void>((resolvePromise) => probe.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate local port");
  }
  return addr.port;
}

async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readJsonBody<T extends Record<string, unknown>>(raw: string): T {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return Object.create(null) as T;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON body must be an object");
    }
    return parsed as T;
  } catch {
    throw new Error("INVALID_JSON_BODY");
  }
}

async function readRequestJsonBody<T extends Record<string, unknown>>(req: IncomingMessage, maxBytes = 1_048_576): Promise<T> {
  return readJsonBody<T>(await readBody(req, maxBytes));
}

function isUnsafeObjectKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function hostSessionCookiePath(): string {
  return "/host";
}

function hostSessionCookieName(): string {
  return "amc_host_session";
}

function setHostSessionCookie(res: ServerResponse, token: string, maxAgeSeconds: number): void {
  res.setHeader(
    "set-cookie",
    `${hostSessionCookieName()}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=${hostSessionCookiePath()}; Max-Age=${Math.max(
      60,
      maxAgeSeconds
    )}`
  );
}

function clearHostSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "set-cookie",
    `${hostSessionCookieName()}=; HttpOnly; SameSite=Strict; Path=${hostSessionCookiePath()}; Max-Age=0`
  );
}

function setWorkspaceSessionCookie(res: ServerResponse, workspaceId: string, token: string, maxAgeSeconds: number): void {
  const path = `/w/${workspaceId}`;
  res.setHeader(
    "set-cookie",
    `amc_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=${Math.max(60, maxAgeSeconds)}`
  );
}

function clearWorkspaceSessionCookie(res: ServerResponse, workspaceId: string): void {
  const path = `/w/${workspaceId}`;
  res.setHeader("set-cookie", `amc_session=; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=0`);
}

function workspaceFromLeaseToken(token: string): string | null {
  try {
    const [payloadPart] = token.split(".");
    if (!payloadPart) {
      return null;
    }
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const bytes = Buffer.from(`${normalized}${pad}`, "base64");
    const payload = JSON.parse(bytes.toString("utf8")) as { workspaceId?: unknown };
    if (typeof payload.workspaceId !== "string") {
      return null;
    }
    return normalizeWorkspaceId(payload.workspaceId);
  } catch {
    return null;
  }
}

function summarizeWorkspaceReadiness(manager: WorkspaceManager, workspaceId: string): {
  workspaceId: string;
  ready: boolean;
  reasons: string[];
} {
  const ready = manager.workspaceReady(workspaceId);
  return {
    workspaceId,
    ready: ready.ok,
    reasons: ready.reasons
  };
}

function summarizeWorkspaceForecast(manager: WorkspaceManager, workspaceId: string): {
  workspaceId: string;
  generatedTs: number | null;
  status: "OK" | "INSUFFICIENT_EVIDENCE" | "MISSING";
  maturityOverall: number | null;
  integrityIndex: number | null;
  riskIndexComposite: number | null;
  valueComposite: number | null;
  advisoryCount: number;
} {
  try {
    return manager.withWorkspace(workspaceId, (context) => {
      const latest = loadLatestForecastArtifact(context.workspaceDir, {
        type: "WORKSPACE",
        id: "workspace"
      });
      if (!latest) {
        return {
          workspaceId,
          generatedTs: null,
          status: "MISSING" as const,
          maturityOverall: null,
          integrityIndex: null,
          riskIndexComposite: null,
          valueComposite: null,
          advisoryCount: 0
        };
      }
      const maturityOverall =
        latest.series.maturityOverall.points[latest.series.maturityOverall.points.length - 1]?.value ?? null;
      const integrityIndex =
        latest.series.integrityIndex.points[latest.series.integrityIndex.points.length - 1]?.value ?? null;
      const riskIds = [
        "EcosystemFocusRisk",
        "ClarityPathRisk",
        "EconomicSignificanceRisk",
        "RiskAssuranceRisk",
        "DigitalDualityRisk"
      ] as const;
      const riskValues = riskIds
        .map((id) => latest.series.indices[id]?.points.at(-1)?.value)
        .filter((value): value is number => typeof value === "number");
      const riskIndexComposite =
        riskValues.length > 0 ? Number((riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length).toFixed(6)) : null;
      const valueIds = ["EmotionalValue", "FunctionalValue", "EconomicValue", "BrandValue", "LifetimeValue"] as const;
      const valueValues = valueIds
        .map((id) => latest.series.value[id]?.points.at(-1)?.value)
        .filter((value): value is number => typeof value === "number");
      const valueComposite =
        valueValues.length > 0 ? Number((valueValues.reduce((sum, value) => sum + value, 0) / valueValues.length).toFixed(6)) : null;
      return {
        workspaceId,
        generatedTs: latest.generatedTs,
        status: latest.status,
        maturityOverall,
        integrityIndex,
        riskIndexComposite,
        valueComposite,
        advisoryCount: latest.advisories.length
      };
    });
  } catch {
    return {
      workspaceId,
      generatedTs: null,
      status: "MISSING",
      maturityOverall: null,
      integrityIndex: null,
      riskIndexComposite: null,
      valueComposite: null,
      advisoryCount: 0
    };
  }
}

function summarizeWorkspaceBench(manager: WorkspaceManager, workspaceId: string): {
  workspaceId: string;
  comparisonTs: number | null;
  ecosystemPercentile: number | null;
  peerGroup: string | null;
  warnings: string[];
  importsCount: number;
} {
  try {
    return manager.withWorkspace(workspaceId, (context) => {
      const latest = benchComparisonLatestForApi(context.workspaceDir).latest;
      const importsCount = benchImportsForApi(context.workspaceDir).length;
      if (!latest) {
        return {
          workspaceId,
          comparisonTs: null,
          ecosystemPercentile: null,
          peerGroup: null,
          warnings: ["NO_COMPARISON"],
          importsCount
        };
      }
      return {
        workspaceId,
        comparisonTs: latest.generatedTs,
        ecosystemPercentile: latest.percentiles.overall ?? null,
        peerGroup: latest.peerGroup.id,
        warnings: latest.warnings,
        importsCount
      };
    });
  } catch {
    return {
      workspaceId,
      comparisonTs: null,
      ecosystemPercentile: null,
      peerGroup: null,
      warnings: ["BENCH_UNAVAILABLE"],
      importsCount: 0
    };
  }
}

function summarizeWorkspaceAudit(manager: WorkspaceManager, workspaceId: string): {
  workspaceId: string;
  generatedTs: number | null;
  trustLabel: "LOW" | "MEDIUM" | "HIGH" | null;
  controls: { pass: number; fail: number; insufficient: number };
  binderId: string | null;
  status: "OK" | "INSUFFICIENT_EVIDENCE" | "MISSING";
} {
  try {
    return manager.withWorkspace(workspaceId, (context) => {
      const latest = loadBinderCache({
        workspace: context.workspaceDir,
        scopeType: "WORKSPACE",
        scopeId: "workspace"
      });
      if (!latest) {
        return {
          workspaceId,
          generatedTs: null,
          trustLabel: null,
          controls: {
            pass: 0,
            fail: 0,
            insufficient: 0
          },
          binderId: null,
          status: "MISSING" as const
        };
      }
      const controls = latest.sections.controls.families.reduce(
        (acc, family) => {
          acc.pass += family.statusSummary.pass;
          acc.fail += family.statusSummary.fail;
          acc.insufficient += family.statusSummary.insufficient;
          return acc;
        },
        { pass: 0, fail: 0, insufficient: 0 }
      );
      return {
        workspaceId,
        generatedTs: latest.generatedTs,
        trustLabel: latest.trust.trustLabel,
        controls,
        binderId: latest.binderId,
        status: latest.sections.maturity.status
      };
    });
  } catch {
    return {
      workspaceId,
      generatedTs: null,
      trustLabel: null,
      controls: {
        pass: 0,
        fail: 0,
        insufficient: 0
      },
      binderId: null,
      status: "MISSING"
    };
  }
}

function leasePresentForRequest(req: IncomingMessage, url: URL): boolean {
  const lease = extractLeaseCarrier({
    headers: req.headers,
    url,
    allowQueryCarrier: false
  });
  return Boolean(lease.leaseToken);
}

function mustHostSession(req: IncomingMessage, hostDir: string): {
  ok: boolean;
  status: number;
  payload?: ReturnType<typeof verifyHostSessionToken>["payload"];
  error?: string;
} {
  const token = parseCookieHeader(req.headers.cookie, hostSessionCookieName());
  if (!token) {
    return { ok: false, status: 401, error: "missing host session" };
  }
  const verified = verifyHostSessionToken({
    hostDir,
    token
  });
  if (!verified.ok || !verified.payload) {
    return { ok: false, status: 401, error: verified.error ?? "invalid host session" };
  }
  return { ok: true, status: 200, payload: verified.payload };
}

interface ResolvedHostAccess {
  ok: boolean;
  status: number;
  username?: string;
  userId?: string | null;
  isHostAdmin?: boolean;
  csrfToken?: string | null;
  usingIdentitySession?: boolean;
  error?: string;
}

function resolveHostAccess(req: IncomingMessage, hostDir: string): ResolvedHostAccess {
  const identitySig = verifyIdentityConfigSignature(hostDir);
  if (identitySig.valid) {
    const identityConfig = loadIdentityConfig(hostDir);
    const resolved = resolveIdentityRequestContext({
      hostDir,
      config: identityConfig,
      cookieHeader: req.headers.cookie
    });
    if (resolved.ok && resolved.user) {
      return {
        ok: true,
        status: 200,
        username: resolved.user.username,
        userId: resolved.user.userId,
        isHostAdmin: resolved.user.isHostAdmin,
        csrfToken: resolved.user.csrfToken,
        usingIdentitySession: true
      };
    }
  }
  const legacy = mustHostSession(req, hostDir);
  if (!legacy.ok || !legacy.payload) {
    return {
      ok: false,
      status: legacy.status,
      error: legacy.error
    };
  }
  return {
    ok: true,
    status: 200,
    username: legacy.payload.username,
    userId: null,
    isHostAdmin: legacy.payload.isHostAdmin,
    csrfToken: null,
    usingIdentitySession: false
  };
}

function requireHostAccess(req: IncomingMessage, hostDir: string, requireAdmin = false): ResolvedHostAccess {
  const resolved = resolveHostAccess(req, hostDir);
  if (!resolved.ok) {
    return resolved;
  }
  if (requireAdmin && !resolved.isHostAdmin) {
    return {
      ok: false,
      status: 403,
      error: "host admin required",
      username: resolved.username,
      userId: resolved.userId,
      isHostAdmin: resolved.isHostAdmin,
      csrfToken: resolved.csrfToken,
      usingIdentitySession: resolved.usingIdentitySession
    };
  }
  return resolved;
}

function hostRoleToUserRoles(hostRoles: string[]): SessionPayload["roles"] {
  const mapped = new Set<SessionPayload["roles"][number]>();
  for (const role of hostRoles) {
    const upper = role.toUpperCase();
    if (upper === "OWNER" || upper === "AUDITOR" || upper === "OPERATOR" || upper === "VIEWER") {
      mapped.add(upper as SessionPayload["roles"][number]);
    }
  }
  if (mapped.has("OWNER")) {
    mapped.add("APPROVER");
  }
  return Array.from(mapped) as SessionPayload["roles"];
}

function resolveWorkspaceRolesForHostAccess(hostDir: string, workspaceId: string, access: ResolvedHostAccess): SessionPayload["roles"] {
  if (!access.ok || !access.username) {
    return [];
  }
  if (access.isHostAdmin) {
    return ["OWNER", "OPERATOR", "AUDITOR", "APPROVER", "VIEWER"];
  }
  if (access.userId) {
    const roles = rolesForUserIdInWorkspace({ hostDir, userId: access.userId, workspaceId });
    return hostRoleToUserRoles(roles);
  }
  const legacy = listAccessibleWorkspaces(hostDir, access.username).find((row) => row.workspaceId === workspaceId);
  return hostRoleToUserRoles(legacy?.roles ?? []);
}

function parseUrlEncodedForm(raw: string): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  for (const part of raw.split("&")) {
    if (!part) {
      continue;
    }
    const [key, value = ""] = part.split("=");
    if (!key) {
      continue;
    }
    try {
      const decodedKey = decodeURIComponent(key.replace(/\+/g, " "));
      if (isUnsafeObjectKey(decodedKey)) {
        continue;
      }
      out[decodedKey] = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      continue;
    }
  }
  return out;
}

async function proxyToWorkspace(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: WorkspaceApiRuntime,
  targetPath: string
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const upstream = httpRequest(
    {
      host: runtime.host,
      port: runtime.port,
      method,
      path: targetPath,
      headers: {
        ...req.headers,
        host: `${runtime.host}:${runtime.port}`
      }
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode ?? 500;
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (typeof value !== "undefined") {
          res.setHeader(key, value);
        }
      }
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", (error) => {
    json(res, 502, { error: `workspace proxy failure: ${String(error)}` });
  });
  req.pipe(upstream);
}

export async function startWorkspaceRouter(options: StartWorkspaceRouterOptions): Promise<HostRuntime> {
  const manager = new WorkspaceManager({
    hostDir: options.hostDir,
    defaultWorkspaceId: options.defaultWorkspaceId ?? DEFAULT_WORKSPACE_ID,
    maxOpenWorkspaces: 32
  });
  const workspaceApis = new Map<string, WorkspaceApiRuntime>();
  const hostEvents = new HostSseHub();

  const ensureWorkspaceApi = async (workspaceId: string): Promise<WorkspaceApiRuntime> => {
    const normalized = manager.resolveWorkspaceId(workspaceId);
    const existing = workspaceApis.get(normalized);
    if (existing) {
      return existing;
    }
    const runtime = manager.withWorkspace(normalized, (context) => {
      const token = ensureAdminToken(context.workspaceDir);
      return {
        workspaceId: normalized,
        workspaceDir: context.workspaceDir,
        token
      };
    });
    const localPort = await pickFreeLocalPort("127.0.0.1");
    const api = await startStudioApiServer({
      workspace: runtime.workspaceDir,
      host: "127.0.0.1",
      port: localPort,
      token: runtime.token,
      allowedCidrs: options.allowedCidrs,
      trustedProxyHops: options.trustedProxyHops,
      maxRequestBytes: options.maxRequestBytes,
      corsAllowedOrigins: options.corsAllowedOrigins
    });
    const result: WorkspaceApiRuntime = {
      workspaceId: normalized,
      host: "127.0.0.1",
      port: localPort,
      close: async () => api.close()
    };
    workspaceApis.set(normalized, result);
    return result;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${options.host}:${options.port}`);
      const pathname = url.pathname;

      if (pathname === "/host/healthz") {
        json(res, 200, { ok: true, mode: "host" });
        return;
      }

      if (pathname === "/host/readyz" || pathname === "/readyz" || pathname === "/healthz") {
        const ids = manager.listWorkspaceIds();
        const workspaces = ids.map((workspaceId) => summarizeWorkspaceReadiness(manager, workspaceId));
        json(res, 200, {
          status: "READY",
          mode: "host",
          summary: {
            total: workspaces.length,
            ready: workspaces.filter((row) => row.ready).length,
            notReady: workspaces.filter((row) => !row.ready).length
          },
          workspaces
        });
        return;
      }

      if (pathname === "/host/events") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        res.write(`data: ${JSON.stringify({ type: "PORTFOLIO_UPDATED", ts: Date.now(), version: 1 })}\n\n`);
        hostEvents.add(res);
        req.on("close", () => hostEvents.remove(res));
        return;
      }

      if (pathname.startsWith("/host/") && pathname !== "/host/healthz" && pathname !== "/host/readyz") {
        if (leasePresentForRequest(req, url)) {
          json(res, 403, { error: "lease-auth is not allowed on host endpoints" });
          return;
        }
      }

      const identitySig = verifyIdentityConfigSignature(options.hostDir);
      const identityConfig = loadIdentityConfig(options.hostDir);

      const identityUntrusted =
        pathname.startsWith("/host/api/auth/") || pathname.startsWith(identityConfig.identity.scim.basePath);
      if (identityUntrusted && !identitySig.valid) {
        json(res, 503, {
          error: "IDENTITY_CONFIG_UNTRUSTED",
          reason: identitySig.reason
        });
        return;
      }

      if ((pathname === "/host/api/login" || pathname === "/host/api/auth/login") && req.method === "POST") {
        const body = await readRequestJsonBody<{
          username?: unknown;
          password?: unknown;
        }>(req, options.maxRequestBytes ?? 1_048_576);
        const username = typeof body.username === "string" ? body.username : "";
        const password = typeof body.password === "string" ? body.password : "";

        let local:
          | ReturnType<typeof localPasswordLogin>
          | {
              ok: false;
              status: number;
              error: string;
              runtimeError: true;
            };
        try {
          local = localPasswordLogin({
            hostDir: options.hostDir,
            config: identityConfig,
            username,
            password,
            setCookie: (token, maxAgeSeconds) => {
              setIdentityCookieHeader({
                config: identityConfig,
                token,
                maxAgeSeconds,
                setHeader: (name, value) => res.setHeader(name, value)
              });
            }
          });
        } catch (error) {
          local = {
            ok: false,
            status: 500,
            error: error instanceof Error ? error.message : String(error),
            runtimeError: true
          };
        }
        if (local.ok && local.user) {
          // Backward-compatible host-only session cookie for legacy clients/tests.
          const issued = issueHostSessionToken({
            hostDir: options.hostDir,
            userId: local.user.userId,
            username: local.user.username,
            isHostAdmin: local.user.isHostAdmin
          });
          const existingSetCookie = res.getHeader("set-cookie");
          const legacy = `${hostSessionCookieName()}=${encodeURIComponent(issued.token)}; HttpOnly; SameSite=Strict; Path=${hostSessionCookiePath()}; Max-Age=${Math.max(
            60,
            Math.floor((issued.payload.expiresTs - issued.payload.issuedTs) / 1000)
          )}`;
          if (Array.isArray(existingSetCookie)) {
            res.setHeader("set-cookie", [...existingSetCookie, legacy]);
          } else if (typeof existingSetCookie === "string") {
            res.setHeader("set-cookie", [existingSetCookie, legacy]);
          } else {
            res.setHeader("set-cookie", legacy);
          }
          json(res, 200, {
            ok: true,
            user: local.user
          });
          return;
        }
        if ("runtimeError" in local && local.runtimeError) {
          // Compatibility path for host deployments that still rely on legacy host sessions
          // without identity-session storage initialized.
          const legacyAuth = authenticateHostUser({
            hostDir: options.hostDir,
            username,
            password
          });
          if (legacyAuth.ok && legacyAuth.user) {
            const issued = issueHostSessionToken({
              hostDir: options.hostDir,
              userId: legacyAuth.user.userId,
              username: legacyAuth.user.username,
              isHostAdmin: legacyAuth.user.isHostAdmin
            });
            setHostSessionCookie(
              res,
              issued.token,
              Math.floor((issued.payload.expiresTs - issued.payload.issuedTs) / 1000)
            );
            appendHostAudit(options.hostDir, "HUMAN_LOGIN_SUCCESS", legacyAuth.user.username, {
              route: "/host/api/login",
              mode: "legacy_fallback"
            });
            json(res, 200, {
              ok: true,
              user: {
                userId: legacyAuth.user.userId,
                username: legacyAuth.user.username,
                isHostAdmin: legacyAuth.user.isHostAdmin
              },
              authMode: "LEGACY"
            });
            return;
          }
          appendHostAudit(options.hostDir, "HUMAN_LOGIN_FAILED", username || null, {
            route: "/host/api/login",
            mode: "legacy_fallback"
          });
          json(res, 401, { error: legacyAuth.error ?? "invalid credentials" });
          return;
        }
        json(res, local.status, { error: local.error ?? "login failed" });
        return;
      }

      if (pathname === "/host/api/auth/providers" && req.method === "GET") {
        json(res, 200, {
          providers: identityConfig.identity.providers
            .filter((provider) => provider.enabled)
            .map((provider) => ({
              id: provider.id,
              type: provider.type,
              displayName: provider.displayName
            })),
          localAuth: {
            enabled: identityConfig.identity.localAuth.enabled,
            passwordLoginEnabled: identityConfig.identity.localAuth.passwordLoginEnabled
          },
          identitySignatureValid: identitySig.valid
        });
        return;
      }

      if (pathname === "/host/api/auth/me" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        json(res, 200, {
          ok: true,
          user: {
            username: auth.username,
            userId: auth.userId ?? null,
            isHostAdmin: Boolean(auth.isHostAdmin)
          },
          authMode: auth.usingIdentitySession ? "IDENTITY" : "LEGACY"
        });
        return;
      }

      if ((pathname === "/host/api/auth/logout" || pathname === "/host/api/logout") && req.method === "POST") {
        clearHostSessionCookie(res);
        clearIdentityCookieHeader({
          config: identityConfig,
          setHeader: (name, value) => {
            const existing = res.getHeader(name);
            if (!existing) {
              res.setHeader(name, value);
              return;
            }
            if (Array.isArray(existing)) {
              res.setHeader(name, [...existing, value]);
              return;
            }
            res.setHeader(name, [String(existing), value]);
          }
        });
        json(res, 200, { ok: true });
        return;
      }

      if (pathname.startsWith("/host/api/auth/oidc/") && pathname.endsWith("/login") && req.method === "GET") {
        const providerId = pathname.split("/")[5] ?? "";
        let started;
        try {
          started = await startOidcLogin({
            hostDir: options.hostDir,
            config: identityConfig,
            providerId
          });
        } catch (error) {
          json(res, 400, { error: String(error) });
          return;
        }
        res.statusCode = 302;
        res.setHeader("location", started.redirectUrl);
        res.end();
        return;
      }

      if (pathname.startsWith("/host/api/auth/oidc/") && pathname.endsWith("/callback") && req.method === "GET") {
        const providerId = pathname.split("/")[5] ?? "";
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        if (!code || !state) {
          json(res, 400, { error: "missing code/state" });
          return;
        }
        let completed;
        try {
          completed = await completeOidcCallback({
            hostDir: options.hostDir,
            config: identityConfig,
            providerId,
            code,
            state
          });
        } catch (error) {
          const message = String(error);
          if (message.includes("state mismatch") || message.includes("state expired")) {
            json(res, 400, { error: message });
            return;
          }
          if (message.includes("nonce mismatch") || message.includes("signature invalid")) {
            json(res, 401, { error: message });
            return;
          }
          if (message.includes("missing email") || message.includes("email not verified")) {
            json(res, 403, { error: message });
            return;
          }
          json(res, 401, { error: message });
          return;
        }
        setIdentityCookieHeader({
          config: identityConfig,
          token: completed.token,
          maxAgeSeconds: identityConfig.identity.session.ttlMinutes * 60,
          setHeader: (name, value) => res.setHeader(name, value)
        });
        res.statusCode = 302;
        res.setHeader("location", "/host/console");
        res.end();
        return;
      }

      if (pathname.startsWith("/host/api/auth/saml/") && pathname.endsWith("/metadata") && req.method === "GET") {
        const providerId = pathname.split("/")[5] ?? "";
        res.statusCode = 200;
        res.setHeader("content-type", "application/samlmetadata+xml; charset=utf-8");
        res.end(samlMetadataXml(identityConfig, providerId));
        return;
      }

      if (pathname.startsWith("/host/api/auth/saml/") && pathname.endsWith("/login") && req.method === "GET") {
        const providerId = pathname.split("/")[5] ?? "";
        let started;
        try {
          started = startSamlLogin({
            hostDir: options.hostDir,
            config: identityConfig,
            providerId
          });
        } catch (error) {
          json(res, 400, { error: String(error) });
          return;
        }
        res.statusCode = 302;
        res.setHeader("location", started.redirectUrl);
        res.end();
        return;
      }

      if (pathname.startsWith("/host/api/auth/saml/") && pathname.endsWith("/acs") && req.method === "POST") {
        const providerId = pathname.split("/")[5] ?? "";
        const raw = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const form = parseUrlEncodedForm(raw);
        const samlResponse = form.SAMLResponse ?? "";
        const relayState = form.RelayState ?? "";
        if (!samlResponse || !relayState) {
          json(res, 400, { error: "missing SAMLResponse or RelayState" });
          return;
        }
        let completed;
        try {
          completed = completeSamlAcs({
            hostDir: options.hostDir,
            config: identityConfig,
            providerId,
            samlResponseB64: samlResponse,
            relayState
          });
        } catch (error) {
          const message = String(error);
          if (message.includes("relay state")) {
            json(res, 400, { error: message });
            return;
          }
          if (message.includes("invalid SAML response")) {
            json(res, 401, { error: message });
            return;
          }
          if (message.includes("missing required")) {
            json(res, 403, { error: message });
            return;
          }
          json(res, 401, { error: message });
          return;
        }
        setIdentityCookieHeader({
          config: identityConfig,
          token: completed.token,
          maxAgeSeconds: identityConfig.identity.session.ttlMinutes * 60,
          setHeader: (name, value) => res.setHeader(name, value)
        });
        res.statusCode = 302;
        res.setHeader("location", "/host/console");
        res.end();
        return;
      }

      if (await handleScimRoute({
        req,
        res,
        url,
        hostDir: options.hostDir,
        identityConfig,
        isHttps: options.host.startsWith("https") || options.port === 443,
        maxRequestBytes: options.maxRequestBytes
      })) {
        return;
      }

      if (pathname === "/host/api/workspaces" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        const visible = listAccessibleWorkspaces(options.hostDir, auth.username);
        const enriched = visible.map((row) => ({
          ...row,
          readiness: summarizeWorkspaceReadiness(manager, row.workspaceId)
        }));
        json(res, 200, {
          workspaces: enriched
        });
        return;
      }

      if (pathname === "/host/api/portfolio/forecast" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        const visible = listAccessibleWorkspaces(options.hostDir, auth.username);
        const rows = visible.map((row) => ({
          workspaceId: row.workspaceId,
          name: row.name,
          status: row.status,
          roles: row.roles,
          readiness: summarizeWorkspaceReadiness(manager, row.workspaceId),
          forecast: summarizeWorkspaceForecast(manager, row.workspaceId)
        }));
        json(res, 200, {
          workspaceCount: rows.length,
          rows
        });
        return;
      }

      if (pathname === "/host/api/bench/portfolio" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        const visible = listAccessibleWorkspaces(options.hostDir, auth.username);
        const rows = visible.map((row) => ({
          workspaceId: row.workspaceId,
          name: row.name,
          status: row.status,
          roles: row.roles,
          readiness: summarizeWorkspaceReadiness(manager, row.workspaceId),
          bench: summarizeWorkspaceBench(manager, row.workspaceId)
        }));
        json(res, 200, {
          workspaceCount: rows.length,
          rows
        });
        return;
      }

      if (pathname === "/host/api/audit/portfolio" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "unauthorized" });
          return;
        }
        const visible = listAccessibleWorkspaces(options.hostDir, auth.username);
        const rows = visible.map((row) => ({
          workspaceId: row.workspaceId,
          name: row.name,
          status: row.status,
          roles: row.roles,
          readiness: summarizeWorkspaceReadiness(manager, row.workspaceId),
          audit: summarizeWorkspaceAudit(manager, row.workspaceId)
        }));
        json(res, 200, {
          workspaceCount: rows.length,
          rows
        });
        return;
      }

      if (pathname === "/host/api/users" && req.method === "GET") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        json(res, 200, { users: listHostUsers(options.hostDir) });
        return;
      }

      if (pathname === "/host/api/workspaces" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{
          workspaceId?: unknown;
          name?: unknown;
        }>(req, options.maxRequestBytes ?? 1_048_576);
        const workspaceId = normalizeWorkspaceId(typeof body.workspaceId === "string" ? body.workspaceId : "");
        const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : workspaceId;
        const created = createWorkspaceRecord({
          hostDir: options.hostDir,
          workspaceId,
          name
        });
        const dir = hostWorkspaceDir(options.hostDir, workspaceId);
        initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
        grantMembership({
          hostDir: options.hostDir,
          username: auth.username,
          workspaceId,
          role: "OWNER"
        });
        grantMembership({
          hostDir: options.hostDir,
          username: auth.username,
          workspaceId,
          role: "AUDITOR"
        });
        appendHostAudit(options.hostDir, "WORKSPACE_CREATED", auth.username, {
          workspaceId
        });
        hostEvents.emit({
          type: "WORKSPACE_CREATED",
          ts: Date.now(),
          workspaceId,
          version: 1,
          summaryHash: sha256Hex(`${workspaceId}:${created.createdTs}`)
        });
        json(res, 201, {
          workspace: created,
          ready: summarizeWorkspaceReadiness(manager, workspaceId)
        });
        return;
      }

      if (pathname === "/host/api/workspaces/delete" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{ workspaceId?: unknown }>(req, options.maxRequestBytes ?? 1_048_576);
        const workspaceId = normalizeWorkspaceId(typeof body.workspaceId === "string" ? body.workspaceId : "");
        const from = hostWorkspaceDir(options.hostDir, workspaceId);
        const to = `${hostDeletedWorkspacesDir(options.hostDir)}/${workspaceId}_${Date.now()}`;
        try {
          renameSync(from, to);
        } catch {
          // if directory is already absent we still mark deleted in host metadata
        }
        setWorkspaceStatus(options.hostDir, workspaceId, "DELETED");
        appendHostAudit(options.hostDir, "WORKSPACE_DELETED", auth.username, { workspaceId, tombstone: to });
        hostEvents.emit({
          type: "WORKSPACE_DELETED",
          ts: Date.now(),
          workspaceId,
          version: 1,
          summaryHash: sha256Hex(`${workspaceId}:${to}`)
        });
        json(res, 200, { ok: true, workspaceId, tombstone: to });
        return;
      }

      if (pathname === "/host/api/users/add" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{
          username?: unknown;
          password?: unknown;
          isHostAdmin?: unknown;
        }>(req, options.maxRequestBytes ?? 1_048_576);
        const created = createHostUser({
          hostDir: options.hostDir,
          username: typeof body.username === "string" ? body.username : "",
          password: typeof body.password === "string" ? body.password : "",
          isHostAdmin: Boolean(body.isHostAdmin)
        });
        appendHostAudit(options.hostDir, "USER_CREATED", auth.username, {
          username: created.username,
          isHostAdmin: created.isHostAdmin
        });
        json(res, 201, { ok: true, user: created });
        return;
      }

      if (pathname === "/host/api/users/disable" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{ username?: unknown }>(req, options.maxRequestBytes ?? 1_048_576);
        const username = typeof body.username === "string" ? body.username : "";
        disableHostUser(options.hostDir, username);
        appendHostAudit(options.hostDir, "USER_DISABLED", auth.username, { username });
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/host/api/memberships/grant" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{
          username?: unknown;
          workspaceId?: unknown;
          role?: unknown;
        }>(req, options.maxRequestBytes ?? 1_048_576);
        grantMembership({
          hostDir: options.hostDir,
          username: typeof body.username === "string" ? body.username : "",
          workspaceId: normalizeWorkspaceId(typeof body.workspaceId === "string" ? body.workspaceId : ""),
          role: String(body.role ?? "VIEWER") as "OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER"
        });
        appendHostAudit(options.hostDir, "MEMBERSHIP_GRANTED", auth.username, {
          username: body.username,
          workspaceId: body.workspaceId,
          role: body.role
        });
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/host/api/memberships/revoke" && req.method === "POST") {
        const auth = requireHostAccess(req, options.hostDir, true);
        if (!auth.ok || !auth.username) {
          json(res, auth.status, { error: auth.error ?? "host admin required" });
          return;
        }
        const body = await readRequestJsonBody<{
          username?: unknown;
          workspaceId?: unknown;
          role?: unknown;
        }>(req, options.maxRequestBytes ?? 1_048_576);
        revokeMembershipRole({
          hostDir: options.hostDir,
          username: typeof body.username === "string" ? body.username : "",
          workspaceId: normalizeWorkspaceId(typeof body.workspaceId === "string" ? body.workspaceId : ""),
          role: String(body.role ?? "VIEWER") as "OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER"
        });
        appendHostAudit(options.hostDir, "MEMBERSHIP_REVOKED", auth.username, {
          username: body.username,
          workspaceId: body.workspaceId,
          role: body.role
        });
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/host/console") {
        res.statusCode = 302;
        res.setHeader("location", "/host/console/host.html");
        res.end();
        return;
      }

      if (pathname === "/host/console/host.html") {
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>AMC Host</title><style>body{font-family:system-ui;margin:1rem}input,button{font:inherit}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.4rem}code{background:#f4f4f4;padding:.1rem .25rem}</style></head><body><h1>AMC Host Portfolio</h1><p id='status'>Loading…</p><div><label>Username <input id='u'/></label> <label>Password <input id='p' type='password'/></label> <button id='login'>Login</button></div><h2>Workspaces</h2><table id='tbl'><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Roles</th><th>Open</th></tr></thead><tbody></tbody></table><script type='module'>const st=document.getElementById('status');const tbody=document.querySelector('#tbl tbody');async function load(){try{const r=await fetch('/host/api/workspaces',{credentials:'include'});if(!r.ok){st.textContent='Not logged in';tbody.innerHTML='';return;}const j=await r.json();st.textContent='Loaded';tbody.innerHTML=(j.workspaces||[]).map(w=>`<tr><td><code>${w.workspaceId}</code></td><td>${w.name}</td><td>${w.status}</td><td>${(w.roles||[]).join(', ')}</td><td><a href='/w/${w.workspaceId}/console'>Open</a></td></tr>`).join('');}catch(e){st.textContent=String(e);}}document.getElementById('login').addEventListener('click',async()=>{const username=document.getElementById('u').value;const password=document.getElementById('p').value;const r=await fetch('/host/api/login',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});if(!r.ok){st.textContent='Login failed';return;}await load();});load();</script></body></html>"
        );
        return;
      }

      const aliasPrefix = (() => {
        if (pathname.startsWith("/api/") || pathname === "/api") {
          return "api";
        }
        if (pathname.startsWith("/console") || pathname.startsWith("/events/")) {
          return "plain";
        }
        return null;
      })();
      if (aliasPrefix) {
        const defaultId = manager.resolveWorkspaceId(options.defaultWorkspaceId ?? DEFAULT_WORKSPACE_ID);
        const target = aliasPrefix === "api" ? pathname.replace(/^\/api/, "/") : pathname;
        const runtime = await ensureWorkspaceApi(defaultId);
        await proxyToWorkspace(req, res, runtime, target);
        return;
      }

      const wsMatch = /^\/w\/([^/]+)(\/.*)?$/.exec(pathname);
      if (!wsMatch) {
        json(res, 404, { error: "not found" });
        return;
      }
      const urlWorkspaceId = normalizeWorkspaceId(wsMatch[1] ?? "");
      const rest = wsMatch[2] ?? "/";
      const workspacePath = rest.startsWith("/api/") ? rest.slice("/api".length) : rest;

      if (workspacePath === "/healthz") {
        json(res, 200, {
          ok: true,
          mode: "workspace",
          workspaceId: urlWorkspaceId
        });
        return;
      }

      if (workspacePath === "/readyz") {
        const readiness = summarizeWorkspaceReadiness(manager, urlWorkspaceId);
        json(res, readiness.ready ? 200 : 503, {
          status: readiness.ready ? "READY" : "NOT_READY",
          workspaceId: readiness.workspaceId,
          reasons: readiness.reasons
        });
        return;
      }

      if ((workspacePath === "/login" || workspacePath === "/api/login" || workspacePath === "/auth/login") && req.method === "POST") {
        const hostAccess = resolveHostAccess(req, options.hostDir);
        let userId = "";
        let username = "";
        let roles: SessionPayload["roles"] = [];

        if (hostAccess.ok && hostAccess.username) {
          userId = hostAccess.userId ?? "";
          username = hostAccess.username;
          roles = resolveWorkspaceRolesForHostAccess(options.hostDir, urlWorkspaceId, hostAccess);
        } else {
          const body = await readRequestJsonBody<{ username?: unknown; password?: unknown }>(
            req,
            options.maxRequestBytes ?? 1_048_576
          );
          const inputUsername = typeof body.username === "string" ? body.username : "";
          const inputPassword = typeof body.password === "string" ? body.password : "";
          const auth = authenticateHostUser({
            hostDir: options.hostDir,
            username: inputUsername,
            password: inputPassword
          });
          if (!auth.ok || !auth.user) {
            json(res, 401, { error: auth.error ?? "invalid credentials" });
            return;
          }
          userId = auth.user.userId;
          username = auth.user.username;
          roles = auth.user.isHostAdmin
            ? ["OWNER", "OPERATOR", "AUDITOR", "APPROVER", "VIEWER"]
            : hostRoleToUserRoles(
                listAccessibleWorkspaces(options.hostDir, auth.user.username).find((row) => row.workspaceId === urlWorkspaceId)?.roles ?? []
              );
        }
        if (roles.length === 0) {
          json(res, 403, { error: "membership required" });
          return;
        }
        const runtime = await ensureWorkspaceApi(urlWorkspaceId);
        const issued = issueSessionToken({
          workspace: manager.withWorkspace(urlWorkspaceId, (context) => context.workspaceDir),
          userId,
          username,
          roles,
          ttlMs: 8 * 60 * 60_000
        });
        setWorkspaceSessionCookie(res, urlWorkspaceId, issued.token, Math.floor((issued.payload.expiresTs - issued.payload.issuedTs) / 1000));
        json(res, 200, {
          ok: true,
          workspaceId: runtime.workspaceId,
          user: {
            userId,
            username,
            roles
          }
        });
        return;
      }

      if ((workspacePath === "/logout" || workspacePath === "/api/logout" || workspacePath === "/auth/logout") && req.method === "POST") {
        clearWorkspaceSessionCookie(res, urlWorkspaceId);
        json(res, 200, { ok: true });
        return;
      }

      let effectiveWorkspaceId = urlWorkspaceId;
      const lease = extractLeaseCarrier({
        headers: req.headers,
        url,
        allowQueryCarrier: false
      });
      if (lease.leaseToken) {
        const claimWorkspaceId = workspaceFromLeaseToken(lease.leaseToken);
        if (claimWorkspaceId && claimWorkspaceId !== urlWorkspaceId) {
          effectiveWorkspaceId = claimWorkspaceId;
          try {
            manager.withWorkspace(claimWorkspaceId, (context) => {
              const ledger = openLedger(context.workspaceDir);
              const sessionId = `host-router-${Date.now()}`;
              const payload = JSON.stringify({
                auditType: "SUSPICIOUS_WORKSPACE_OVERRIDE_ATTEMPT",
                severity: "HIGH",
                leaseWorkspaceId: claimWorkspaceId,
                requestedWorkspaceId: urlWorkspaceId,
                path: pathname
              });
              ledger.startSession({
                sessionId,
                runtime: "unknown",
                binaryPath: "amc-host-router",
                binarySha256: sha256Hex("amc-host-router")
              });
              ledger.appendEvidenceWithReceipt({
                sessionId,
                runtime: "unknown",
                eventType: "audit",
                payload,
                inline: true,
                payloadExt: "json",
                meta: {
                  auditType: "SUSPICIOUS_WORKSPACE_OVERRIDE_ATTEMPT",
                  severity: "HIGH",
                  leaseWorkspaceId: claimWorkspaceId,
                  requestedWorkspaceId: urlWorkspaceId,
                  trustTier: "OBSERVED"
                },
                receipt: {
                  kind: "guard_check",
                  agentId: "unknown",
                  providerId: "host-router",
                  model: null,
                  bodySha256: sha256Hex(Buffer.from(payload, "utf8"))
                }
              });
              ledger.sealSession(sessionId);
              ledger.close();
            });
          } catch {
            // best effort; deny-by-default remains inside target API lease checks
          }
        }
      }

      if (!lease.leaseToken) {
        const hostAccess = resolveHostAccess(req, options.hostDir);
        if (hostAccess.ok) {
          const roles = resolveWorkspaceRolesForHostAccess(options.hostDir, urlWorkspaceId, hostAccess);
          if (roles.length === 0) {
            json(res, 403, { error: "membership required" });
            return;
          }
          const hasWorkspaceSession = Boolean(parseCookieHeader(req.headers.cookie, "amc_session"));
          const canMintWorkspaceSession = hostAccess.username && hostAccess.userId;
          if (!hasWorkspaceSession && canMintWorkspaceSession && (workspacePath === "/" || workspacePath.startsWith("/console"))) {
            const issued = issueSessionToken({
              workspace: manager.withWorkspace(urlWorkspaceId, (context) => context.workspaceDir),
              userId: hostAccess.userId!,
              username: hostAccess.username!,
              roles,
              ttlMs: 8 * 60 * 60_000
            });
            setWorkspaceSessionCookie(res, urlWorkspaceId, issued.token, Math.floor((issued.payload.expiresTs - issued.payload.issuedTs) / 1000));
            res.statusCode = 302;
            res.setHeader("location", pathname + url.search);
            res.end();
            return;
          }
        }
      }

      const runtime = await ensureWorkspaceApi(effectiveWorkspaceId);
      await proxyToWorkspace(req, res, runtime, workspacePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "PAYLOAD_TOO_LARGE") {
        json(res, 413, { error: "payload too large" });
        return;
      }
      if (message === "INVALID_JSON_BODY") {
        json(res, 400, { error: "invalid JSON body" });
        return;
      }
      json(res, 500, { error: message });
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(options.port, options.host, () => resolvePromise());
  });

  return {
    host: options.host,
    port: options.port,
    close: async () => {
      hostEvents.closeAll();
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      });
      for (const runtime of workspaceApis.values()) {
        await runtime.close();
      }
    }
  };
}
