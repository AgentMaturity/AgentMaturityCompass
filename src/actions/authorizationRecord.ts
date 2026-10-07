/**
 * The authorization record (P1-02): who authorized which effect, bound at the tool pipeline and rechecked as the last
 * step before the body. The record's shape is the P1-01 contract (`src/contracts/v1/authorizationRecord.ts`); this
 * module adds its digest and the intent an approval binds. See docs/adr/009-authorization-record.md.
 */
import type { AuthorizationRecordV1 } from "../contracts/index.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type { AuthorizationRecordV1 };
export type BindingFacts = AuthorizationRecordV1["bindings"];

export const AUTHZ_SCHEMA = "amc.authorization-record/v1" as const;
/** Tags an approval's intent payload; the approvals engine keeps a payload so tagged with its signed request. */
export const AUTHZ_INTENT_SCHEMA = "amc.authorization-intent/v1" as const;
/** Versioned: records and approvals made under different normalizers never match. */
export const ARGS_NORMALIZER = "amc.args/v1" as const;

export type RecheckFailure =
  | "approval_missing" | "approval_not_granted" | "approval_consumed" | "approval_expired"
  | "approval_intent_mismatch" | "approval_action_class_mismatch"
  | "binding_changed:amount" | "binding_changed:recipient" | "binding_changed:destination"
  | "binding_changed:resource" | "tool_changed" | "deployment_changed" | "policy_revision_changed"
  | "capability_expired" | "lease_revoked" | "scope_widened" | "action_class_frozen"
  | "authority_store_unavailable" | "binding_fields_missing";

export interface RecheckResult {
  readonly ok: boolean;
  readonly failures: readonly RecheckFailure[];
  readonly checkedAt: string;
}

/** sha256("AMC_AUTHZ_V1\0" + canonicalize(record)). */
export function authorizationRecordDigest(record: AuthorizationRecordV1): string {
  return sha256Hex(`AMC_AUTHZ_V1\0${canonicalize(record)}`);
}

export type AuthorizationIntent = ReturnType<typeof intentPayloadFor>;

/** What an approval binds: the protected facts of the call, never its raw arguments. */
export function intentPayloadFor(record: Pick<AuthorizationRecordV1, "action" | "bindings" | "scope">) {
  return {
    schema: AUTHZ_INTENT_SCHEMA,
    toolName: record.action.toolName,
    adapterId: record.action.adapterId,
    actionClass: record.action.actionClass,
    argumentsDigest: record.action.argumentsDigest,
    bindings: record.bindings,
    deploymentDigest: record.scope.deploymentDigest,
    workspaceId: record.scope.workspaceId
  };
}

/** The intent hash an approval for this record must carry. */
export function intentHashFor(record: Pick<AuthorizationRecordV1, "action" | "bindings" | "scope">): string {
  return sha256Hex(canonicalize(intentPayloadFor(record)));
}

/**
 * Which protected facts differ between what was authorized and what is about to run, named. A difference no named
 * fact explains (another argument, the workspace) is an intent mismatch.
 */
export function intentDifferences(authorized: Record<string, unknown>, current: AuthorizationIntent): RecheckFailure[] {
  const failures: RecheckFailure[] = [];
  const same = (a: unknown, b: unknown): boolean => canonicalize(a ?? null) === canonicalize(b ?? null);
  const was = (authorized.bindings ?? {}) as Partial<BindingFacts>;
  if (!same(authorized.toolName, current.toolName) || !same(authorized.adapterId, current.adapterId)
    || !same(authorized.actionClass, current.actionClass)) failures.push("tool_changed");
  if (!same(was.amount, current.bindings.amount)) failures.push("binding_changed:amount");
  if (!same(was.recipient, current.bindings.recipient)) failures.push("binding_changed:recipient");
  if (!same(was.destination, current.bindings.destination)) failures.push("binding_changed:destination");
  if (!same(was.resourceId, current.bindings.resourceId) || !same(was.resourceVersion, current.bindings.resourceVersion)) {
    failures.push("binding_changed:resource");
  }
  if (!same(authorized.deploymentDigest, current.deploymentDigest)) failures.push("deployment_changed");
  if (failures.length === 0 && canonicalize(authorized) !== canonicalize(current)) failures.push("approval_intent_mismatch");
  return failures;
}
