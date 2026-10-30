import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { UserRole } from "../auth/roles.js";
import { resolveAgentId } from "../fleet/paths.js";
import { passportBadgeAttemptForApiAsync } from "../passport/passportApi.js";
import { passportPublicationFailure } from "../passport/passportPublication.js";
import type { StudioApiAuthContext } from "./apiDelegation.js";

/** One GET badge route: original self-agent identity or the existing four human roles, with native Studio seams. */
export async function handleStudioPassportBadge<T extends StudioApiAuthContext>(params: {
  req: IncomingMessage; res: ServerResponse; url: URL; options: { workspace: string; token: string }; auth: T;
  authenticate(req: IncomingMessage, workspace: string, token: string): T | null;
  requireRoles(input: { auth: T; res: ServerResponse; workspace: string; roles: UserRole[] }): boolean;
  json(res: ServerResponse, status: number, payload: unknown): void;
}): Promise<void> {
  const { req, res, url, options, authenticate, requireRoles, json } = params, originalWorkspace = options.workspace;
  const workspace = resolve(originalWorkspace), token = options.token;
  const self = Boolean(params.auth.agentId), query = self ? null : url.searchParams.get("agentId") ?? "default";
  const roles: UserRole[] = ["VIEWER", "OPERATOR", "AUDITOR", "OWNER"];
  if (!self && !requireRoles({ auth: params.auth, res, workspace, roles })) return;
  const agentId = self ? params.auth.agentId! : resolveAgentId(workspace, query!);
  const identity = (auth: StudioApiAuthContext) => JSON.stringify([auth.isAdmin, auth.userId ?? null, auth.username, auth.agentId, auth.sessionAuthSource ?? null]);
  const originalIdentity = identity(params.auth);
  const refused = (status: number, message: string): never => {
    if (!res.headersSent) json(res, status, { error: message });
    throw new Error(message);
  };
  const actor = () => {
    if (options.workspace !== originalWorkspace || resolve(originalWorkspace) !== workspace || options.token !== token)
      refused(403, "original badge workspace or token changed");
    const current = authenticate(req, workspace, token);
    if (current === null) return refused(401, "missing or invalid token");
    if (identity(current) !== originalIdentity || Boolean(current.agentId) !== self || (self && current.agentId !== agentId))
      refused(403, "authenticated badge authority changed while preparing the response");
    if (!self) {
      const selected = url.searchParams.get("agentId") ?? "default";
      if (selected !== query || resolveAgentId(workspace, selected) !== agentId) refused(403, "original badge agent selection changed");
      if (!requireRoles({ auth: current, res, workspace, roles })) throw new Error("current badge roles are refused");
    }
  };
  actor(); let attempt: Awaited<ReturnType<typeof passportBadgeAttemptForApiAsync>> | null = null;
  try {
    attempt = await passportBadgeAttemptForApiAsync({ workspace, agentId }, { beforePublish: actor });
    attempt.assertCurrent(); actor();
    if (!res.headersSent) json(res, 200, { badge: attempt.result.badge });
  } catch (cause) {
    if (attempt === null) throw cause;
    throw Object.assign(passportPublicationFailure(workspace, "badge-response", attempt.publishedPaths, attempt.createdDirectories, null, cause,
      attempt.createdHash, attempt.exportedHash, attempt.sharedProgressUnknown), { policyAttempted: attempt.policyAttempted, policyReturned: attempt.policyReturned });
  }
}
