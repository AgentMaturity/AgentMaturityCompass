import {
  loadAssurancePolicy,
  loadAssuranceSchedulerState,
  saveAssuranceSchedulerState,
  verifyAssurancePolicySignature,
  verifyAssuranceSchedulerSignature
} from "./assurancePolicyStore.js";
import { issueAssuranceCertificate } from "./assuranceCertificates.js";
import { runAssurance } from "./assuranceRunner.js";
import type { AssuranceSchedulerState } from "./assuranceSchema.js";
import { includes } from "../utils/typeGuards.js";

function nextRunTs(nowTs: number, defaultRunHours: number): number {
  const hours = Math.max(1, defaultRunHours);
  return nowTs + hours * 60 * 60 * 1000;
}

function toSchedulerCertStatus(params: {
  reportStatus: "VALID" | "INVALID";
  overallScore0to100: number;
  minRiskAssuranceScore: number;
}): AssuranceSchedulerState["lastCertStatus"] {
  if (params.reportStatus !== "VALID") {
    return "FAIL";
  }
  return params.overallScore0to100 >= params.minRiskAssuranceScore ? "PASS" : "FAIL";
}

export function assuranceSchedulerStatus(workspace: string) {
  return {
    state: loadAssuranceSchedulerState(workspace),
    signature: verifyAssuranceSchedulerSignature(workspace)
  };
}

export function assuranceSchedulerSetEnabled(params: {
  workspace: string;
  enabled: boolean;
}) {
  const current = loadAssuranceSchedulerState(params.workspace);
  const next = {
    ...current,
    enabled: params.enabled
  };
  const saved = saveAssuranceSchedulerState(params.workspace, next);
  return {
    state: next,
    ...saved
  };
}

export async function assuranceSchedulerRunNow(params: {
  workspace: string;
  scopeType?: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  selectedPack?: "all" | string;
}) {
  const policySig = verifyAssurancePolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`assurance policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const currentState = loadAssuranceSchedulerState(params.workspace);
  const policy = loadAssurancePolicy(params.workspace);
  const selected = params.selectedPack ?? "all";

  const report = await runAssurance({
    workspace: params.workspace,
    agentId: params.scopeType === "AGENT" ? params.scopeId : undefined,
    packId: selected === "all" ? undefined : selected,
    runAll: selected === "all",
    mode: "sandbox",
    window: `${Math.max(1, policy.assurancePolicy.cadence.defaultRunHours)}h`
  });

  let cert:
    | Awaited<ReturnType<typeof issueAssuranceCertificate>>
    | null = null;
  try {
    cert = await issueAssuranceCertificate({
      workspace: params.workspace,
      runId: report.assuranceRunId
    });
  } catch {
    cert = null;
  }

  const nowTs = Date.now();
  const next = {
    enabled: currentState.enabled,
    lastRunTs: nowTs,
    nextRunTs: nextRunTs(nowTs, policy.assurancePolicy.cadence.defaultRunHours),
    lastOutcome: {
      status: "OK" as const,
      reason: ""
    },
    lastCertStatus: toSchedulerCertStatus({
      reportStatus: report.status,
      overallScore0to100: report.overallScore0to100,
      minRiskAssuranceScore: policy.assurancePolicy.thresholds.minRiskAssuranceScore
    })
  };
  saveAssuranceSchedulerState(params.workspace, next);

  return {
    run: report,
    cert,
    scheduler: next
  };
}

export async function assuranceSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
  eventType?: string;
}): Promise<
  | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "not_due" }
  | { ran: true; runId: string; certIssued: boolean }
> {
  const state = loadAssuranceSchedulerState(params.workspace);
  if (!state.enabled) {
    return { ran: false, reason: "disabled" };
  }
  if (!params.workspaceReady) {
    const next = {
      ...state,
      lastOutcome: {
        status: "SKIPPED" as const,
        reason: "workspace not ready"
      }
    };
    saveAssuranceSchedulerState(params.workspace, next);
    return { ran: false, reason: "workspace_not_ready" };
  }

  const policySig = verifyAssurancePolicySignature(params.workspace);
  if (!policySig.valid) {
    const next = {
      ...state,
      lastOutcome: {
        status: "ERROR" as const,
        reason: `assurance policy invalid: ${policySig.reason ?? "unknown"}`
      }
    };
    saveAssuranceSchedulerState(params.workspace, next);
    return { ran: false, reason: "policy_untrusted" };
  }

  const policy = loadAssurancePolicy(params.workspace);
  const nowTs = Date.now();
  const eventTriggered = Boolean(params.eventType && includes(policy.assurancePolicy.cadence.runAfterEvents, params.eventType));
  const due = !state.nextRunTs || state.nextRunTs <= nowTs;
  if (!eventTriggered && !due) {
    return { ran: false, reason: "not_due" };
  }

  const result = await assuranceSchedulerRunNow({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    selectedPack: "all"
  });
  return {
    ran: true,
    runId: result.run.assuranceRunId,
    certIssued: Boolean(result.cert)
  };
}
