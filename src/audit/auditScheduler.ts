import { captureOrgPairs, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { auditSchedulerPath, auditPolicyPath } from "./auditPolicyStore.js";
import { auditMapActivePath } from "./auditMapStore.js";
import { saveAuditSchedulerStateAsync } from "./binderStatePublication.js";
import { captureAuditBinderPolicies } from "./binderCollectionPlan.js";
import { publishAuditSchedulerRun } from "./binderSchedulerPublication.js";
import type { AuditPublicationOptions } from "./binderPublication.js";
export { auditSchedulerSetEnabledAsync } from "./binderSchedulerPublication.js";
import {
  verifyAuditMapActiveSignature
} from "./auditMapStore.js";
import {
  defaultAuditSchedulerState,
  type AuditSchedulerState
} from "./auditPolicySchema.js";
import {
  loadAuditSchedulerState,
  saveAuditSchedulerState,
  verifyAuditPolicySignature
} from "./auditPolicyStore.js";
import { includes } from "../utils/typeGuards.js";

function safeState(workspace: string): AuditSchedulerState {
  try {
    return loadAuditSchedulerState(workspace);
  } catch {
    return defaultAuditSchedulerState();
  }
}

export function auditSchedulerStatus(workspace: string) {
  return {
    state: safeState(workspace)
  };
}

export function auditSchedulerSetEnabled(params: {
  workspace: string;
  enabled: boolean;
}) {
  const current = safeState(params.workspace);
  const next: AuditSchedulerState = {
    ...current,
    enabled: params.enabled
  };
  const saved = saveAuditSchedulerState(params.workspace, next);
  return {
    state: next,
    ...saved
  };
}

export async function auditSchedulerRunNow(params: {
  workspace: string;
  scopeType?: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  request?: import("./evidenceRequestSchema.js").EvidenceRequest | null;
}, options: AuditPublicationOptions = {}) {
  return publishAuditSchedulerRun(params, options);
}

export async function auditSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
  eventType?: string;
}, options: AuditPublicationOptions = {}):
  Promise<
    | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "map_untrusted" | "not_due" }
    | { ran: true; binderId: string }
  > {
  options = { ...options };
  const decision = captureOrgPairs([auditSchedulerPath(params.workspace), auditPolicyPath(params.workspace), auditMapActivePath(params.workspace)]);
  const stableDecision = { members: decision.members.filter(row => row.path !== auditSchedulerPath(params.workspace) && row.path !== `${auditSchedulerPath(params.workspace)}.sig`) };
  const inputs = () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(stableDecision); };
  const preparation = () => { options.assertPreparationInputsCurrent?.(); assertOrgPairsCurrent(decision); };
  const state = safeState(params.workspace);
  if (!state.enabled) {
    return { ran: false, reason: "disabled" };
  }
  if (!params.workspaceReady) {
    const next: AuditSchedulerState = {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: "workspace not ready"
      }
    };
    await saveAuditSchedulerStateAsync(params.workspace, next, { beforePublish: options.beforePublish, assertInputsCurrent: inputs, assertPreparationInputsCurrent: preparation, assertOutputsSafe: options.assertOutputsSafe });
    return { ran: false, reason: "workspace_not_ready" };
  }

  const policySig = verifyAuditPolicySignature(params.workspace);
  if (!policySig.valid) {
    const next: AuditSchedulerState = {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: "audit policy invalid"
      }
    };
    await saveAuditSchedulerStateAsync(params.workspace, next, { beforePublish: options.beforePublish, assertInputsCurrent: inputs, assertPreparationInputsCurrent: preparation, assertOutputsSafe: options.assertOutputsSafe });
    return { ran: false, reason: "policy_untrusted" };
  }
  const mapSig = verifyAuditMapActiveSignature(params.workspace);
  if (!mapSig.valid) {
    const next: AuditSchedulerState = {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: "audit map invalid"
      }
    };
    await saveAuditSchedulerStateAsync(params.workspace, next, { beforePublish: options.beforePublish, assertInputsCurrent: inputs, assertPreparationInputsCurrent: preparation, assertOutputsSafe: options.assertOutputsSafe });
    return { ran: false, reason: "map_untrusted" };
  }

  const policy = captureAuditBinderPolicies(params.workspace, false).policy;
  const nowTs = Date.now();
  const eventTriggered = Boolean(
    params.eventType &&
      includes(policy.auditPolicy.recurrence.refreshOnEvents, params.eventType)
  );
  const due = !state.nextRefreshTs || state.nextRefreshTs <= nowTs;
  if (!eventTriggered && !due) {
    return { ran: false, reason: "not_due" };
  }

  const out = await auditSchedulerRunNow({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  }, { beforePublish: options.beforePublish, assertInputsCurrent: inputs, assertPreparationInputsCurrent: preparation, assertOutputsSafe: options.assertOutputsSafe });
  return {
    ran: true,
    binderId: out.binder.binderId
  };
}
