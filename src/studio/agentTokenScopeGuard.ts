/**
 * Static agent-token scope enforcement for Studio routes.
 *
 * A static agent bearer token carries only the scopes and execute action
 * classes its signed grant names (src/studio/studioState.ts). These helpers
 * turn a refusal into a body that names the grant that refused and how an
 * operator widens it, and refuse an execute whose action class the grant does
 * not cover before any intent, ticket or approval is consumed. Humans are
 * role-governed and admins are exempt; a lease-only agent has no token grant
 * (leaseScopeSchema cannot name an action class), so the governor's
 * action-policy-execute condition decides for it.
 */
import { agentTokenWidenText, readAgentToken, studioAgentTokenMetaPath } from "./studioState.js";
import type { ActionClass } from "../types.js";

/** The slice of the route auth context these checks read. */
export interface AgentTokenAuth {
  readonly isAdmin: boolean;
  readonly agentId: string | null;
  readonly username: string | null;
}

/** A scope refusal names the token grant that refused and how an operator widens it. */
export function scopeRefusal(workspace: string, auth: AgentTokenAuth, scope: string): Record<string, unknown> {
  const body: Record<string, unknown> = { error: `missing scope ${scope}` };
  if (auth.agentId === null || auth.username !== "agent-token") {
    return body;
  }
  try {
    const record = readAgentToken(workspace, auth.agentId);
    return {
      ...body,
      refusedBy: {
        kind: "agent-token", metaPath: studioAgentTokenMetaPath(workspace, auth.agentId), scopes: record.scopes,
        executeActionClasses: record.executeActionClasses, grantedBy: record.grantedBy
      },
      widen: agentTokenWidenText(workspace, auth.agentId, scope)
    };
  } catch (error) {
    return { ...body, refusedBy: { kind: "agent-token", reason: error instanceof Error ? error.message : String(error) } };
  }
}

/**
 * toolhub:execute on a static token covers only the action classes its grant
 * names. Refuses before the intent, ticket or approval is consumed.
 */
export function agentExecuteClassCheck(params: {
  workspace: string; auth: AgentTokenAuth; agentId: string; actionClass: ActionClass | null;
}): { ok: true } | { ok: false; body: Record<string, unknown> } {
  const { workspace, auth, agentId, actionClass } = params;
  if (auth.isAdmin || auth.agentId === null || auth.username !== "agent-token") {
    return { ok: true };
  }
  const metaPath = studioAgentTokenMetaPath(workspace, agentId);
  let record: ReturnType<typeof readAgentToken>;
  try {
    record = readAgentToken(workspace, agentId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, body: { error: `agent token grant unreadable: ${reason}`, refusedBy: { kind: "agent-token", metaPath, reason } } };
  }
  if (actionClass === null || !record.executeActionClasses.includes(actionClass)) {
    const missing = actionClass ?? "unknown";
    return {
      ok: false,
      body: {
        error: `toolhub:execute does not cover action class ${missing}`,
        refusedBy: {
          kind: "agent-token", metaPath, scopes: record.scopes,
          executeActionClasses: record.executeActionClasses, grantedBy: record.grantedBy
        },
        widen: agentTokenWidenText(workspace, agentId, missing)
      }
    };
  }
  return { ok: true };
}
