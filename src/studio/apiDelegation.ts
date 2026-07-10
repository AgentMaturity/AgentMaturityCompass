import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRoute, isPublicApiRoute } from "../api/index.js";
import { resolveApiRolePolicy } from "../api/accessPolicy.js";

export interface StudioApiAuthContext {
  isAdmin: boolean;
  agentId: string | null;
  username: string | null;
  roles: ReadonlySet<string>;
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
    if (
      !params.requireRoles({
        auth: apiAuth,
        res: params.res,
        workspace: params.workspace,
        roles: accessPolicy.roles
      })
    ) {
      return true;
    }
  }

  return handleApiRoute(params.pathname, params.method, params.req, params.res, params.workspace, params.token);
}
