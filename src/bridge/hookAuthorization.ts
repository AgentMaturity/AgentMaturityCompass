/**
 * The P1-02 authorization record for a provider hook decision, and the v2 receipt that binds it (P1-22).
 *
 * The provider, not AMC, runs the effect, so AMC binds the record when it decides and cannot recheck it at execution
 * the way the tool pipeline does (`recheckAuthorization`). The record says who authorized what at decision time.
 */
import { authorizationRecordDigest, type AuthorizationRecordV1 } from "../actions/authorizationRecord.js";
import { bindAuthorization } from "../actions/authorize.js";
import { assertContract } from "../contracts/index.js";
import type { ActionReceiptMembers } from "../receipts/receipt.js";
import type { ActionClass } from "../types.js";
import { CONTROL_HOOK_EVENTS, type HookControlDecision, type HookProvider, type PiControlContext } from "./hookProviders.js";

/** The canonical tool an authorization record names: the highest-class one the decision evaluated. */
export interface AuthorizationTarget {
  readonly toolName: string;
  readonly actionClass: ActionClass;
}

/** The hook lease the Bridge verified for this request. */
export interface HookLease {
  readonly leaseId: string;
  readonly expiresTs: number;
  readonly executeActionClasses?: readonly ActionClass[];
}

export type HookAuthorization =
  | { readonly ok: true; readonly record: AuthorizationRecordV1; readonly digest: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Bind the record for one decision that lets an effect proceed. Facts, digests and expiry come from P1-02's
 * `bindAuthorization` (signed tools config, policy files, AMC's clock); the principal and delegation come from the
 * verified hook lease; the idempotency key is the provider's call id and the execution id is AMC's action id.
 */
function bindHookAuthorization(input: {
  workspace: string;
  agentId: string;
  provider: HookProvider;
  lease?: HookLease;
  actionId: string;
  parentActionId: string | null;
  idempotencyKey: string;
  toolName: string;
  actionClass: ActionClass;
  toolInput: Readonly<Record<string, unknown>>;
}): HookAuthorization {
  const bound = bindAuthorization({
    token: input.actionId, callId: input.actionId, rootCallId: input.parentActionId ?? input.actionId,
    parentToken: input.parentActionId, name: input.toolName, agentId: input.agentId, workspace: input.workspace,
    actionClass: input.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: input.toolInput,
  }, { delegation: { depth: 0, parentExecutionId: null, allowedActionClasses: input.lease?.executeActionClasses } });
  if (!bound.ok) return { ok: false, reason: `AMC could not bind an authorization record (${bound.failures.join(", ")}): ${bound.reason}` };
  const lease = input.lease;
  try {
    const record = assertContract("authorization-record", {
      ...bound.record,
      executionId: input.actionId,
      expiresAt: lease ? new Date(Math.min(Date.parse(bound.record.expiresAt), lease.expiresTs)).toISOString() : bound.record.expiresAt,
      principal: lease ? { principalId: `lease:${lease.leaseId}`, kind: "service", authenticatedVia: "lease" } : bound.record.principal,
      delegation: { ...bound.record.delegation, leaseId: lease?.leaseId ?? null },
      action: { ...bound.record.action, adapterId: `hook:${input.provider}` },
      idempotencyKey: input.idempotencyKey,
    });
    if (!record.delegation.allowedActionClasses.includes(record.action.actionClass)) {
      return { ok: false, reason: `AMC could not bind an authorization record (scope_widened): the hook lease does not cover ${record.action.actionClass}` };
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      return { ok: false, reason: "AMC could not bind an authorization record (capability_expired): the hook lease has expired" };
    }
    return { ok: true, record, digest: authorizationRecordDigest(record) };
  } catch (error) {
    return { ok: false, reason: `AMC could not bind an authorization record: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * A decision that lets the effect proceed (allow or ask) binds the record; one that cannot bind is denied with the
 * reason, and a deny binds nothing. Only Pi requests bind today.
 */
export function authorizeHookDecision<R extends { decision: string; reason: string; target?: AuthorizationTarget | null }>(input: {
  workspace: string;
  agentId: string;
  provider: HookProvider;
  lease?: HookLease;
  actionId: string;
  pi: PiControlContext | null;
  toolInput: Readonly<Record<string, unknown>>;
  requested: R;
}): { requested: R; authorization: HookAuthorization | null } {
  const { pi, requested } = input;
  if (!pi || (requested.decision !== "allow" && requested.decision !== "ask")) return { requested, authorization: null };
  const authorization: HookAuthorization = requested.target
    ? bindHookAuthorization({ ...input, parentActionId: pi.parentActionId, idempotencyKey: pi.toolCallId, ...requested.target })
    : { ok: false, reason: "AMC could not bind an authorization record: no evaluated tool" };
  return { requested: authorization.ok ? requested : { ...requested, decision: "deny", reason: authorization.reason }, authorization };
}

/**
 * The v2 receipt members of one hook decision: allow is `authorized`, a native ask is `requested` (the provider asks
 * a person; that is not AMC approval), deny is `denied` with its reason. `enforced` only where the provider version
 * is qualified; otherwise the decision is advisory.
 */
export function hookDecisionReceipt(input: {
  provider: HookProvider;
  actionId: string;
  idempotencyKey: string;
  decision: HookControlDecision;
  reason: string;
  authorization: HookAuthorization | null;
  enforced: boolean;
}): ActionReceiptMembers {
  const common = {
    executionId: input.actionId,
    idempotencyKey: input.idempotencyKey,
    authorizationRecordDigest: input.authorization?.ok ? input.authorization.digest : null,
    enforcement: input.enforced
      ? { level: "enforced" as const, boundary: `${input.provider}:${CONTROL_HOOK_EVENTS[input.provider]}` }
      : { level: "advisory" as const },
  };
  if (input.decision === "deny") return { ...common, state: "denied", reason: input.reason };
  return { ...common, state: input.decision === "allow" ? "authorized" : "requested" };
}
