import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRoute, isPublicApiRoute } from "../api/index.js";
import { resolveApiRolePolicy } from "../api/accessPolicy.js";
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import type { NativeTaskService } from "./nativeTaskTypes.js";
import { assertNativeBrowserAdmission, isNativeStudioPath, NativeAdmissionError } from "./nativeAdmission.js";

export interface StudioApiAuthContext {
  isAdmin: boolean;
  agentId: string | null;
  username: string | null;
  roles: ReadonlySet<string>;
  userId?: string | null;
  nativeCsrfToken?: string | null;
  sessionAuthSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
}

export interface StudioApiRateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTs: number;
  retryAfterSeconds: number;
}

export interface StudioApiDelegationParams {
  pathname: string;
  method: string;
  clientIp: string;
  workspace: string;
  token: string;
  req: IncomingMessage;
  res: ServerResponse;
  authenticate: (req: IncomingMessage, workspace: string, adminToken: string) => StudioApiAuthContext | null;
  requireRoles: (params: {
    auth: StudioApiAuthContext;
    res: ServerResponse;
    roles: string[];
    workspace: string;
  }) => boolean;
  json: (res: ServerResponse, status: number, payload: unknown) => void;
  apiLimiter: (key: string) => StudioApiRateLimitDecision;
  privilegedApiLimiter: (key: string) => StudioApiRateLimitDecision;
  setRateLimitHeaders: (res: ServerResponse, decision: StudioApiRateLimitDecision) => void;
  nativeTaskService?: NativeTaskService;
  nativeAllowedOrigins?: readonly string[];
  nativeExecutionAllowed?: () => boolean;
}

/**
 * The identity a write is attributed to, derived from how the caller
 * authenticated — never from request input.
 *
 * By ROLE rather than `username ?? agentId`: agent-token and lease credentials
 * carry a synthetic username ("agent-token", "agent-lease") with the real
 * identity in `agentId`, so the username-first form would record every agent
 * caller under one constant. The bootstrap admin holds the AGENT role too but
 * has no agentId, and is attributed by its own name.
 */
export function principalFromAuth(auth: StudioApiAuthContext): string | null {
  if (auth.roles.has("AGENT") && auth.agentId && auth.agentId.trim().length > 0) {
    return `agent:${auth.agentId.trim()}`;
  }
  const username = auth.username?.trim() ?? "";
  return username.length > 0 ? username : null;
}

export async function handleStudioApiDelegation(params: StudioApiDelegationParams): Promise<boolean> {
  if (!params.pathname.startsWith("/api/v1/")) {
    return false;
  }

  const quotaAuth = params.authenticate(params.req, params.workspace, params.token);
  const quotaKey = quotaAuth?.username ?? quotaAuth?.agentId ?? `ip:${params.clientIp}`;
  const privileged = quotaAuth?.isAdmin === true || (quotaAuth?.roles.has("OWNER") ?? false);
  const quota = (privileged ? params.privilegedApiLimiter : params.apiLimiter)(`api:${quotaKey}`);
  params.setRateLimitHeaders(params.res, quota);
  if (!quota.allowed) {
    params.json(params.res, 429, { error: "API rate limit exceeded" });
    return true;
  }

  let principal: string | undefined;
  let nativeTasks: NativeTaskApiContext | undefined;
  if (!isPublicApiRoute(params.pathname)) {
    const apiAuth = params.authenticate(params.req, params.workspace, params.token);
    if (!apiAuth) {
      params.json(params.res, 401, { error: "missing or invalid token" });
      return true;
    }
    if (!apiAuth.isAdmin && apiAuth.agentId) {
      params.json(params.res, 403, { error: "agent or lease auth cannot access internal /api/v1 routes" });
      return true;
    }
    const accessPolicy = resolveApiRolePolicy(params.pathname, params.method);
    const nativeDemo = apiAuth.userId === "local-demo" && isNativeStudioPath(params.pathname);
    if (
      !params.requireRoles({
        auth: apiAuth,
        res: params.res,
        workspace: params.workspace,
        // Demo VIEWER is admitted only to the separately constrained stub/no-tools task API.
        roles: nativeDemo ? ["VIEWER"] : accessPolicy.roles
      })
    ) {
      return true;
    }
    principal = principalFromAuth(apiAuth) ?? undefined;
    if (isNativeStudioPath(params.pathname)) {
      const actor = { isAdmin: apiAuth.isAdmin, userId: apiAuth.userId ?? null, nativeCsrfToken: apiAuth.nativeCsrfToken ?? null };
      try {
        assertNativeBrowserAdmission({ req: params.req, actor, allowedOrigins: params.nativeAllowedOrigins ?? [] });
      } catch (error) {
        if (!(error instanceof NativeAdmissionError)) throw error;
        params.json(params.res, error.statusCode, { ok: false, error: error.message, code: error.code });
        return true;
      }
      if (!params.nativeTaskService) {
        params.json(params.res, 503, { error: "Native task service is unavailable." });
        return true;
      }
      // A renamed/recreated username must not inherit another user's task ownership.
      const principalId = apiAuth.isAdmin ? "bootstrap-admin"
        : `session:${apiAuth.sessionAuthSource ?? "LOCAL_USER"}:${actor.userId}`;
      nativeTasks = { service: params.nativeTaskService, principalId, demo: actor.userId === "local-demo",
        nativeCsrfToken: actor.nativeCsrfToken, admissionActor: actor,
        executionAllowed: params.nativeExecutionAllowed ?? (() => false) };
    }
  }

  return handleApiRoute(
    params.pathname,
    params.method,
    params.req,
    params.res,
    params.workspace,
    params.token,
    principal,
    nativeTasks
  );
}
