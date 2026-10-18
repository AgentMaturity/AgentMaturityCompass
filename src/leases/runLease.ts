import { userInfo } from "node:os";
import { listVerifiedUsers } from "../auth/authApi.js";
import { planRequiresPrincipal } from "../tools/guards/compiledPolicyGuard.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { issueLeaseForPrincipal, LeasePrincipalRefused } from "./leasePrincipal.js";

/** At most an hour, as a Studio native task's runtime lease (P1-67); a resumed or new session mints a fresh one. */
const RUN_LEASE_TTL_MS = 60 * 60_000;

/**
 * The lease a CLI, SDK or ACP native run carries for its workspace tools (P1-79), spread into the composer's options.
 * Under a plan whose identity-binding requires a principal (planRequiresPrincipal, L0-IDN-01) it is minted through
 * issueLeaseForPrincipal for the ACTIVE user of the signed users.yaml whose username is the OS account running this
 * process, never one named by a flag, an environment variable or a request body. No such user refuses
 * (LeasePrincipalRefused, PRINCIPAL_UNRESOLVED) before the caller opens a session and before anything is minted. A lease
 * the composer was handed (a Studio native task, P1-67) is kept; without workspace tools or such a plan, none is minted.
 * The OS account is a local binding: whoever runs as it and can unlock the vault's lease key acts as that user.
 */
export function runLease(input: { readonly workspace: string; readonly agentId: string; readonly model: string; readonly tools: string;
  readonly leaseToken?: string }): { readonly leaseToken?: string } {
  if (input.leaseToken !== undefined) return { leaseToken: input.leaseToken };
  if (input.tools !== "workspace" || !planRequiresPrincipal(input.workspace)) return {};
  return { leaseToken: issueLeaseForPrincipal({ workspace: input.workspace, workspaceId: workspaceIdFromDirectory(input.workspace),
    agentId: input.agentId, principalKey: osUserPrincipalKey(input.workspace), ttlMs: RUN_LEASE_TTL_MS, scopes: ["toolhub:execute"],
    // Gateway-only fields: the lease has no gateway scope, so they grant the least the schema allows.
    routeAllowlist: ["/native-run"], modelAllowlist: [input.model], maxTokensPerMinute: 1, maxRequestsPerMinute: 1, maxCostUsdPerDay: null }).token };
}

/** `LOCAL_USER:<userId>` of the active users.yaml user named as the OS account, from one verified read, or a refusal. */
function osUserPrincipalKey(workspace: string): string {
  let username: string;
  let users: ReturnType<typeof listVerifiedUsers>["users"];
  try {
    username = userInfo().username;
    users = listVerifiedUsers(workspace).users;
  } catch (error) {
    throw new LeasePrincipalRefused(`the OS user or the signed users.yaml could not be read (${error instanceof Error ? error.message : String(error)}); no lease was minted`);
  }
  const user = users.find((candidate) => candidate.username === username && candidate.status === "ACTIVE");
  if (!user) {
    throw new LeasePrincipalRefused(`the active plan requires a principal for every tool call, and the OS user ${username} is not an active user of the signed users.yaml; no lease was minted`);
  }
  return `LOCAL_USER:${user.userId}`;
}
