import YAML from "yaml";
import { valuePolicySchema } from "./valuePolicySchema.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import {
  valuePolicyPath, valueSchedulerPath,
  loadValueSchedulerState,
  saveValueSchedulerStateAsync
} from "./valueStore.js";
import { valueSchedulerRunNowRun } from "./valueApi.js";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { ValueOutputsPartialError } from "./valueReports.js";
import { includes } from "../utils/typeGuards.js";

function nextTs(nowTs: number, hours: number): number {
  return nowTs + Math.max(1, hours) * 60 * 60 * 1000;
}

export async function valueSchedulerTick(params: {
  workspace: string;
  workspaceReady: boolean;
  eventType?: string;
}, options: OrgPairsOptions = {}): Promise<
  | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "not_due" }
  | { ran: true; snapshotTs: number; status: "OK" | "INSUFFICIENT_EVIDENCE" }
> {
  options = { ...options }; params = { ...params }; const beforePublish = options.beforePublish; beforePublish?.();
  const initial = captureOrgPairs([valueSchedulerPath(params.workspace)]), state = loadValueSchedulerState(params.workspace);
  assertOrgPairsCurrent(initial);
  if (!state.enabled) {
    return { ran: false, reason: "disabled" };
  }
  if (!params.workspaceReady) {
    const original = captureOrgPairsAuthority(params.workspace, beforePublish);
    await saveValueSchedulerStateAsync(params.workspace, {
      ...state,
      lastOutcome: {
        status: "SKIPPED",
        reason: "workspace not ready"
      }
    }, { beforePublish: original }, initial);
    return { ran: false, reason: "workspace_not_ready" };
  }
  const policyPair = captureOrgPairs([valuePolicyPath(params.workspace)]), body = orgPairBytes(policyPair, valuePolicyPath(params.workspace)), sidecar = orgPairBytes(policyPair, `${valuePolicyPath(params.workspace)}.sig`);
  const verify = body === null || sidecar === null ? { valid: false, reason: "value policy missing or unsigned" } : verifyAuditorSignatureBytes(params.workspace, "BUNDLE", body, sidecar);
  if (!verify.valid) {
    const original = captureOrgPairsAuthority(params.workspace, beforePublish);
    await saveValueSchedulerStateAsync(params.workspace, {
      ...state,
      lastOutcome: {
        status: "ERROR",
        reason: verify.reason ?? "policy signature invalid"
      }
    }, { beforePublish: original }, initial);
    return { ran: false, reason: "policy_untrusted" };
  }

  if (body === null) throw new Error("value policy missing");
  const policy = valuePolicySchema.parse(YAML.parse(body.toString("utf8")));
  const nowTs = Date.now();
  const dueSnapshot = !state.nextSnapshotTs || state.nextSnapshotTs <= nowTs;
  const dueReport = !state.nextReportTs || state.nextReportTs <= nowTs;
  const eventTriggered = Boolean(
    params.eventType && includes(policy.valuePolicy.cadence.refreshOnEvents, params.eventType)
  );

  if (!eventTriggered && !dueSnapshot && !dueReport) {
    return { ran: false, reason: "not_due" };
  }

  const original = captureOrgPairsAuthority(params.workspace, beforePublish);
  const attempt = await valueSchedulerRunNowRun({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  }, { beforePublish: original, assertInputsCurrent: () => { assertOrgPairsCurrent(initial); assertOrgPairsCurrent(policyPair); } });
  const out = attempt.result;
  try {
  const afterRun = captureOrgPairs([valueSchedulerPath(params.workspace)]);
  if (canonicalize(loadValueSchedulerState(params.workspace)) !== canonicalize(out.scheduler)) throw new Error("value scheduler changed after its report run");
  attempt.assertCurrent();
  await saveValueSchedulerStateAsync(params.workspace, {
    ...out.scheduler,
    nextSnapshotTs: nextTs(nowTs, policy.valuePolicy.cadence.snapshotEveryHours),
    nextReportTs: nextTs(nowTs, policy.valuePolicy.cadence.reportEveryHours)
  }, { beforePublish: () => { original(); attempt.assertAuthorityCurrent(); assertOrgPairsCurrent(policyPair); },
    assertInputsCurrent: () => { options.assertInputsCurrent?.(); attempt.assertCurrent(); assertOrgPairsCurrent(policyPair); } }, afterRun);

  return {
    ran: true,
    snapshotTs: out.report.snapshot.generatedTs,
    status: out.report.snapshot.status
  };
  } catch (error) { throw new ValueOutputsPartialError([out.report.saved.path, out.report.saved.sigPath, valueSchedulerPath(params.workspace), `${valueSchedulerPath(params.workspace)}.sig`], "scheduler-tick-after-run", error); }
}
