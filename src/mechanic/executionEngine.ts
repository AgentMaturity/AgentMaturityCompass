import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { loadBudgetsConfig, budgetsPath, signBudgetsConfig } from "../budgets/budgets.js";
import { loadToolsConfig, signToolsConfig, toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { loadApprovalPolicy, approvalPolicyPath, signApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { policyPackApplyCli, policyPackListCli } from "../policyPacks/packCli.js";
import { runAssurance } from "../assurance/assuranceRunner.js";
import { createAgentTransformPlanForApi } from "../transformation/transformApi.js";
import { createFreezeIncident } from "../drift/freezeEngine.js";
import { benchCreateForApi } from "../bench/benchApi.js";
import { refreshForecastForApi } from "../forecast/forecastApi.js";
import { executePluginRequest, requestPluginInstall } from "../plugins/pluginApi.js";
import { bridgeConfigPath, loadBridgeConfig, signBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { MechanicUpgradePlan } from "./upgradePlanSchema.js";
import { loadMechanicTuning } from "./tuningStore.js";
import { loadMechanicPlanById, saveMechanicPlan } from "./planStore.js";

function latestRunId(workspace: string, agentId: string): string | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return null;
  }
  return files[files.length - 1]!.replace(/\.json$/, "");
}

function selectAgentId(plan: MechanicUpgradePlan): string {
  return plan.scope.type === "AGENT" ? plan.scope.id : "default";
}

function updateBudgetsFromTuning(workspace: string, agentId: string): string {
  const tuning = loadMechanicTuning(workspace).mechanicTuning.knobs;
  const budgets = loadBudgetsConfig(workspace);
  const existing = budgets.budgets.perAgent[agentId] ?? budgets.budgets.perAgent.default;
  if (!existing) {
    throw new Error(`budgets profile missing for agent ${agentId}`);
  }
  budgets.budgets.perAgent[agentId] = {
    ...existing,
    daily: {
      ...existing.daily,
      maxLlmRequests: Math.max(1, tuning.maxToolCallsPerRun),
      maxLlmTokens: Math.max(1000, tuning.maxTokensPerRun),
      maxCostUsd: Math.max(0.01, tuning.maxCostPerDayUsd),
      maxToolExecutes: Object.fromEntries(
        Object.entries(existing.daily.maxToolExecutes).map(([actionClass]) => [
          actionClass,
          Math.max(0, tuning.maxToolCallsPerRun)
        ])
      ) as typeof existing.daily.maxToolExecutes
    },
    perMinute: {
      maxLlmRequests: Math.max(1, Math.ceil(tuning.maxToolCallsPerRun / 2)),
      maxLlmTokens: Math.max(1000, Math.ceil(tuning.maxTokensPerRun / 12))
    }
  };
  writeFileAtomic(budgetsPath(workspace), YAML.stringify(budgets), 0o644);
  signBudgetsConfig(workspace);
  return budgetsPath(workspace);
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

async function executeAction(params: {
  workspace: string;
  plan: MechanicUpgradePlan;
  action: MechanicUpgradePlan["phases"][number]["actions"][number];
}): Promise<{ status: "EXECUTED" | "SKIPPED"; note: string }> {
  const agentId = selectAgentId(params.plan);

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
      policyPackApplyCli({
        workspace: params.workspace,
        agentId,
        packId
      });
      return {
        status: "EXECUTED",
        note: `policy pack applied (${packId})`
      };
    }
    case "BUDGETS_APPLY": {
      const path = updateBudgetsFromTuning(params.workspace, agentId);
      return { status: "EXECUTED", note: `budgets updated (${path})` };
    }
    case "TOOLS_APPLY": {
      const path = updateToolsFromTuning(params.workspace);
      return { status: "EXECUTED", note: `tools/bridge updated (${path})` };
    }
    case "APPROVAL_POLICY_APPLY": {
      const path = updateApprovalPolicyFromTuning(params.workspace);
      return { status: "EXECUTED", note: `approval policy updated (${path})` };
    }
    case "PLUGIN_INSTALL": {
      const registryId = typeof params.action.params.registryId === "string" ? params.action.params.registryId : null;
      const pluginRef = typeof params.action.params.pluginRef === "string" ? params.action.params.pluginRef : null;
      if (!registryId || !pluginRef) {
        return { status: "SKIPPED", note: "plugin action missing registryId/pluginRef" };
      }
      const request = await requestPluginInstall({
        workspace: params.workspace,
        agentId,
        registryId,
        pluginRef
      });
      executePluginRequest({
        workspace: params.workspace,
        approvalRequestId: request.approvalRequestId
      });
      return { status: "EXECUTED", note: `plugin installed via ${request.approvalRequestId}` };
    }
    case "ASSURANCE_RUN": {
      // Previously fire-and-forget: the promise was never awaited, so this
      // reported "assurance run completed" before the run had resolved and a
      // failure surfaced as an unhandled rejection after the caller returned.
      try {
        const report = await runAssurance({
          workspace: params.workspace,
          agentId,
          mode: "supervise",
          window: "14d",
          packId: "governance_bypass"
        });
        return {
          status: "EXECUTED",
          note: `assurance run ${report.assuranceRunId} completed (score ${report.overallScore0to100})`
        };
      } catch (error) {
        // A scan that could not run is not an executed action.
        return {
          status: "SKIPPED",
          note: `assurance run did not execute: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    case "TRANSFORM_PLAN_CREATE": {
      const created = createAgentTransformPlanForApi({
        workspace: params.workspace,
        agentId,
        to: "targets"
      });
      return { status: "EXECUTED", note: `transform plan created (${created.plan.planId})` };
    }
    case "FREEZE_SET": {
      const currentRun = latestRunId(params.workspace, agentId) ?? "unknown";
      const previousRun = currentRun;
      const incident = createFreezeIncident({
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
      });
      return { status: "EXECUTED", note: `freeze incident created (${incident.incidentId})` };
    }
    case "BENCH_CREATE": {
      const scope = params.plan.scope.type === "AGENT" ? "agent" : params.plan.scope.type === "NODE" ? "node" : "workspace";
      const result = benchCreateForApi({
        workspace: params.workspace,
        scope,
        id: params.plan.scope.id
      });
      return { status: "EXECUTED", note: `bench created (${result.bench.benchId})` };
    }
    case "FORECAST_REFRESH": {
      const scope = params.plan.scope.type === "AGENT" ? "agent" : params.plan.scope.type === "NODE" ? "node" : "workspace";
      const result = refreshForecastForApi({
        workspace: params.workspace,
        scope,
        targetId: params.plan.scope.id
      });
      return { status: "EXECUTED", note: `forecast refreshed (${result.forecast.generatedTs})` };
    }
  }
}

export function requestPlanApprovals(params: {
  workspace: string;
  planId: string;
  actor: string;
  reason: string;
}): {
  plan: MechanicUpgradePlan;
  approvalRequests: Array<{ actionId: string; approvalRequestId: string; intentId: string }>;
} {
  const plan = loadMechanicPlanById(params.workspace, params.planId);
  const approvals: Array<{ actionId: string; approvalRequestId: string; intentId: string }> = [];
  const planSha = sha256Hex(Buffer.from(JSON.stringify(plan), "utf8"));

  for (const phase of plan.phases) {
    for (const action of phase.actions) {
      if (!action.requiresApproval || action.approvalRequestId) {
        continue;
      }
      const intentId = `mechanic-${plan.planId}-${action.id}`;
      const approval = createApprovalForIntent({
        workspace: params.workspace,
        agentId: selectAgentId(plan),
        intentId,
        toolName: "mechanic.plan.execute",
        actionClass: "SECURITY",
        requestedMode: "EXECUTE",
        effectiveMode: "EXECUTE",
        riskTier: "high",
        intentPayload: {
          planId: plan.planId,
          actionId: action.id,
          planSha256: planSha,
          reason: params.reason
        },
        leaseConstraints: {
          scopes: [],
          routeAllowlist: [],
          modelAllowlist: []
        }
      });
      action.approvalRequestId = approval.approval.approvalRequestId;
      action.params.approvalIntentId = intentId;
      approvals.push({
        actionId: action.id,
        approvalRequestId: approval.approval.approvalRequestId,
        intentId
      });
    }
  }

  saveMechanicPlan(params.workspace, plan);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "MECHANIC_PLAN_APPROVAL_REQUESTED",
    agentId: selectAgentId(plan),
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(JSON.stringify(approvals), "utf8")),
      id: plan.planId
    }
  });

  return {
    plan,
    approvalRequests: approvals
  };
}

export async function executeMechanicPlan(params: {
  workspace: string;
  planId: string;
}): Promise<{
  plan: MechanicUpgradePlan;
  executed: Array<{ actionId: string; status: "EXECUTED" | "SKIPPED"; note: string }>;
}> {
  const plan = loadMechanicPlanById(params.workspace, params.planId);
  const executed: Array<{ actionId: string; status: "EXECUTED" | "SKIPPED"; note: string }> = [];

  // Pre-validate approvals before any mutating action executes so bound hash checks
  // are evaluated against the same signed config snapshot used during approval.
  for (const phase of plan.phases) {
    for (const action of phase.actions) {
      if (!action.requiresApproval) {
        continue;
      }
      if (!action.approvalRequestId) {
        throw new Error(`action ${action.id} requires approval request before execution`);
      }
      const approval = verifyApprovalForExecution({
        workspace: params.workspace,
        approvalId: action.approvalRequestId,
        expectedAgentId: selectAgentId(plan),
        expectedIntentId: String(action.params.approvalIntentId ?? ""),
        expectedToolName: "mechanic.plan.execute",
        expectedActionClass: "SECURITY"
      });
      if (!approval.ok) {
        throw new Error(`approval not executable for ${action.id}: ${approval.error ?? approval.status ?? "unknown"}`);
      }
    }
  }

  for (const phase of plan.phases) {
    for (const action of phase.actions) {
      try {
        const out = await executeAction({
          workspace: params.workspace,
          plan,
          action
        });
        action.executionStatus = out.status === "EXECUTED" ? "EXECUTED" : "SKIPPED";
        action.executionNote = out.note;
        action.executedTs = Date.now();
        executed.push({
          actionId: action.id,
          status: out.status,
          note: out.note
        });

        if (action.approvalRequestId) {
          consumeApprovedExecution({
            workspace: params.workspace,
            approvalId: action.approvalRequestId,
            expectedAgentId: selectAgentId(plan),
            executionId: `${plan.planId}:${action.id}:${randomUUID()}`
          });
        }
      } catch (error) {
        action.executionStatus = "FAILED";
        action.executionNote = String(error);
        action.executedTs = Date.now();
        appendTransparencyEntry({
          workspace: params.workspace,
          type: "MECHANIC_PLAN_EXECUTION_FAILED",
          agentId: selectAgentId(plan),
          artifact: {
            kind: "policy",
            sha256: sha256Hex(Buffer.from(`${plan.planId}:${action.id}:${String(error)}`, "utf8")),
            id: action.id
          }
        });
        saveMechanicPlan(params.workspace, plan);
        throw error;
      }
    }
  }

  saveMechanicPlan(params.workspace, plan);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "MECHANIC_PLAN_EXECUTED",
    agentId: selectAgentId(plan),
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(JSON.stringify(executed), "utf8")),
      id: plan.planId
    }
  });

  return {
    plan,
    executed
  };
}
