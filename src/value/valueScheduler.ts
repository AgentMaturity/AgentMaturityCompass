import {
  loadValuePolicy,
  loadValueSchedulerState,
  saveValueSchedulerState,
  verifyValuePolicySignature
} from "./valueStore.js";
import { valueSchedulerRunNowForApi } from "./valueApi.js";
import { includes } from "../utils/typeGuards.js";

function nextTs(nowTs: number, hours: number): number {
  return nowTs + Math.max(1, hours) * 60 * 60 * 1000;
}

export async function valueSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
  eventType?: string;
}): Promise<
  | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "not_due" }
  | { ran: true; snapshotTs: number; status: "OK" | "INSUFFICIENT_EVIDENCE" }
> {
  const state = loadValueSchedulerState(params.workspace);
  if (!state.enabled) {
    return { ran: false, reason: "disabled" };
  }
  if (!params.workspaceReady) {
    saveValueSchedulerState(params.workspace, {
      ...state,
      lastOutcome: {
        status: "SKIPPED",
        reason: "workspace not ready"
      }
    });
    return { ran: false, reason: "workspace_not_ready" };
  }
  const verify = verifyValuePolicySignature(params.workspace);
  if (!verify.valid) {
    saveValueSchedulerState(params.workspace, {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: verify.reason ?? "policy signature invalid"
      }
    });
    return { ran: false, reason: "policy_untrusted" };
  }

  const policy = loadValuePolicy(params.workspace);
  const nowTs = Date.now();
  const dueSnapshot = !state.nextSnapshotTs || state.nextSnapshotTs <= nowTs;
  const dueReport = !state.nextReportTs || state.nextReportTs <= nowTs;
  const eventTriggered = Boolean(
    params.eventType && includes(policy.valuePolicy.cadence.refreshOnEvents, params.eventType)
  );

  if (!eventTriggered && !dueSnapshot && !dueReport) {
    return { ran: false, reason: "not_due" };
  }

  const out = await valueSchedulerRunNowForApi({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  });
  saveValueSchedulerState(params.workspace, {
    ...out.scheduler,
    nextSnapshotTs: nextTs(nowTs, policy.valuePolicy.cadence.snapshotEveryHours),
    nextReportTs: nextTs(nowTs, policy.valuePolicy.cadence.reportEveryHours)
  });

  return {
    ran: true,
    snapshotTs: out.report.snapshot.generatedTs,
    status: out.report.snapshot.status
  };
}
