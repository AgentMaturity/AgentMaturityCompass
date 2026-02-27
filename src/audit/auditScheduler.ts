import { readFileSync } from "node:fs";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { sha256Hex } from "../utils/hash.js";
import {
  loadAuditMapActive,
  verifyAuditMapActiveSignature
} from "./auditMapStore.js";
import {
  defaultAuditSchedulerState,
  type AuditSchedulerState
} from "./auditPolicySchema.js";
import {
  loadAuditPolicy,
  loadAuditSchedulerState,
  saveAuditSchedulerState,
  verifyAuditPolicySignature
} from "./auditPolicyStore.js";
import { collectAuditBinderData } from "./binderCollector.js";
import { saveBinderCache } from "./binderStore.js";
import { includes } from "../utils/typeGuards.js";

function nextRefreshTs(nowTs: number, cadenceHours: number): number {
  return nowTs + Math.max(1, cadenceHours) * 60 * 60 * 1000;
}

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
}) {
  const policySig = verifyAuditPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`audit policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const mapSig = verifyAuditMapActiveSignature(params.workspace);
  if (!mapSig.valid) {
    throw new Error(`audit map signature invalid: ${mapSig.reason ?? "unknown"}`);
  }
  const current = safeState(params.workspace);
  const policy = loadAuditPolicy(params.workspace);
  const map = loadAuditMapActive(params.workspace);
  const scopeType = params.scopeType ?? "WORKSPACE";
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default");
  const collected = await collectAuditBinderData({
    workspace: params.workspace,
    scope: {
      type: scopeType,
      id: scopeId
    },
    policy,
    map,
    request: params.request ?? null
  });
  const cache = saveBinderCache({
    workspace: params.workspace,
    scopeType,
    scopeId,
    binder: collected.binder
  });
  const nowTs = Date.now();
  const next: AuditSchedulerState = {
    enabled: current.enabled,
    lastRefreshTs: nowTs,
    nextRefreshTs: nextRefreshTs(nowTs, policy.auditPolicy.recurrence.refreshCadenceHours),
    lastOutcome: {
      status: "OK",
      reason: ""
    }
  };
  saveAuditSchedulerState(params.workspace, next);
  const hash = sha256Hex(readFileSync(cache.path));
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_BINDER_CREATED",
    agentId: scopeType === "AGENT" ? scopeId : "workspace",
    artifact: {
      kind: "policy",
      sha256: hash,
      id: collected.binder.binderId
    }
  });
  return {
    binder: collected.binder,
    cache,
    scheduler: next,
    transparencyHash: entry.hash
  };
}

export async function auditSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
  eventType?: string;
}):
  Promise<
    | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "map_untrusted" | "not_due" }
    | { ran: true; binderId: string }
  > {
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
    saveAuditSchedulerState(params.workspace, next);
    return { ran: false, reason: "workspace_not_ready" };
  }

  const policySig = verifyAuditPolicySignature(params.workspace);
  if (!policySig.valid) {
    const next: AuditSchedulerState = {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: `audit policy invalid: ${policySig.reason ?? "unknown"}`
      }
    };
    saveAuditSchedulerState(params.workspace, next);
    return { ran: false, reason: "policy_untrusted" };
  }
  const mapSig = verifyAuditMapActiveSignature(params.workspace);
  if (!mapSig.valid) {
    const next: AuditSchedulerState = {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: `audit map invalid: ${mapSig.reason ?? "unknown"}`
      }
    };
    saveAuditSchedulerState(params.workspace, next);
    return { ran: false, reason: "map_untrusted" };
  }

  const policy = loadAuditPolicy(params.workspace);
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
  });
  return {
    ran: true,
    binderId: out.binder.binderId
  };
}
