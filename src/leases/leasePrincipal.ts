import { activeUserRecord } from "../auth/authApi.js";
import { planRequiresPrincipal } from "../tools/guards/compiledPolicyGuard.js";
import { issueLeaseToken, type IssueLeaseInput } from "./leaseSigner.js";

/** No lease is minted for a session whose principal does not resolve, under a plan that requires one (P1-78). */
export class LeasePrincipalRefused extends Error {
  readonly code = "PRINCIPAL_UNRESOLVED";
  constructor(message: string) {
    super(`PRINCIPAL_UNRESOLVED: ${message}`);
    this.name = "LeasePrincipalRefused";
  }
}

/**
 * The user a lease minted for `principalKey` names (P1-78), resolved without minting anything, so a caller can refuse
 * before its first side effect. `principalKey` is the session's principal keyed as A4 keys one; `LOCAL_USER:<userId>`
 * names that user when they are active in the signed users.yaml, read and verified here. Anything else (a
 * workspace-router session, the admin token, null, an unknown or inactive user, an unverifiable users.yaml) names
 * nobody: under a verified plan whose identity-binding requires a principal, or a plan that does not verify, that throws
 * LeasePrincipalRefused; otherwise it is null and the lease names no one.
 */
export function resolveLeasePrincipal(workspace: string, principalKey: string | null): { readonly userId: string } | null {
  const userId = /^LOCAL_USER:(.+)$/.exec(principalKey ?? "")?.[1];
  let why = `${principalKey ?? "this session"} is not an active user of the signed users.yaml`;
  let user: ReturnType<typeof activeUserRecord> = null;
  if (userId !== undefined) {
    try {
      user = activeUserRecord(workspace, userId);
    } catch (error) {
      why = `users.yaml could not be verified (${error instanceof Error ? error.message : String(error)})`;
    }
  }
  if (user === null && planRequiresPrincipal(workspace)) {
    throw new LeasePrincipalRefused(`the active plan requires a principal for every tool call, and ${why}; no lease was minted`);
  }
  return user === null ? null : { userId: user.userId };
}

/**
 * Mint a lease for an authenticated session (P1-78): Studio native tasks, and A4's Assemble connect and Activate leases.
 * The principal resolves as resolveLeasePrincipal resolves it, once more here (a refusal mints nothing); the bind
 * resolves the named user again, and the recheck once more.
 */
export function issueLeaseForPrincipal(input: Omit<IssueLeaseInput, "principal"> & { readonly principalKey: string | null }):
  ReturnType<typeof issueLeaseToken> {
  const { principalKey, ...lease } = input;
  const user = resolveLeasePrincipal(lease.workspace, principalKey);
  return issueLeaseToken({ ...lease, ...(user === null ? {} : { principal: { userId: user.userId } }) });
}
