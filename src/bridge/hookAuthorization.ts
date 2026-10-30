/**
 * The P1-02 authorization record for a provider hook decision, and the v2 receipt that binds it (P1-22, P1-23).
 *
 * The provider, not AMC, runs the effect, so AMC binds the record when it decides and cannot recheck it at execution
 * the way the tool pipeline does (`recheckAuthorization`). The record says who authorized what at decision time;
 * Claude Code's PostToolUse and Pi's tool_result compare the input that ran with the authorized digest (claudeCodeObservations.ts).
 */
import { authorizationRecordDigest, type AuthorizationRecordV1 } from "../actions/authorizationRecord.js";
import { bindAuthorization, leasePrincipal } from "../actions/authorize.js";
import { piSessionRegistration } from "./piSessionRegistry.js";
import { claudeCodeSessionRegistration } from "./claudeCodeSessionRegistry.js";
import { dshVersionRefusal } from "../adapters/dsh/dshVersions.js";
import { dshSessionRegistration } from "./dshSessionRegistry.js";
import { claudeRequestRefusal } from "../adapters/hookProviders/claudeCodePayloads.js";
import { intakeBackpressure } from "./claudeCodeObservations.js";
import { assertContract } from "../contracts/index.js";
import type { ActionReceiptMembers } from "../receipts/receipt.js";
import { planRequiresPrincipal } from "../tools/guards/compiledPolicyGuard.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
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
function governedSession(input: { ledger: Parameters<typeof piSessionRegistration>[0]; agentId: string; call: HookCall; now: number; leaseId?: string }):
  { refusal: string | null; enforced: boolean; version: string | null } {
  const { call } = input;
  // ACS (P2-19): no installation registers an ACS runtime, so a decision is advisory and its session is not checked.
  if (call.acs) return { refusal: null, enforced: false, version: call.acs.version };
  if (call.dsh) {
    const found = dshSessionRegistration(input.ledger, input.agentId, call.sessionId);
    const refusal = dshVersionRefusal(call.dsh.version)
      ?? (found.status === "missing" ? "This DSH session has no AMC registration, so it is not governed; AMC denied the call."
        : found.status === "invalid" ? `${found.reason}; this DSH session is not governed, so AMC denied the call.`
          : found.record.dshVersion === call.dsh.version ? null
            : `This call names DSH ${call.dsh.version}, but its session registered DSH ${found.record.dshVersion}; AMC denied the call.`);
    return { refusal, enforced: !refusal && found.status === "registered" && found.record.qualified, version: call.dsh.version };
  }
  if (call.pi) {
    const found = piSessionRegistration(input.ledger, input.agentId, call.sessionId);
    const refusal = registrationRefusal(found, call.pi)
      ?? intakeBackpressure({ workspace: input.ledger.workspace, agentId: input.agentId, sessionId: call.sessionId, leaseId: input.leaseId, now: input.now, provider: "pi" });
    return { refusal, enforced: !refusal && found.status === "registered" && found.record.qualified, version: call.pi.version };
  }
  const found = claudeCodeSessionRegistration(input.ledger, input.agentId, call.sessionId);
  if (found.status === "missing") return { refusal: "This Claude Code session has no AMC registration, so it is not governed; AMC denied the call.", enforced: false, version: null };
  if (found.status === "invalid") return { refusal: `${found.reason}; this Claude Code session is not governed, so AMC denied the call.`, enforced: false, version: null };
  const version = found.record.claudeCodeVersion;
  if (!found.record.qualified) return { refusal: `AMC has not qualified Claude Code ${version}, so AMC denied the call.`, enforced: false, version };
  const backpressure = intakeBackpressure({ workspace: input.ledger.workspace, agentId: input.agentId, sessionId: call.sessionId, leaseId: input.leaseId,
    now: input.now });
  if (backpressure) return { refusal: backpressure, enforced: true, version };
  // The request must match the registered release's own schemas, the mapped tool's input included.
  const mismatch = claudeRequestRefusal(version, call.request);
  return mismatch ? { refusal: mismatch, enforced: true, version } : { refusal: null, enforced: true, version };
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
  now: number;
}): { requested: R; authorization: HookAuthorization | null; enforced: boolean; version: string | null } {
  const { call } = input;
  if (!call) return { requested: input.requested, authorization: null, enforced: false, version: null };
  const { refusal, enforced, version } = governedSession({ ledger: input.ledger, agentId: input.agentId, call, now: input.now, leaseId: input.lease?.leaseId });
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
 * record digest, the tool, class and argument digest it authorized, which the call's outcome is compared with, and the
 * lease that obtained it (only that lease may report the call's outcome). For Claude Code also the SHA-256 of the
 * payload bytes as Claude Code sent them, and of the targets AMC resolved (paths followed through symlinks) when it
 * decided: what the decision covers.
 */
export function boundDecisionFacts(call: HookCall, facts: { version: string | null; authorization: HookAuthorization | null; lease?: HookLease;
  targets: ReadonlyArray<{ name: string; args: Record<string, unknown> }> }): Record<string, unknown> {
  const { authorization } = facts;
  return {
    [call.pi ? "piVersion" : call.acs ? "acsVersion" : call.dsh ? "dshVersion" : "claudeCodeVersion"]: facts.version,
    authorizationRecordDigest: authorization?.ok ? authorization.digest : null,
    ...(authorization?.ok ? { authorizedAction: { toolName: authorization.record.action.toolName, actionClass: authorization.record.action.actionClass,
      argumentsDigest: authorization.record.action.argumentsDigest } } : {}),
    leaseId: facts.lease?.leaseId ?? null,
    ...(call.pi || call.acs || call.dsh ? {} : { claudePayloadSha256: call.payloadSha256,
      resolvedTargetsSha256: sha256Hex(canonicalize(facts.targets.map(({ name, args }) => ({ name, args })))) }),
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
