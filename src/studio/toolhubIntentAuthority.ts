import type { IncomingMessage } from "node:http";
import { URL } from "node:url";
import { resolve } from "node:path";
import type { UserRole } from "../auth/roles.js";
import type { ActionClass } from "../types.js";
import { sessionFromRequest } from "../auth/authApi.js";
import { parseCookieHeader } from "../auth/sessionTokens.js";
import { nativeCsrfTokenForSession } from "./nativeAdmission.js";
import { authenticateStudioAgent } from "./agentCredentialAuth.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { extractLeaseCarrier } from "../leases/leaseCarriers.js";
import { readRevokedLeaseIds } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { hasAnyRole } from "../auth/rbac.js";
import { canonicalize } from "../utils/json.js";
import { inCheckPass } from "../utils/checkPass.js";

export interface AuthContext {
  isAdmin: boolean;
  agentId: string | null;
  scopes: Set<string>;
  roles: Set<UserRole>;
  username: string | null;
  userId: string | null;
  nativeCsrfToken: string | null;
  sessionAuthSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
}

function leaseQueryCarrierEnabled(workspace: string): boolean {
  try {
    return loadGatewayConfig(workspace).lease.allowQueryCarrier === true;
  } catch {
    return false;
  }
}

export function authenticate(req: IncomingMessage, workspace: string, adminToken: string): AuthContext | null {
  const suppliedAdmin = req.headers["x-amc-admin-token"];
  if (typeof suppliedAdmin === "string" && suppliedAdmin === adminToken) {
    return {
      isAdmin: true,
      agentId: null,
      scopes: new Set(["*"]),
      roles: new Set(["OWNER", "AUDITOR", "APPROVER", "OPERATOR", "VIEWER", "AGENT"]),
      username: "bootstrap-admin",
      userId: "bootstrap-admin",
      nativeCsrfToken: null
    };
  }

  const session = sessionFromRequest({
    workspace,
    req
  });
  if (session.ok && session.payload) {
    return {
      isAdmin: false,
      agentId: null,
      scopes: new Set(["console:session"]),
      roles: new Set<UserRole>(session.payload.userId === "local-demo" ? ["VIEWER"] : session.payload.roles),
      username: session.payload.username,
      userId: session.payload.userId,
      nativeCsrfToken: nativeCsrfTokenForSession(session.payload),
      sessionAuthSource: session.authSource
    };
  }

  const agent = authenticateStudioAgent({
    workspace, headers: req.headers, rawHeaders: req.rawHeaders,
    url: new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`),
    allowQueryCarrier: leaseQueryCarrierEnabled(workspace)
  });
  return agent === null ? null : {
    isAdmin: false, agentId: agent.agentId, scopes: agent.scopes,
    roles: new Set(["AGENT"]), username: agent.username,
    userId: null, nativeCsrfToken: null
  };
}

export function hasScope(auth: AuthContext, scope: string): boolean {
  return auth.isAdmin || auth.scopes.has("*") || auth.scopes.has(scope);
}

export function verifyLeaseForScope(params: {
  workspace: string;
  req: IncomingMessage;
  expectedAgentId: string;
  scope: "toolhub:intent" | "toolhub:execute" | "governor:check" | "receipt:verify" | "diagnostic:self-run";
  routePath?: string;
  model?: string | null;
  actionClass?: ActionClass;
}): { ok: true } | { ok: false; status: number; error: string } {
  const parsedUrl = new URL(params.req.url ?? "/", `http://${params.req.headers.host ?? "127.0.0.1"}`);
  const carrier = extractLeaseCarrier({
    headers: params.req.headers,
    url: parsedUrl,
    allowQueryCarrier: leaseQueryCarrierEnabled(params.workspace)
  });
  const leaseToken = carrier.leaseToken ?? undefined;
  if (!leaseToken) {
    return {
      ok: false,
      status: 401,
      error: "missing lease token"
    };
  }
  const revocations = readRevokedLeaseIds(params.workspace);
  if (!revocations.ok) {
    return {
      ok: false,
      status: 401,
      error: `lease revocation signature invalid: ${revocations.reason}`
    };
  }
  const revoked = revocations.ids;
  const expectedWorkspaceId = workspaceIdFromDirectory(params.workspace);
  const verification = verifyLeaseToken({
    workspace: params.workspace,
    token: leaseToken,
    expectedWorkspaceId,
    expectedAgentId: params.expectedAgentId,
    requiredScope: params.scope,
    routePath: params.routePath,
    model: params.model,
    revokedLeaseIds: revoked,
    ...(params.actionClass === undefined ? {} : { actionClass: params.actionClass })
  });
  if (!verification.ok) {
    const message = verification.error ?? "lease verification failed";
    const status = message.includes("scope denied") ||
      message.includes("route denied") ||
      message.includes("model denied") ||
      message.includes("agent mismatch") ||
      message.includes("workspace mismatch")
      ? 403
      : 401;
    return {
      ok: false,
      status,
      error: message
    };
  }
  return { ok: true };
}

export class StudioToolhubIntentAuthorityError extends Error {
  constructor(readonly status: number, message: string) {
    super(message); this.name = "StudioToolhubIntentAuthorityError";
  }
}

/** Fixed negative continuation over the actual request, options reference, same carrier and original identity. */
export function captureStudioToolhubIntentAuthority(req: IncomingMessage, options: { workspace: string; token: string },
  agentId: string, expectedIdentity: Pick<AuthContext, "isAdmin" | "userId" | "agentId">) {
  const originalWorkspace = options.workspace, workspace = resolve(originalWorkspace), token = options.token;
  const identity = { ...expectedIdentity }, method = req.method, pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).pathname;
  const carrier = () => extractLeaseCarrier({ headers: req.headers,
    url: new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`), allowQueryCarrier: leaseQueryCarrierEnabled(originalWorkspace) });
  const originalCarrier = canonicalize(carrier());
  // Authentication may consume several credentials while the lease reader selects only its first carrier.
  // Keep exact consumed values private; this comparison never supplies authentication or permission.
  const securityHeaders = ["authorization", "x-amc-agent-token", "x-amc-lease", "x-api-key", "x-goog-api-key", "api-key"];
  const credentialInputs = () => {
    const admin = req.headers["x-amc-admin-token"];
    if (identity.isAdmin) return canonicalize({ admin });
    const session = parseCookieHeader(req.headers.cookie, "amc_session");
    if (identity.agentId === null) return canonicalize({ admin, session });
    const names: string[] = [];
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const name = req.rawHeaders[index]!.toLowerCase();
      if (securityHeaders.includes(name)) names.push(name);
    }
    return canonicalize({ admin, session,
      headers: securityHeaders.map(name => [name, req.headers[name] ?? null]),
      names: names.sort(),
      query: new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).searchParams.getAll("amc_lease") });
  };
  const originalCredentials = credentialInputs();
  const assertOriginalCredentials = () => {
    if (credentialInputs() !== originalCredentials)
      throw new StudioToolhubIntentAuthorityError(401, "original tool intent authentication credentials changed while signing");
  };
  let failure: { cause: unknown } | null = null;
  const assertCurrent = inCheckPass(() => {
    if (failure !== null) throw failure.cause;
    try {
      if (options.workspace !== originalWorkspace || resolve(originalWorkspace) !== workspace || options.token !== token
        || req.method !== method || method !== "POST"
        || new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`).pathname !== pathname || pathname !== "/toolhub/intent")
        throw new StudioToolhubIntentAuthorityError(401, "original tool intent request authority changed while signing");
      const current = authenticate(req, originalWorkspace, token);
      if (current === null || current.isAdmin !== identity.isAdmin || current.userId !== identity.userId || current.agentId !== identity.agentId)
        throw new StudioToolhubIntentAuthorityError(401, "authenticated authority changed while signing tool intent");
      if (!hasScope(current, "toolhub:intent") && !hasAnyRole([...current.roles], ["OPERATOR", "OWNER", "APPROVER", "AUDITOR"]))
        throw new StudioToolhubIntentAuthorityError(403, "toolhub:intent authority no longer permits this request");
      if (!current.isAdmin && current.agentId !== agentId) throw new StudioToolhubIntentAuthorityError(403, "scope does not include this agent");
      assertOriginalCredentials();
      if (canonicalize(carrier()) !== originalCarrier) throw new StudioToolhubIntentAuthorityError(401, "original tool intent lease carrier changed while signing");
      const lease = verifyLeaseForScope({ workspace: originalWorkspace, req, expectedAgentId: agentId, scope: "toolhub:intent" });
      if (!lease.ok) throw new StudioToolhubIntentAuthorityError(lease.status, lease.error);
      if (canonicalize(carrier()) !== originalCarrier) throw new StudioToolhubIntentAuthorityError(401, "original tool intent lease carrier changed while checking");
      assertOriginalCredentials();
    } catch (cause) { failure = { cause }; throw cause; }
  });
  assertCurrent(); return assertCurrent;
}
