/**
 * The P1-02 authorization record for a provider hook decision, and the v2 receipt that binds it (P1-22, P1-23).
 *
 * The provider, not AMC, runs the effect, so AMC binds the record when it decides and cannot recheck it at execution
 * the way the tool pipeline does (`recheckAuthorization`). The record says who authorized what at decision time; for
 * Claude Code, PostToolUse compares the input that ran with the authorized digest (hookPostExecution.ts).
 */
import { authorizationRecordDigest, type AuthorizationRecordV1 } from "../actions/authorizationRecord.js";
import { bindAuthorization, leasePrincipal } from "../actions/authorize.js";
import { piSessionRegistration } from "./piSessionRegistry.js";
import { claudeCodeSessionRegistration } from "./claudeCodeSessionRegistry.js";
import { assertContract } from "../contracts/index.js";
import type { ActionReceiptMembers } from "../receipts/receipt.js";
import { planRequiresPrincipal } from "../tools/guards/compiledPolicyGuard.js";
import type { ActionClass } from "../types.js";
import { CONTROL_HOOK_EVENTS, type HookCall, type HookControlDecision, type HookProvider, type PiControlContext } from "./hookProviders.js";

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
  /** The user the lease's issuer named (P1-78); the lease's own identity is never a principal. */
  readonly principal?: { readonly userId: string };
}

export type HookAuthorization =
  | { readonly ok: true; readonly record: AuthorizationRecordV1; readonly digest: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Bind the record for one decision that lets an effect proceed. Facts, digests and expiry come from P1-02's
 * `bindAuthorization` (signed tools config, policy files, AMC's clock); the delegation and the principal come from the
 * verified hook lease: the user its issuer named, resolved in the signed users.yaml (P1-78), else the self-reported OS
 * user, which a plan requiring a principal refuses. The idempotency key is the provider's call id and the execution id
 * is AMC's action id.
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
  const named = lease?.principal ? leasePrincipal(input.workspace, lease) : null;
  if (named && "ok" in named) return { ok: false, reason: `AMC could not bind an authorization record (${named.failures.join(", ")}): ${named.reason}` };
  if (!named && planRequiresPrincipal(input.workspace)) {
    return { ok: false, reason: "AMC could not bind an authorization record (principal_unresolved): the active plan requires a named principal, and the hook lease names none" };
  }
  try {
    const record = assertContract("authorization-record", {
      ...bound.record,
      executionId: input.actionId,
      expiresAt: lease ? new Date(Math.min(Date.parse(bound.record.expiresAt), lease.expiresTs)).toISOString() : bound.record.expiresAt,
      principal: named?.principal ?? bound.record.principal,
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

/** Why a Pi call is not governed: its session has no verified registration of this Pi (piSessionRegistry.ts), or null. */
function registrationRefusal(found: ReturnType<typeof piSessionRegistration>, pi: PiControlContext): string | null {
  if (found.status === "missing") return "This Pi session has no AMC registration, so it is not governed; AMC denied the call.";
  if (found.status === "invalid") return `${found.reason}; this Pi session is not governed, so AMC denied the call.`;
  return found.record.piVersion === pi.version ? null
    : `This call names Pi ${pi.version}, but its session registered Pi ${found.record.piVersion}; AMC denied the call.`;
}

/** A call's session registration: why it is not governed (or null), whether it is enforced, and the provider version it bound. */
function governedSession(input: { ledger: Parameters<typeof piSessionRegistration>[0]; agentId: string; call: HookCall }):
  { refusal: string | null; enforced: boolean; version: string | null } {
  const { call } = input;
  if (call.pi) {
    const found = piSessionRegistration(input.ledger, input.agentId, call.sessionId);
    const refusal = registrationRefusal(found, call.pi);
    return { refusal, enforced: !refusal && found.status === "registered" && found.record.qualified, version: call.pi.version };
  }
  const found = claudeCodeSessionRegistration(input.ledger, input.agentId, call.sessionId);
  if (found.status === "missing") return { refusal: "This Claude Code session has no AMC registration, so it is not governed; AMC denied the call.", enforced: false, version: null };
  if (found.status === "invalid") return { refusal: `${found.reason}; this Claude Code session is not governed, so AMC denied the call.`, enforced: false, version: null };
  const version = found.record.claudeCodeVersion;
  return found.record.qualified ? { refusal: null, enforced: true, version }
    : { refusal: `AMC has not qualified Claude Code ${version}, so AMC denied the call.`, enforced: false, version };
}

/**
 * A Pi or Claude Code call is governed only in a session with a verified registration under the current installation
 * (piSessionRegistry.ts, claudeCodeSessionRegistry.ts); otherwise it is denied and nothing reads enforced, and so is
 * every call from an unqualified version. An allow binds the record; one that cannot bind is denied with the reason. A
 * deny binds nothing, and so does an ask, which control denies because a provider-local ask is not AMC approval.
 */
export function authorizeHookDecision<R extends { decision: string; reason: string; target?: AuthorizationTarget | null }>(input: {
  workspace: string;
  agentId: string;
  provider: HookProvider;
  lease?: HookLease;
  actionId: string;
  call: HookCall | null;
  toolInput: Readonly<Record<string, unknown>>;
  ledger: Parameters<typeof piSessionRegistration>[0];
  requested: R;
}): { requested: R; authorization: HookAuthorization | null; enforced: boolean; version: string | null } {
  const { call } = input;
  if (!call) return { requested: input.requested, authorization: null, enforced: false, version: null };
  const { refusal, enforced, version } = governedSession({ ledger: input.ledger, agentId: input.agentId, call });
  if (refusal) return { requested: { ...input.requested, decision: "deny", reason: refusal }, authorization: null, enforced: false, version };
  const requested = input.requested;
  if (requested.decision !== "allow") return { requested, authorization: null, enforced, version };
  const authorization: HookAuthorization = requested.target
    ? bindHookAuthorization({ ...input, idempotencyKey: call.callId, ...requested.target, parentActionId: call.parentActionId })
    : { ok: false, reason: "AMC could not bind an authorization record: no evaluated tool" };
  return { requested: authorization.ok ? requested : { ...requested, decision: "deny", reason: authorization.reason }, authorization, enforced, version };
}

/**
 * What a decision's ledger row records about its call: the provider version its session bound, the authorization
 * record digest, and the tool, class and argument digest it authorized, which PostToolUse compares with what ran.
 */
export function boundDecisionFacts(call: HookCall, version: string | null, authorization: HookAuthorization | null): Record<string, unknown> {
  return {
    [call.pi ? "piVersion" : "claudeCodeVersion"]: version,
    authorizationRecordDigest: authorization?.ok ? authorization.digest : null,
    ...(authorization?.ok ? { authorizedAction: { toolName: authorization.record.action.toolName, actionClass: authorization.record.action.actionClass,
      argumentsDigest: authorization.record.action.argumentsDigest } } : {}),
  };
}

/**
 * The v2 receipt members of one hook decision: allow is `authorized`, deny is `denied` with its reason, and a native
 * ask (another provider asking a person, which is not AMC approval) is `requested`. `enforced` only where the provider version
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
