import type { IncomingHttpHeaders } from "node:http";
import { revokedLeaseIdSet } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { findAgentByToken } from "./studioState.js";

export interface StudioAgentCredential {
  agentId: string;
  scopes: Set<string>;
  username: "agent-token" | "agent-lease";
}

/**
 * Agent credentials supplied together are constraints on one identity. A static
 * token must not hide a narrower or revoked lease in another carrier. Human
 * sessions and bootstrap administration are resolved separately by Studio.
 */
export function authenticateStudioAgent(params: {
  workspace: string;
  headers: IncomingHttpHeaders;
  rawHeaders: readonly string[];
  url: URL;
  allowQueryCarrier: boolean;
}): StudioAgentCredential | null {
  // Node may discard duplicate Authorization values in its normalized headers.
  // Inspect the original carrier names before any credential can shadow one.
  const securityHeaders = new Set(["authorization", "x-amc-agent-token", "x-amc-lease",
    "x-api-key", "x-goog-api-key", "api-key"]);
  const seen = new Set<string>();
  for (let index = 0; index < params.rawHeaders.length; index += 2) {
    const name = params.rawHeaders[index]!.toLowerCase();
    if (!securityHeaders.has(name)) continue;
    if (seen.has(name)) return null;
    seen.add(name);
  }
  const grants: Array<{ agentId: string; scopes: readonly string[] }> = [];
  const leases: string[] = [];
  let hasStaticToken = false;
  const agentToken = params.headers["x-amc-agent-token"];
  if (agentToken !== undefined) {
    if (typeof agentToken !== "string" || agentToken.trim().length === 0) return null;
    const resolved = findAgentByToken(params.workspace, agentToken);
    if (resolved === null) return null;
    grants.push(resolved);
    hasStaticToken = true;
  }

  const authorization = params.headers.authorization;
  if (authorization !== undefined) {
    if (typeof authorization !== "string") return null;
    const bearer = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (bearer === null) return null;
    const token = bearer[1]!;
    const resolved = findAgentByToken(params.workspace, token);
    if (resolved === null) leases.push(token);
    else {
      grants.push(resolved);
      hasStaticToken = true;
    }
  }

  for (const header of ["x-amc-lease", "x-api-key", "x-goog-api-key", "api-key"] as const) {
    const value = params.headers[header];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length === 0) return null;
    leases.push(value);
  }
  const queryLeases = params.url.searchParams.getAll("amc_lease");
  if (queryLeases.length > 0) {
    if (!params.allowQueryCarrier || queryLeases.length !== 1 || queryLeases[0]!.trim().length === 0) return null;
    leases.push(queryLeases[0]!);
  }

  if (leases.length > 0) {
    // Read the authenticated revocation set once. Never replace an unreadable
    // store with an empty set or fall back to the static token on a bad lease.
    try {
      const revokedLeaseIds = revokedLeaseIdSet(params.workspace);
      const expectedWorkspaceId = workspaceIdFromDirectory(params.workspace);
      for (const token of leases) {
        const verification = verifyLeaseToken({ workspace: params.workspace, token,
          expectedWorkspaceId, revokedLeaseIds });
        if (!verification.ok || verification.payload === null) return null;
        grants.push(verification.payload);
      }
    } catch {
      return null;
    }
  }

  const first = grants[0];
  if (first === undefined || grants.some(grant => grant.agentId !== first.agentId)) return null;
  let scopes = new Set(first.scopes);
  for (const grant of grants.slice(1)) {
    // Preserve an explicit static wildcard only when every supplied constraint
    // also permits it; a lease's finite scopes always narrow that authority.
    const allowed = new Set(grant.scopes);
    if (scopes.has("*")) scopes = allowed;
    else if (!allowed.has("*")) scopes = new Set([...scopes].filter(scope => allowed.has(scope)));
  }
  return { agentId: first.agentId, scopes, username: hasStaticToken ? "agent-token" : "agent-lease" };
}
