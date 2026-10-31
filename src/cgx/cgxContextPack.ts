import { loadBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { hashId } from "../bench/benchRedaction.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { loadAgentConfig, loadFleetConfig } from "../fleet/registry.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadOutcomeContract } from "../outcomes/outcomeContractEngine.js";
import { listToolhubTools } from "../toolhub/toolhubCli.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { loadLatestTransformPlan } from "../transformation/transformTasks.js";
import { loadCgxPolicy, loadCgxPolicyAttemptAsync, cgxPolicyPath, prepareCgxContextPackAsync, loadLatestCgxContextPack } from "./cgxStore.js";
import YAML from "yaml";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { cgxContextPackSchema, cgxPolicySchema, type CgxContextPack } from "./cgxSchema.js";

function boolSort(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function contextPackWithPolicy(params: { workspace: string; agentId?: string }, policy: ReturnType<typeof loadCgxPolicy>): CgxContextPack {
  const agentId = resolveAgentId(params.workspace, params.agentId ?? "default");
  const agentConfig = loadAgentConfig(params.workspace, agentId);
  const fleet = (() => {
    try {
      return loadFleetConfig(params.workspace);
    } catch {
      return null;
    }
  })();
  const graph = loadContextGraph(params.workspace, agentId);
  const bridge = loadBridgeConfig(params.workspace);
  const tools = listToolhubTools(params.workspace).map((row) => row.name);
  const target = (() => {
    try {
      return loadTargetProfile(params.workspace, "default", agentId);
    } catch {
      return null;
    }
  })();
  const outcome = (() => {
    try {
      return loadOutcomeContract(params.workspace, agentId);
    } catch {
      return null;
    }
  })();
  const freeze = activeFreezeStatus(params.workspace, agentId);
  const transform = loadLatestTransformPlan(params.workspace, {
    type: "AGENT",
    agentId
  });

  const modelAllowlist = boolSort(
    Object.values(bridge.bridge.providers)
      .filter((row) => row.enabled)
      .flatMap((row) => row.modelAllowlist)
  );
  const providers = boolSort(
    Object.entries(bridge.bridge.providers)
      .filter(([, row]) => row.enabled)
      .map(([provider]) => provider)
  );

  const topTransformTasks = (transform?.tasks ?? [])
    .filter((task) => task.status !== "ATTESTED" && task.status !== "DONE")
    .slice(0, 3)
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      why: `Targets ${task.questionIds.slice(0, 3).join(", ")} with ${task.fourC} emphasis`,
      evidenceRefs: {
        runIds: [],
        eventHashes: task.evidenceRefs.eventHashes.slice(0, policy.cgxPolicy.pruning.maxEvidenceRefsPerNode)
      }
    }));

  const payload: CgxContextPack = {
    v: 1,
    generatedTs: Date.now(),
    scope: {
      type: "agent",
      id: agentId
    },
    agentIdHash: policy.cgxPolicy.privacy.hashAgentIds ? hashId(agentId, 8) : agentId,
    mission: {
      summary: graph.mission,
      goals: graph.successMetrics.slice(0, 5)
    },
    allowed: {
      providers,
      modelAllowlist,
      tools: boolSort(tools)
    },
    equalizerTargets: {
      profileId: target?.id ?? null,
      questionTargets: target?.mapping ?? {}
    },
    freeze: {
      active: freeze.active,
      reasons: freeze.incidentIds
    },
    topTransformTasks,
    requiredOutputContractSchemaIds: outcome
      ? boolSort([
          ...outcome.outcomeContract.metrics.map((metric) => `outcome.metric.${metric.metricId}`),
          `outcome.contract.${outcome.outcomeContract.agentId}`
        ])
      : [],
    truthConstraints: [
      "Never claim access to secrets or private keys.",
      "Never claim actions without receipt/event evidence references.",
      "When uncertain, say UNKNOWN and include evidence gaps.",
      "Honor allowlisted providers, models, tools, and approval policy boundaries.",
      ...(fleet ? [`Respect fleet policy: ${fleet.globalPolicies.privacy}.`] : [])
    ],
    evidenceRefs: {
      runIds: transform ? [transform.baseline.runId] : [],
      eventHashes: topTransformTasks.flatMap((task) => task.evidenceRefs.eventHashes)
    }
  };

  return cgxContextPackSchema.parse(payload);
}

export function buildCgxContextPack(params: { workspace: string; agentId?: string }): CgxContextPack {
  return contextPackWithPolicy(params, loadCgxPolicy(params.workspace));
}

/** Prepares a missing-pack/public build without a hidden synchronous policy/pack initializer. */
export async function prepareBuiltCgxContextPackAsync(params: { workspace: string; agentId?: string }, options: OrgPairsOptions = {}) {
  options = { ...options }; params = { ...params }; const initial = captureOrgPairsAuthority(params.workspace, options.beforePublish);
  const policyAttempt = await loadCgxPolicyAttemptAsync(params.workspace, { beforePublish: initial }), beforePublish = policyAttempt.assertCurrent; beforePublish();
  const policyPair = captureOrgPairs([cgxPolicyPath(params.workspace)]), policyBytes = orgPairBytes(policyPair, cgxPolicyPath(params.workspace)), signature = orgPairBytes(policyPair, `${cgxPolicyPath(params.workspace)}.sig`);
  if (policyBytes === null || signature === null || !verifyAuditorSignatureBytes(params.workspace, "BUNDLE", policyBytes, signature).valid) throw new Error("cgx context-pack policy is not trusted");
  const policy = cgxPolicySchema.parse(YAML.parse(policyBytes.toString("utf8"))), pack = contextPackWithPolicy(params, policy);
  const selected = canonicalize({ ...pack, generatedTs: 0 }); assertOrgPairsCurrent(policyPair);
  const prepared = await prepareCgxContextPackAsync(params.workspace, pack.scope.id, pack, { beforePublish, assertInputsCurrent() {
    options.assertInputsCurrent?.(); assertOrgPairsCurrent(policyPair);
    if (canonicalize({ ...contextPackWithPolicy(params, policy), generatedTs: 0 }) !== selected) throw new Error("selected CGX context-pack inputs changed while signing");
  } });
  return { pack, assertCurrent: prepared.assertCurrent, publish: prepared.publish };
}
/** Used async prerequisite for prompt compilation; root must wire the excluded prompt caller explicitly. */
export async function ensureCgxContextPackAsync(params: { workspace: string; agentId?: string }, options: OrgPairsOptions = {}) {
  const own = { ...params }, agentId = resolveAgentId(own.workspace, own.agentId ?? "default"), existing = loadLatestCgxContextPack(own.workspace, agentId);
  if (existing !== null) return existing;
  const prepared = await prepareBuiltCgxContextPackAsync({ workspace: own.workspace, agentId }, options); prepared.publish(); return prepared.pack;
}
