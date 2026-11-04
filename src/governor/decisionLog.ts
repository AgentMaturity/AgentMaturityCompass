/**
 * AuthZEN-shaped authorization decision log (P2-25). One entry per authorization decision, allow or deny, written to
 * the ledger as an `audit` row with auditType AUTHZ_DECISION (hash-chained and signed like every ledger row).
 *
 * Field names follow the OpenID AuthZEN Authorization API 1.0 evaluation request (subject, action, resource, context)
 * and response (decision, context.reason). docs/AGENT_IDENTITY.md pins the version and maps each field. Subject fields
 * come only from AMC's own record (the authorization record or the toolhub intent), never from agent-supplied metadata,
 * and arguments are kept as a digest, never raw.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthorizationRecordV1 } from "../actions/authorizationRecord.js";
import { authorizationRecordDigest } from "../actions/authorizationRecord.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { amcVersion } from "../version.js";

export const AUTHZ_DECISION_AUDIT_TYPE = "AUTHZ_DECISION" as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const authzDecisionLogEntrySchema = z.strictObject({
  v: z.literal(1),
  decisionId: z.string().regex(/^authzdec_[a-f0-9]{32}$/),
  ts: z.number().int(),
  subject: z.strictObject({
    type: z.literal("agent"),
    id: z.string().min(1),
    properties: z.strictObject({
      spiffeId: z.string().nullable(),
      principal: z.string().nullable(),
      delegationChainDigest: sha256.nullable(),
      claimKind: z.enum(["observed", "self_reported"])
    })
  }),
  action: z.strictObject({ name: z.string().min(1), properties: z.strictObject({ tool: z.string().min(1), argumentsDigest: sha256 }) }),
  resource: z.strictObject({ type: z.string().min(1), id: z.string().min(1), properties: z.record(z.string(), z.string()) }),
  context: z.strictObject({
    /** Null when the decision was made before an authorization record bound (a toolhub intent, a record that failed to bind). */
    authorizationRecordDigest: sha256.nullable(),
    /** Null only when no policy was read before the decision (a record that failed to bind). */
    policyDigest: sha256.nullable(),
    controlIds: z.array(z.string().min(1)),
    sessionId: z.string().nullable(),
    runId: z.string().nullable()
  }),
  decision: z.boolean(),
  reasons: z.array(z.strictObject({ id: z.string().min(1), text: z.string() })),
  pdp: z.strictObject({ name: z.literal("amc"), version: z.string().min(1) })
}).refine((entry) => entry.decision || entry.reasons.length > 0, "a deny carries at least one reason");
export type AuthzDecisionLogEntry = z.infer<typeof authzDecisionLogEntrySchema>;

const newDecisionId = (): string => `authzdec_${randomUUID().replace(/-/g, "")}`;
const reasonId = (text: string): string => /^[a-z_:]+/.exec(text)?.[0] ?? "denied";

/** Denial text as reasons: one per comma-separated failure code, the first word of each as its id. */
export function decisionReasons(denial: string | null): AuthzDecisionLogEntry["reasons"] {
  if (denial === null) return [];
  const parts = denial.split(/,\s*/).filter((part) => part.length > 0);
  return (parts.length > 0 ? parts : ["denied"]).map((text) => ({ id: reasonId(text), text }));
}

/**
 * The entry for a tool-pipeline decision (P1-02's authorization stage). `record` is the bound authorization record;
 * its subject and delegation are AMC's own, and `agentSuppliedMetadata` is never read.
 */
