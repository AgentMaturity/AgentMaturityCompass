/**
 * Bind an authorization record at the enforcement point and recheck it at execution (P1-02).
 *
 * `bindAuthorization` builds the record from trusted sources only: the signed tools config, the workspace's policy
 * files, AMC's clock and approvals named through the trusted authority channel. `recheckAuthorization` recomputes
 * every fact, re-verifies every approval against the exact intent about to run, then consumes the approvals. Any
 * difference, and any store it cannot read, denies. See docs/adr/009-authorization-record.md.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { intersectDelegationScopes } from "../agent/delegationScope.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { cliInitiator, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { activeUserRecord } from "../auth/authApi.js";
import { assertContract } from "../contracts/index.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { LeasePayload } from "../leases/leaseSchema.js";
import type { EffectDeclaration } from "../toolhub/toolsSchema.js";
import { revokedLeaseIdSet } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import {
  AUTHZ_SCHEMA, authorizationRecordDigest, intentDifferences, intentHashFor, intentPayloadFor,
  type AuthorizationIntent, type AuthorizationRecordV1, type RecheckFailure, type RecheckResult
} from "./authorizationRecord.js";
import { mintIdempotencyKey } from "./idempotency.js";
import { normalizeArguments } from "./normalizeArguments.js";

/**
 * The deploymentId of a record no active compiled plan binds to a deployment: no plan, or one compiled before P1-78.
 * Such a record names its workspace and deploymentDigest only and claims no deployment (docs/adr/009-authorization-record.md).
 */
export const DEPLOYMENT_NOT_BOUND = "not_bound";
/** A record with no shorter-lived authority expires this soon after it is bound. */
const DEFAULT_RECORD_TTL_MS = 5 * 60_000;
const APPROVAL_REQUEST_ID = /^apprreq_[a-f0-9]{32}$/;

/** The verified compiled policy a session pinned (P1-12): its digest (64 hex), journal revision, and admitting control. */
export interface CompiledPolicyFacts {
  readonly digest: string;
  readonly revision: number;
  /** The tenant and deployment its profile names (P1-78); null when the plan names none. */
  readonly deployment: { readonly tenantId: string; readonly deploymentId: string } | null;
  controlFor(actionClass: ActionClass): { readonly controlId: string; readonly controlVersion: string | null } | null;
}

/** Who is acting. Composition sets it; nothing here comes from the model's arguments. */
export interface AuthorizationContext {
  readonly sessionId?: string | null;
  readonly runAs?: string;
  /** A delegated child's place in its chain and its scope. Absent at the root. */
  readonly delegation?: {
    readonly depth: number;
    /** For an in-process child, the signed delegation packet that authorized it. */
    readonly parentExecutionId: string | null;
    readonly allowedActionClasses?: readonly ActionClass[];
  };
  /** A signed lease the call runs under; rechecked against revocations and its execute classes. */
  readonly leaseToken?: string;
  /** Approvals named through the trusted channel: the approval gate, the pipeline's own stage, or ToolHub. */
  readonly authority?: { readonly approvalRequestIds: readonly string[] };
  /** The compiled policy the session runs under (P1-12); absent means none. */
  readonly compiledPolicy?: CompiledPolicyFacts;
  /** Evidence the record cites: the session's effective-policy receipt (P1-12). */
  readonly evidenceRefs?: readonly string[];
}

type Failed = { readonly ok: false; readonly failures: readonly RecheckFailure[]; readonly reason: string };
/** `effects` is the signed tool definition's declaration (P1-04), or null when it declares none. */
export type BindResult =
  | { readonly ok: true; readonly record: AuthorizationRecordV1; readonly digest: string; readonly effects: EffectDeclaration | null }
  | Failed;
export type AuthorizationIntentResult =
  | { readonly ok: true; readonly payload: AuthorizationIntent; readonly question: string } | Failed;
type Call = Pick<ToolExecution, "workspace" | "name" | "actionClass" | "effectiveMode" | "arguments">;
type Facts = Pick<AuthorizationRecordV1, "scope" | "policy" | "action" | "bindings"> & {
  readonly agentSuppliedMetadata: Record<string, unknown> | null;
  readonly effects: EffectDeclaration | null;
};

/**
 * A failure reason reaches model-visible denials, approval questions and API responses, and an error's text can carry an
 * absolute host path (an fs error, a verifier naming its file). Name the failure by its class only: the errno code, else
 * the error's name.
 */
const message = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "unknown error";
};
const failed = (failure: RecheckFailure, reason: string): Failed => ({ ok: false, failures: [failure], reason });

