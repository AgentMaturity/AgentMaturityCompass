import YAML from "yaml";
import { assertVaultMaySign } from "../keys/signingKeys.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { updateMechanicBudgets } from "./mechanicBudgetAction.js";
import { loadToolsConfig, signToolsConfig, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { loadApprovalPolicy, approvalPolicyPath, signApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { cliInitiator } from "../approvals/approvalEngine.js";
import { policyPackApplyCliAsync, policyPackListCli } from "../policyPacks/packCli.js";
import { runAssurance } from "../assurance/assuranceRunner.js";
import { createAgentTransformPlanForApiAsync } from "../transformation/transformApi.js";
import { createFreezeIncidentForAuthority } from "../drift/freezeEngine.js";
import { benchCreateForApiAsync } from "../bench/benchApi.js";
import { refreshForecastForAuthority } from "../forecast/forecastApi.js";
import { executePluginRequest, requestPluginInstall } from "../plugins/pluginApi.js";
import { bridgeConfigPath, loadBridgeConfig, signBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { writeFileAtomic } from "../utils/fs.js";
import { latestRunId } from "../diagnostic/runReportResolution.js";
import type { MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { loadMechanicTuning } from "./tuningStore.js";

export function selectAgentId(plan: MechanicUpgradePlan): string {
  return plan.scope.type === "AGENT" ? plan.scope.id : "default";
}

function updateToolsFromTuning(workspace: string): string {
  const tuning = loadMechanicTuning(workspace).mechanicTuning.knobs;
  const tools = loadToolsConfig(workspace);
  const denied = new Set(tuning.deniedTools.map((item) => item.trim()).filter((item) => item.length > 0));
  const allowed = new Set(tuning.allowedTools.map((item) => item.trim()).filter((item) => item.length > 0));

  const kept = tools.tools.allowedTools.filter((tool) => !denied.has(tool.name));
  const knownNames = new Set(kept.map((tool) => tool.name));
  for (const name of allowed) {
    if (!knownNames.has(name)) {
      kept.push({
        name,
        actionClass: "READ_ONLY"
      });
    }
  }
  tools.tools.allowedTools = kept.sort((a, b) => a.name.localeCompare(b.name));
  tools.tools.denyByDefault = true;

  writeFileAtomic(toolsConfigPath(workspace), YAML.stringify(tools), 0o644);
  signToolsConfig(workspace);

  const bridge = loadBridgeConfig(workspace);
  const providers = new Set(tuning.allowedProviders);
  for (const [provider, config] of Object.entries(bridge.bridge.providers)) {
    config.enabled = providers.has(provider as typeof tuning.allowedProviders[number]);
    config.modelAllowlist = [...tuning.allowedModelPatterns];
  }
  writeFileAtomic(bridgeConfigPath(workspace), YAML.stringify(bridge), 0o644);
  signBridgeConfig(workspace);

  return toolsConfigPath(workspace);
}

function updateApprovalPolicyFromTuning(workspace: string): string {
  const tuning = loadMechanicTuning(workspace).mechanicTuning.knobs;
  const policy = loadApprovalPolicy(workspace);
  const required = Math.max(0, tuning.approvalQuorum.owners + tuning.approvalQuorum.auditors);
  for (const key of Object.keys(policy.approvalPolicy.actionClasses)) {
    const row = policy.approvalPolicy.actionClasses[key as keyof typeof policy.approvalPolicy.actionClasses];
    if (!row) {
      continue;
    }
    row.requiredApprovals = key === "READ_ONLY" ? Math.min(row.requiredApprovals, 1) : Math.max(row.requiredApprovals, required);
    row.requireDistinctUsers = row.requiredApprovals > 1;
    if (key === "SECURITY" || key === "DATA_EXPORT" || key === "IDENTITY") {
      row.rolesAllowed = ["OWNER", "AUDITOR"];
    }
  }
  writeFileAtomic(approvalPolicyPath(workspace), YAML.stringify(policy), 0o644);
  signApprovalPolicy(workspace);
  return approvalPolicyPath(workspace);
}

export async function executeAction(params: {
  workspace: string;
  plan: MechanicUpgradePlan;
  action: MechanicUpgradePlan["phases"][number]["actions"][number];
  beforeEffect: () => void;
  recordEffect: (effect: string) => void;
}): Promise<{ status: "EXECUTED" | "SKIPPED"; note: string }> {
  const agentId = selectAgentId(params.plan);
  params.beforeEffect();

  switch (params.action.kind) {
    case "POLICY_PACK_APPLY": {
      const packId = typeof params.action.params.packId === "string"
        ? params.action.params.packId
        : (policyPackListCli().find((pack) => pack.id === "code-agent.high")?.id ?? policyPackListCli()[0]?.id);
      if (!packId) {
        return {
          status: "SKIPPED",
          note: "no policy pack available"
        };
      }
      await policyPackApplyCliAsync({
        workspace: params.workspace,
        agentId,
        packId
      }, { beforePublish: params.beforeEffect, recordEffect: params.recordEffect });
      return {
        status: "EXECUTED",
        note: `policy pack applied (${packId})`
      };
    }
    case "BUDGETS_APPLY": {
      const path = await updateMechanicBudgets({ workspace: params.workspace, agentId, beforeEffect: params.beforeEffect, recordEffect: params.recordEffect });
      return { status: "EXECUTED", note: `budgets updated (${path})` };
    }
    case "TOOLS_APPLY": {
      assertVaultMaySign(params.workspace, "config-signature"); assertVaultMaySign(params.workspace, "artifact-seal");
      const path = updateToolsFromTuning(params.workspace);
      return { status: "EXECUTED", note: `tools/bridge updated (${path})` };
    }
    case "APPROVAL_POLICY_APPLY": {
      assertVaultMaySign(params.workspace, "config-signature"); assertVaultMaySign(params.workspace, "artifact-seal");
      const path = updateApprovalPolicyFromTuning(params.workspace);
      return { status: "EXECUTED", note: `approval policy updated (${path})` };
    }
    case "PLUGIN_INSTALL": {
      const registryId = typeof params.action.params.registryId === "string" ? params.action.params.registryId : null;
      const pluginRef = typeof params.action.params.pluginRef === "string" ? params.action.params.pluginRef : null;
      if (!registryId || !pluginRef) {
        return { status: "SKIPPED", note: "plugin action missing registryId/pluginRef" };
      }
      assertVaultMaySign(params.workspace, "artifact-seal");
      const request = await requestPluginInstall({
        workspace: params.workspace,
        initiator: cliInitiator(),
        agentId,
        registryId,
        pluginRef
      });
      params.recordEffect(`plugin-request:${request.approvalRequestId}`); params.beforeEffect();
      executePluginRequest({
        workspace: params.workspace,
        approvalRequestId: request.approvalRequestId
      });
      return { status: "EXECUTED", note: `plugin installed via ${request.approvalRequestId}` };
    }
    case "ASSURANCE_RUN": {
      let report: Awaited<ReturnType<typeof runAssurance>>;
      try {
        report = await runAssurance({ workspace: params.workspace, agentId, mode: "supervise", window: "14d", packId: "governance_bypass" }, { beforePublish: params.beforeEffect });
      } catch (error) {
        params.beforeEffect();
        if (knownSigningRefusal(error)) throw error;
        // Retain the existing unavailable-scan contract, never a known signing refusal.
        return { status: "SKIPPED", note: `assurance run did not execute: ${error instanceof Error ? error.message : String(error)}` };
      }
      // Post-result refusal cannot turn a real completed report into an unavailable scan.
      params.recordEffect(`assurance-run:${report.assuranceRunId}`); params.beforeEffect();
      return { status: "EXECUTED", note: `assurance run ${report.assuranceRunId} completed (score ${report.overallScore0to100})` };
    }
    case "TRANSFORM_PLAN_CREATE": {
      const created = await createAgentTransformPlanForApiAsync({
        workspace: params.workspace,
        agentId,
        to: "targets"
      }, { beforePublish: params.beforeEffect });
      return { status: "EXECUTED", note: `transform plan created (${created.plan.planId})` };
    }
    case "FREEZE_SET": {
      const currentRun = latestRunId(params.workspace, agentId) ?? "unknown";
      const previousRun = currentRun;
      const incident = await createFreezeIncidentForAuthority({
        workspace: params.workspace,
        agentId,
        ruleId: "mechanic-plan-freeze",
        previousRunId: previousRun,
        currentRunId: currentRun,
        deltas: {
          overallDrop: 0,
          integrityDrop: 0,
          correlationDrop: 0,
          maxLayerDrop: 0
        },
        actionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"],
        reason: "Mechanic workbench protective freeze"
      }, () => { params.beforeEffect(); if ((latestRunId(params.workspace, agentId) ?? "unknown") !== currentRun) throw new Error("mechanic freeze selected run changed while signing"); });
      return { status: "EXECUTED", note: `freeze incident created (${incident.incidentId})` };
    }
    case "BENCH_CREATE": {
      const scope = params.plan.scope.type === "AGENT" ? "agent" : params.plan.scope.type === "NODE" ? "node" : "workspace";
      const result = await benchCreateForApiAsync({
        workspace: params.workspace,
        scope,
        id: params.plan.scope.id
      }, { beforePublish: params.beforeEffect });
      return { status: "EXECUTED", note: `bench created (${result.bench.benchId})` };
    }
    case "FORECAST_REFRESH": {
      const scope = params.plan.scope.type === "AGENT" ? "agent" : params.plan.scope.type === "NODE" ? "node" : "workspace";
      const result = await refreshForecastForAuthority({
        workspace: params.workspace,
        scope,
        targetId: params.plan.scope.id
      }, params.beforeEffect);
      return { status: "EXECUTED", note: `forecast refreshed (${result.forecast.generatedTs})` };
    }
  }
}

/** Negative-only classification of actual checked signer refusals; native causes stay attached. */
function knownSigningRefusal(error: unknown, seen = new Set<unknown>()): boolean {
  if (seen.has(error)) return false; seen.add(error);
  if (error instanceof KeyProviderError || error instanceof KeyRevokedError) return true;
  if (!(error instanceof Error)) return false;
  if (/^(notary |policy sign|no-sign mode does not authorize policy signing|original BUNDLE )/i.test(error.message)) return true;
  return error.cause !== undefined && knownSigningRefusal(error.cause, seen);
}