export function pipelineDecision(params: {
  readonly record: AuthorizationRecordV1;
  readonly allowed: boolean;
  readonly denial: string | null;
  readonly ts?: number;
}): AuthzDecisionLogEntry {
  const { record } = params;
  const spiffeId = record.delegation.spiffeId ?? null;
  return authzDecisionLogEntrySchema.parse({
    v: 1, decisionId: newDecisionId(), ts: params.ts ?? Date.now(),
    subject: { type: "agent", id: record.subject.governedAs, properties: {
      spiffeId,
      principal: record.principal.authenticatedVia === "cli-os-user" ? null : `${record.principal.kind}:${record.principal.principalId}`,
      delegationChainDigest: record.delegation.chainDigest ?? null,
      claimKind: spiffeId !== null ? "observed" : "self_reported" } },
    action: { name: record.action.actionClass, properties: { tool: record.action.toolName, argumentsDigest: record.action.argumentsDigest } },
    resource: { type: "tool", id: record.action.toolName, properties: {
      workspaceId: record.scope.workspaceId, deploymentId: record.scope.deploymentId, ...(record.resource.purpose === null ? {} : { purpose: record.resource.purpose }) } },
    context: { authorizationRecordDigest: authorizationRecordDigest(record),
      policyDigest: record.policy.compiledPolicyDigest ?? record.policy.actionPolicyDigest,
      controlIds: record.control.controlId === null ? [] : [record.control.controlId],
      sessionId: record.session.sessionId, runId: record.session.runId },
    decision: params.allowed,
    reasons: params.allowed ? [] : decisionReasons(params.denial),
    pdp: { name: "amc", version: amcVersion }
  });
}

/**
 * The entry for a decision no authorization record backs: a toolhub intent (decided before any record binds), or a
 * pipeline call refused because its record could not bind. The subject is the agent id AMC resolved for the call and
 * is labelled self_reported: nothing verified a workload identity for it.
 */
export function recordlessDecision(params: {
  readonly agentId: string; readonly toolName: string; readonly actionClass: string; readonly args: unknown;
  readonly allowed: boolean; readonly reasons: readonly string[]; readonly policyDigest: string | null;
  readonly resource: Record<string, string>; readonly sessionId?: string | null;
}): AuthzDecisionLogEntry {
  return authzDecisionLogEntrySchema.parse({
    v: 1, decisionId: newDecisionId(), ts: Date.now(),
    subject: { type: "agent", id: params.agentId, properties: { spiffeId: null, principal: null, delegationChainDigest: null, claimKind: "self_reported" } },
    action: { name: params.actionClass, properties: { tool: params.toolName, argumentsDigest: sha256Hex(canonicalize(params.args ?? null)) } },
    resource: { type: "tool", id: params.toolName, properties: params.resource },
    context: { authorizationRecordDigest: null, policyDigest: params.policyDigest, controlIds: [], sessionId: params.sessionId ?? null, runId: null },
    decision: params.allowed,
    reasons: params.allowed ? [] : (params.reasons.length > 0 ? params.reasons : ["denied"]).map((text) => ({ id: reasonId(text), text })),
    pdp: { name: "amc", version: amcVersion }
  });
}

/** The toolhub intent decision as its ledger row, under the action policy as it is on disk now (absent: a named sentinel). */
export function toolhubIntentDecisionEvidence(workspace: string, intent: {
  readonly intentId: string; readonly agentId: string; readonly toolName: string; readonly actionClass: string; readonly args: unknown;
  readonly allowed: boolean; readonly reasons: readonly string[];
}): ReturnType<typeof decisionEvidence> {
  const policy = readContainedOrNull(workspace, ".amc/action-policy.yaml", Number.MAX_SAFE_INTEGER);
  const policyDigest = sha256Hex(policy ?? "missing-action-policy");
  return decisionEvidence(recordlessDecision({ ...intent, policyDigest, resource: { intentId: intent.intentId } }));
}

/** The ledger row for one entry: payload and meta both carry the entry; nothing in it is a raw argument. */
export function decisionEvidence(entry: AuthzDecisionLogEntry): { readonly eventType: "audit"; readonly payload: string; readonly meta: Record<string, unknown> } {
  return { eventType: "audit", payload: JSON.stringify({ auditType: AUTHZ_DECISION_AUDIT_TYPE, entry }),
    meta: { auditType: AUTHZ_DECISION_AUDIT_TYPE, trustTier: "OBSERVED", decisionId: entry.decisionId, agentId: entry.subject.id, decision: entry.decision } };
}