/** The digest of a policy file as the approvals engine binds it; absent is a named sentinel, unreadable throws. */
function fileDigest(workspace: string, rel: string, missing: string): string {
  try {
    return sha256Hex(readFileSync(join(workspace, rel)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return sha256Hex(missing);
    throw error;
  }
}

/** Everything about the call itself, from the signed tools config, the policy files as they are now and the pinned compiled policy. */
function actionFacts(call: Call, compiled?: CompiledPolicyFacts): { readonly ok: true; readonly facts: Facts } | Failed {
  try {
    const snapshot = loadVerifiedToolsConfigSnapshot(call.workspace);
    // Binding fields come from the SIGNED entry only; an unverifiable config has none.
    const signed = snapshot.config ? findToolDefinition(snapshot.config, call.name) : null;
    if (signed && signed.actionClass !== call.actionClass) return failed("tool_changed", "the signed tools config gives this tool another action class");
    const args = normalizeArguments(signed, call.actionClass, call.arguments);
    if (!args.ok) return failed(args.failure, args.reason);
    const policy = {
      compiledPolicyDigest: compiled?.digest ?? null,
      policyRevision: compiled?.revision ?? null,
      toolsConfigDigest: snapshot.digestSha256 ?? fileDigest(call.workspace, ".amc/tools.yaml", "missing-tools"),
      actionPolicyDigest: fileDigest(call.workspace, ".amc/action-policy.yaml", "missing-action-policy"),
      approvalPolicyDigest: fileDigest(call.workspace, ".amc/approval-policy.yaml", "missing-approval-policy"),
      budgetsDigest: fileDigest(call.workspace, ".amc/budgets.yaml", "missing-budgets")
    };
    const deploymentDigest = sha256Hex(canonicalize({ amcVersion, toolsConfigDigest: policy.toolsConfigDigest,
      actionPolicyDigest: policy.actionPolicyDigest, approvalPolicyDigest: policy.approvalPolicyDigest,
      budgetsDigest: policy.budgetsDigest, compiledPolicyDigest: policy.compiledPolicyDigest, agentConfigDigest: null }));
    return { ok: true, facts: {
      // From the verified plan the session pinned (P1-78); without one the record claims no tenant and no deployment.
      scope: { workspaceId: workspaceIdFromDirectory(call.workspace), tenantId: compiled?.deployment?.tenantId ?? null,
        deploymentId: compiled?.deployment?.deploymentId ?? DEPLOYMENT_NOT_BOUND, deploymentDigest },
      policy,
      action: { toolName: call.name, adapterId: signed?.context?.kind === "mcp" ? `mcp:${signed.context.server.id}` : "native",
        actionClass: call.actionClass, mode: call.effectiveMode, argumentsDigest: args.argumentsDigest, normalizer: args.normalizer },
      bindings: args.bindings,
      agentSuppliedMetadata: args.agentSuppliedMetadata,
      effects: signed?.effects ?? null
    } };
  } catch (error) {
    return failed("authority_store_unavailable", `policy files could not be read: ${message(error)}`);
  }
}

/** Amount and recipient first: they are what an approver is deciding. */
function questionFor(intent: AuthorizationIntent): string {
  const { amount, recipient, destination, resourceId, resourceVersion } = intent.bindings;
  const facts = [amount && `${amount.value} ${amount.currency}`, recipient && `to ${recipient}`,
    destination && `destination ${destination}`, resourceId && `resource ${resourceId}${resourceVersion ? `@${resourceVersion}` : ""}`]
    .filter((fact): fact is string => typeof fact === "string" && fact.length > 0);
  return `${facts.length > 0 ? `${facts.join(", ")}: ` : ""}the agent wants to call "${intent.toolName}" ` +
    `(${intent.actionClass}, arguments ${intent.argumentsDigest.slice(0, 12)})`;
}

/** The intent an approval for this call must bind, and the question to ask about it. */
export function authorizationIntentFor(call: Call, ctx: Pick<AuthorizationContext, "compiledPolicy"> = {}): AuthorizationIntentResult {
  const facts = actionFacts(call, ctx.compiledPolicy);
  if (!facts.ok) return facts;
  const payload = intentPayloadFor(facts.facts);
  return { ok: true, payload, question: questionFor(payload) };
}

function approvalBinding(execution: ToolExecution, approvalRequestId: string): AuthorizationRecordV1["authority"]["approvals"][number] | Failed {
  if (!APPROVAL_REQUEST_ID.test(approvalRequestId)) return failed("approval_not_granted", "malformed approval request id");
  try {
    const request = loadApprovalRequestRecord({ workspace: execution.workspace, agentId: execution.agentId, approvalRequestId });
    const approverIds = [...new Set(listApprovalDecisions({ workspace: execution.workspace, agentId: request.agentId, approvalRequestId })
      .filter(decision => decision.decision !== "DENY").map(decision => decision.userId))].sort();
    if (approverIds.length === 0) return failed("approval_not_granted", `${approvalRequestId} has no approving decision`);
    if (request.expiresTs <= Date.now()) return failed("approval_expired", `${approvalRequestId} expired`);
    return { approvalRequestId, requestBindingDigest: approvalRequestBindingDigest(request), intentHash: request.boundHashes.intentHash,
      actionClass: request.actionClass, approverIds, expiresAt: new Date(request.expiresTs).toISOString() };
  } catch (error) {
    return failed("authority_store_unavailable", `approval ${approvalRequestId} could not be read: ${message(error)}`);
  }
}

const LEASE_ERRORS: Record<string, RecheckFailure> = {
  "lease revoked": "lease_revoked", "lease expired": "capability_expired", "signature verification failed": "authority_store_unavailable"
};

/**
 * The lease, verified with its signature, expiry, agent, workspace, execute scope and classes, and the signed revocation
 * list. A lease naming another workspace is refused even when this workspace's key signed it (P1-78). Without an action
 * class it checks everything but the class (the effective-policy receipt, P1-67).
 */
export function checkLease(execution: Pick<ToolExecution, "workspace" | "agentId"> & { readonly actionClass?: ActionClass },
  token: string): { readonly payload: LeasePayload } | Failed {
  const workspace = execution.workspace;
  try {
    const verified = verifyLeaseToken({ workspace, token, expectedAgentId: execution.agentId, requiredScope: "toolhub:execute",
      expectedWorkspaceId: workspaceIdFromDirectory(workspace), actionClass: execution.actionClass, revokedLeaseIds: revokedLeaseIdSet(workspace) });
    if (verified.ok && verified.payload) return { payload: verified.payload };
    return failed(LEASE_ERRORS[verified.error ?? ""] ?? "scope_widened", verified.error ?? "lease refused");
  } catch (error) {
    return failed("authority_store_unavailable", `lease revocations could not be read: ${message(error)}`);
  }
}

/**
 * The accountable principal of a lease-bound call (P1-78), from authenticated server state only: the lease names a user
 * id, and the principal is that user's record in the signed users.yaml, read and verified here. A lease naming nobody
 * contributes no principal (identity-binding then refuses the call); one naming a user that is not active there, or a
 * users.yaml that does not verify, refuses. The lease token's own identity is never a principal. A user whose only role
 * is AGENT is a registered service; any other user is a human. `state` is the user record's digest, which the recheck
 * compares, so a principal deactivated or demoted between bind and execution is refused.
 */
export function leasePrincipal(workspace: string, payload: Pick<LeasePayload, "principal">):
  { readonly principal: AuthorizationRecordV1["principal"]; readonly state: string } | null | Failed {
  const named = payload.principal;
  if (!named) return null;
  let user: ReturnType<typeof activeUserRecord>;
  try {
    user = activeUserRecord(workspace, named.userId);
  } catch (error) {
    return failed("authority_store_unavailable", `the lease names user ${named.userId}, and users.yaml could not be verified: ${message(error)}`);
  }
  if (!user) return failed("principal_unresolved", `the lease names user ${named.userId}, who is not an active user of the signed users.yaml`);
  return { principal: { principalId: user.userId, kind: user.roles.every((role) => role === "AGENT") ? "service" : "human", authenticatedVia: "lease" },
    state: sha256Hex(canonicalize({ userId: user.userId, status: user.status, roles: [...user.roles].sort() })) };
}

/** The bound principal's users.yaml state per record, for the recheck (in-process: the pipeline rechecks the object it bound). */
const boundPrincipalState = new WeakMap<AuthorizationRecordV1, string>();

/** Build the record for one call. Issued and expiry times come from AMC's clock, never from a caller. */
export function bindAuthorization(execution: ToolExecution, ctx: AuthorizationContext = {}): BindResult {
  const facts = actionFacts(execution, ctx.compiledPolicy);
  if (!facts.ok) return facts;
  const approvals: AuthorizationRecordV1["authority"]["approvals"][number][] = [];
  for (const id of ctx.authority?.approvalRequestIds ?? []) {
    const bound = approvalBinding(execution, id);
    if ("ok" in bound) return bound;
    approvals.push(bound);
  }
  const lease = ctx.leaseToken === undefined ? null : checkLease(execution, ctx.leaseToken);
  if (lease !== null && "ok" in lease) return lease;
  const named = lease === null ? null : leasePrincipal(execution.workspace, lease.payload);
  if (named !== null && "ok" in named) return named;
  const issuedTs = Date.now();
  // Earliest of every authority's own expiry. ponytail: no parent record is in reach in-process; P2-25 clamps to it.
  const expiresTs = Math.min(issuedTs + DEFAULT_RECORD_TTL_MS, lease?.payload.expiresTs ?? Infinity,
    ...approvals.map(approval => Date.parse(approval.expiresAt)));
  if (expiresTs <= issuedTs) return failed("capability_expired", "authority expired before the call");
  const approverIds = [...new Set(approvals.flatMap(approval => approval.approverIds))].sort();
  const delegation = ctx.delegation ?? { depth: 0, parentExecutionId: null };
  try {
    const record = assertContract("authorization-record", {
      schema: AUTHZ_SCHEMA,
      authorizationId: `authz_${randomUUID()}`,
      executionId: `exec_${randomUUID()}`,
      issuedAt: new Date(issuedTs).toISOString(),
      expiresAt: new Date(expiresTs).toISOString(),
      scope: facts.facts.scope,
      subject: { governedAs: execution.agentId, runAs: ctx.runAs ?? execution.agentId, agentConfigDigest: null },
      // An approval names who authorized the effect; a lease, the principal its issuer named (never the lease itself,
      // P1-78); otherwise the CLI user, self-reported, which identity-binding refuses.
      principal: approverIds.length > 0 ? { principalId: approverIds.join(","), kind: "human", authenticatedVia: "approval-engine" }
        : named?.principal ?? { principalId: cliInitiator(), kind: "human", authenticatedVia: "cli-os-user" },
      delegation: { depth: delegation.depth, parentExecutionId: delegation.parentExecutionId,
        allowedActionClasses: intersectDelegationScopes(delegation.allowedActionClasses, lease?.payload.executeActionClasses) ?? [...ACTION_CLASSES],
        leaseId: lease?.payload.leaseId ?? null },
      session: { sessionId: ctx.sessionId ?? null, runId: null, callId: execution.callId, rootCallId: execution.rootCallId,
        parentToken: execution.parentToken },
      control: ctx.compiledPolicy?.controlFor(execution.actionClass) ?? { controlId: null, controlVersion: null },
      policy: facts.facts.policy,
      action: facts.facts.action,
      resource: { purpose: null, dataClasses: [] },
      bindings: facts.facts.bindings,
      authority: { approvals, exceptions: [] },
      // Minted here, before dispatch, never taken from a caller (P1-04).
      idempotencyKey: mintIdempotencyKey(),
      evidenceRefs: [...(ctx.evidenceRefs ?? [])],
      ...(facts.facts.agentSuppliedMetadata === null ? {} : { agentSuppliedMetadata: facts.facts.agentSuppliedMetadata })
    });
    if (named !== null && record.principal.authenticatedVia === "lease") boundPrincipalState.set(record, named.state);
    return { ok: true, record, digest: authorizationRecordDigest(record), effects: facts.facts.effects };
  } catch (error) {
    return failed("authority_store_unavailable", `the authorization record could not be built: ${message(error)}`);
  }
}

const APPROVAL_ERRORS: Record<string, RecheckFailure> = {
  "approval agent mismatch": "approval_intent_mismatch",
  "approval intent hash mismatch": "approval_intent_mismatch",
  "approval tool mismatch": "tool_changed",
  "approval action class mismatch": "approval_action_class_mismatch",
  "approval chain integrity failed": "approval_not_granted",
  "approval policy hash mismatch": "policy_revision_changed",
  "approval tools hash mismatch": "policy_revision_changed",
  "approval budgets hash mismatch": "policy_revision_changed"
};

/** One approval against the exact intent about to run. Named differences come from the intent the approver saw. */
function recheckApproval(record: AuthorizationRecordV1, execution: ToolExecution,
  approval: AuthorizationRecordV1["authority"]["approvals"][number]): RecheckFailure[] {
  const expectedIntentHash = intentHashFor(record);
  let verified: ReturnType<typeof verifyApprovalForExecution>;
  try {
    verified = verifyApprovalForExecution({ workspace: execution.workspace, approvalId: approval.approvalRequestId,
      expectedAgentId: execution.agentId, expectedToolName: record.action.toolName,
      expectedActionClass: record.action.actionClass, expectedIntentHash });
  } catch {
    return ["authority_store_unavailable"];
  }
  const failures: RecheckFailure[] = [];
  const request = verified.approval;
  if (request) {
    if (request.actionClass !== record.action.actionClass) failures.push("approval_action_class_mismatch");
    if (approvalRequestBindingDigest(request) !== approval.requestBindingDigest) failures.push("approval_intent_mismatch");
    const approved = request.authorizationIntent;
    if (request.boundHashes.intentHash !== expectedIntentHash) {
      failures.push(...(approved && sha256Hex(canonicalize(approved)) === request.boundHashes.intentHash
        ? intentDifferences(approved, intentPayloadFor(record)) : ["approval_intent_mismatch" as const]));
    }
    if (request.boundHashes.toolsHash !== record.policy.toolsConfigDigest || request.boundHashes.policyHash !== record.policy.actionPolicyDigest
      || request.boundHashes.budgetsHash !== record.policy.budgetsDigest) failures.push("policy_revision_changed");
  }
  // A hash mismatch already named above needs no generic code beside it.
  if (!verified.ok && !(verified.error === "approval intent hash mismatch" && failures.length > 0)) {
    failures.push(verified.status === "CONSUMED" ? "approval_consumed" : verified.status === "EXPIRED" ? "approval_expired"
      : verified.status !== null ? "approval_not_granted" : APPROVAL_ERRORS[verified.error ?? ""] ?? "authority_store_unavailable");
  }
  return failures;
}

/**
 * Recheck the record as the last step before the body, then consume its approvals with its `executionId`.
 * Synchronous: nothing can run between the last check and the consume. Freezes and revocations are re-read every time.
 */
export function recheckAuthorization(record: AuthorizationRecordV1, execution: ToolExecution, ctx: AuthorizationContext = {}): RecheckResult {
  const failures = new Set<RecheckFailure>();
  const add = (...found: readonly RecheckFailure[]): void => { for (const failure of found) failures.add(failure); };
  if (record.session.callId !== execution.callId || record.subject.governedAs !== execution.agentId) add("approval_intent_mismatch");
  const current = actionFacts(execution, ctx.compiledPolicy);
  if (!current.ok) add(...current.failures);
  else {
    add(...intentDifferences(intentPayloadFor(record), intentPayloadFor(current.facts)));
    if (canonicalize(record.policy) !== canonicalize(current.facts.policy)) add("policy_revision_changed");
  }
  for (const approval of record.authority.approvals) add(...recheckApproval(record, execution, approval));
  if (ctx.leaseToken !== undefined || record.delegation.leaseId !== null) {
    const lease = ctx.leaseToken === undefined ? failed("scope_widened", "the record names a lease the call does not carry")
      : checkLease(execution, ctx.leaseToken);
    if ("ok" in lease) add(...lease.failures);
    else if (lease.payload.leaseId !== record.delegation.leaseId) add("scope_widened");
    else if (record.principal.authenticatedVia === "lease") {
      // The principal again, from the signed users.yaml in this read: deactivated, demoted or changed since bind refuses.
      const now = leasePrincipal(execution.workspace, lease.payload);
      if (now !== null && "ok" in now) add(...now.failures);
      else if (now === null || now.state !== boundPrincipalState.get(record) || now.principal.principalId !== record.principal.principalId) add("principal_unresolved");
    }
  }
  try {
    const freeze = activeFreezeStatus(execution.workspace, execution.agentId);
    if (freeze.active && freeze.actionClasses.includes(record.action.actionClass)) add("action_class_frozen");
  } catch {
    add("authority_store_unavailable");
  }
  if (Date.now() >= Date.parse(record.expiresAt)) add("capability_expired");
  // A child can only narrow: its class must be in scope, and a child must name the delegation that made it.
  if (!record.delegation.allowedActionClasses.includes(record.action.actionClass)
    || (record.delegation.depth > 0) !== (record.delegation.parentExecutionId !== null)) add("scope_widened");
  if (failures.size === 0) {
    for (const approval of record.authority.approvals) {
      try {
        const spent = consumeApprovedExecution({ workspace: execution.workspace, approvalId: approval.approvalRequestId,
          expectedAgentId: execution.agentId, executionId: record.executionId });
        if (!spent.consumed) add("approval_consumed");
      } catch {
        add("authority_store_unavailable");
      }
    }
  }
  return { ok: failures.size === 0, failures: [...failures], checkedAt: new Date().toISOString() };
}
