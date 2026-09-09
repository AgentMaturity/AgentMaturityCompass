import { existsSync, readFileSync, statSync } from "node:fs";
import { CONTROL_HOOK_ROUTE } from "../bridge/hookControl.js";
import type { LeasePayload } from "../leases/leaseSchema.js";
import { revokedLeaseIdSet } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";

/** Authenticate local hook credentials and revocations before any forwarding. */
function tokenModeSecure(path: string): boolean {
  return existsSync(path) && (statSync(path).mode & 0o077) === 0;
}

export function verifyManagedLease(input: {
  workspace: string;
  tokenPath: string;
  expectedAgentId?: string;
  mode?: "observe" | "control";
}): { valid: boolean; expired: boolean; payload: LeasePayload | null; error: string | null } {
  if (!existsSync(input.tokenPath)) {
    return { valid: false, expired: false, payload: null, error: "lease token missing" };
  }
  if (!tokenModeSecure(input.tokenPath)) {
    return { valid: false, expired: false, payload: null, error: "lease token permissions must be 0600" };
  }
  const token = readFileSync(input.tokenPath, "utf8").trim();
  if (!token) return { valid: false, expired: false, payload: null, error: "lease token is empty" };
  let revokedLeaseIds: Set<string>;
  try {
    revokedLeaseIds = revokedLeaseIdSet(input.workspace);
  } catch (error) {
    return {
      valid: false,
      expired: false,
      payload: null,
      error: String(error instanceof Error ? error.message : error)
    };
  }
  let verification = verifyLeaseToken({
    workspace: input.workspace,
    token,
    expectedAgentId: input.expectedAgentId,
    requiredScope: "hook:observe",
    routePath: "/hooks/aep/0.1/events",
    revokedLeaseIds
  });
  if (verification.ok && input.mode === "control") {
    verification = verifyLeaseToken({
      workspace: input.workspace,
      token,
      expectedAgentId: input.expectedAgentId,
      requiredScope: "hook:control",
      routePath: CONTROL_HOOK_ROUTE,
      revokedLeaseIds
    });
  }
  return {
    valid: verification.ok,
    expired: verification.error === "lease expired",
    payload: verification.payload,
    error: verification.error ?? null
  };
}

