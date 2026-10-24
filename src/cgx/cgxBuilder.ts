import YAML from "yaml";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listAgents, loadAgentConfig } from "../fleet/registry.js";
import { resolveAgentId } from "../fleet/paths.js";
import { loadBridgeConfig } from "../bridge/bridgeConfigStore.js";
import { requireTrustedToolhubContext } from "../toolhub/toolContext.js";
import { loadActionPolicy } from "../governor/actionPolicyEngine.js";
import { loadBudgetsConfig, budgetForAgent } from "../budgets/budgets.js";
import { loadApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { loadLatestTransformPlan } from "../transformation/transformTasks.js";
import { loadLatestForecastArtifact } from "../forecast/forecastStore.js";
import { loadBenchComparison } from "../bench/benchPolicyStore.js";
import { loadInstalledPluginsLock, loadPluginRegistriesConfig } from "../plugins/pluginStore.js";
import { loadTrustConfig, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { openLedger } from "../ledger/ledger.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { hashId } from "../bench/benchRedaction.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import {
  cgxGraphSchema, cgxPolicySchema,
  type CgxEdge,
  type CgxGraph,
  type CgxNode,
  type CgxPolicy,
  type CgxScope
} from "./cgxSchema.js";
import {
  cgxLatestGraphPath,
  cgxPolicySha256,
  loadCgxPolicy,
  saveCgxGraph, prepareCgxGraphAsync, loadCgxPolicyAttemptAsync, cgxPolicyPath,
  verifyCgxPolicySignature
} from "./cgxStore.js";

function nodeHash(node: Omit<CgxNode, "hash">): string {
  return sha256Hex(canonicalize(node));
}

function edgeHash(edge: Omit<CgxEdge, "hash">): string {
  return sha256Hex(canonicalize(edge));
}

function addNode(map: Map<string, CgxNode>, node: Omit<CgxNode, "hash">): void {
  if (map.has(node.id)) {
    return;
  }
  map.set(
    node.id,
    cgxGraphSchema.shape.nodes.element.parse({
      ...node,
      hash: nodeHash(node)
    })
  );
}

function addEdge(
  map: Map<string, CgxEdge>,
  edge: Omit<CgxEdge, "hash" | "confidence" | "lastVerifiedTs" | "edgeEvidenceRefs" | "freshness"> &
    Partial<Pick<CgxEdge, "confidence" | "lastVerifiedTs" | "edgeEvidenceRefs" | "freshness">>
): void {
  if (map.has(edge.id)) {
    return;
  }
  const withDefaults = {
    confidence: 1.0,
    lastVerifiedTs: 0,
    edgeEvidenceRefs: [] as string[],
    freshness: "FRESH" as const,
    ...edge,
    hash: "0".repeat(64),
  };
  const h = sha256Hex(canonicalize(withDefaults));
  map.set(
    edge.id,
    cgxGraphSchema.shape.edges.element.parse({
      ...withDefaults,
      hash: h,
    })
  );
}

function modelFamily(pattern: string): string {
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) {
    return "unknown";
  }
  const base = trimmed.replaceAll("*", "");
  return (base.split(/[/:.\s-]+/)[0] ?? "unknown") || "unknown";
}

function effectiveScope(workspace: string, scope: CgxScope): CgxScope {
  if (scope.type === "workspace") {
    return {
      type: "workspace",
      id: "workspace"
    };
  }
  return {
    type: "agent",
    id: resolveAgentId(workspace, scope.id)
  };
}

function allowedByEvidenceGate(workspace: string, scope: CgxScope, policy: CgxPolicy): boolean {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const runs = ledger
      .listRuns()
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 40);
    if (runs.length === 0) {
      return false;
    }
    const targetAgent = scope.type === "agent" ? scope.id : null;
    const reports = runs
      .map((row) => {
        try {
          const report = JSON.parse(readFileSync(join(workspace, ".amc", "agents", targetAgent ?? "default", "runs", `${row.run_id}.json`), "utf8")) as {
            integrityIndex?: unknown;
            correlationRatio?: unknown;
            agentId?: unknown;
          };
          return {
            integrityIndex: typeof report.integrityIndex === "number" ? report.integrityIndex : 0,
            correlationRatio: typeof report.correlationRatio === "number" ? report.correlationRatio : 0,
            agentId: typeof report.agentId === "string" ? report.agentId : "default"
          };
        } catch {
          return null;
        }
      })
      .filter((row): row is { integrityIndex: number; correlationRatio: number; agentId: string } => row !== null)
      .filter((row) => !targetAgent || row.agentId === targetAgent);
    if (reports.length === 0) {
      return false;
    }
    const integrity = reports.reduce((sum, row) => sum + row.integrityIndex, 0) / reports.length;
    const correlation = reports.reduce((sum, row) => sum + row.correlationRatio, 0) / reports.length;
    return integrity >= policy.cgxPolicy.evidenceGates.minIntegrityIndex && correlation >= policy.cgxPolicy.evidenceGates.minCorrelationRatio;
  } finally {
    ledger.close();
  }
}

function graphInputs(workspace: string, selectedScope: CgxScope, policy: CgxPolicy) {
  const scope = effectiveScope(workspace, selectedScope), agents = (scope.type === "agent" ? [scope.id] : listAgents(workspace).map(row => row.id)).sort((a, b) => a.localeCompare(b));
  const budgets = loadBudgetsConfig(workspace);
  return { scope, allowExtended: allowedByEvidenceGate(workspace, scope, policy), trustValid: verifyTrustConfigSignature(workspace).valid,
    trust: loadTrustConfig(workspace), agents: agents.map(id => ({ id, config: loadAgentConfig(workspace, id), transform: loadLatestTransformPlan(workspace, { type: "AGENT", agentId: id }),
      forecast: loadLatestForecastArtifact(workspace, { type: "AGENT", id }), budget: budgetForAgent(budgets, id) })),
    bridge: loadBridgeConfig(workspace), tools: requireTrustedToolhubContext(workspace), action: loadActionPolicy(workspace), approval: loadApprovalPolicy(workspace),
    plugins: { installed: loadInstalledPluginsLock(workspace).installed.slice(0, 100).map(row => ({ id: row.id, version: row.version })) }, registries: loadPluginRegistriesConfig(workspace), bench: loadBenchComparison(workspace) };
}

function buildGraph(params: {
  workspace: string;
  scope: CgxScope;
  policy: CgxPolicy;
  inputs?: ReturnType<typeof graphInputs>;
  policySha256?: string;
}): CgxGraph {
  const inputs = params.inputs ?? graphInputs(params.workspace, params.scope, params.policy), scope = inputs.scope;
  const nodeMap = new Map<string, CgxNode>();
  const edgeMap = new Map<string, CgxEdge>();
  const allowExtended = inputs.allowExtended;

  const trustSig = { valid: inputs.trustValid };
  const trust = inputs.trust;
  const workspaceId = hashId(params.workspace, 8);
  const wsNodeId = `workspace:${workspaceId}`;

  addNode(nodeMap, {
    id: wsNodeId,
    type: "Workspace",
    label: scope.type === "workspace" ? "workspace" : `workspace:${workspaceId}`,
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });

  addNode(nodeMap, {
    id: `trust:${trust.trust.mode}`,
    type: "TrustMode",
    label: trust.trust.mode,
    evidenceRefs: {
      runIds: [],
      eventHashes: trustSig.valid ? [] : ["TRUST_CONFIG_UNTRUSTED"]
    }
  });
  addEdge(edgeMap, {
    id: `edge:${wsNodeId}:trust`,
    type: "CONSTRAINED_BY",
    from: wsNodeId,
    to: `trust:${trust.trust.mode}`,
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });

  const agents = inputs.agents.map(row => row.id);
  for (const agentId of agents.sort((a, b) => a.localeCompare(b))) {
    const selected = inputs.agents.find(row => row.id === agentId)!;
    const cfg = selected.config;
    const agentIdHash = hashId(agentId, 8);
    const agentNodeId = `agent:${agentIdHash}`;
    addNode(nodeMap, {
      id: agentNodeId,
      type: "Agent",
      label: cfg.agentName,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${wsNodeId}:${agentNodeId}:owns`,
      type: "OWNS",
      from: wsNodeId,
      to: agentNodeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });

    const agentTypeId = `agentType:${cfg.role.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
    addNode(nodeMap, {
      id: agentTypeId,
      type: "AgentType",
      label: cfg.role,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${agentNodeId}:${agentTypeId}:uses`,
      type: "USES",
      from: agentNodeId,
      to: agentTypeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });

    const transform = selected.transform;
    if (transform) {
      const planNodeId = `transformPlan:${transform.planId}`;
      addNode(nodeMap, {
        id: planNodeId,
        type: "TransformPlan",
        label: transform.planId,
        evidenceRefs: {
          runIds: [transform.baseline.runId],
          eventHashes: []
        }
      });
      addEdge(edgeMap, {
        id: `edge:${agentNodeId}:${planNodeId}:targets`,
        type: "TARGETS",
        from: agentNodeId,
        to: planNodeId,
        evidenceRefs: {
          runIds: [transform.baseline.runId],
          eventHashes: []
        }
      });
      if (allowExtended) {
        for (const task of transform.tasks.slice(0, 16)) {
          const taskNodeId = `transformTask:${task.taskId}`;
          addNode(nodeMap, {
            id: taskNodeId,
            type: "TransformTask",
            label: task.title,
            evidenceRefs: {
              runIds: [],
              eventHashes: task.evidenceRefs.eventHashes.slice(0, params.policy.cgxPolicy.pruning.maxEvidenceRefsPerNode)
            }
          });
          addEdge(edgeMap, {
            id: `edge:${planNodeId}:${taskNodeId}:improves`,
            type: "IMPROVES",
            from: planNodeId,
            to: taskNodeId,
            evidenceRefs: {
              runIds: [],
              eventHashes: task.evidenceRefs.eventHashes.slice(0, 4)
            }
          });
        }
      }
    }

    const forecast = selected.forecast;
    if (forecast) {
      const fNodeId = `forecast:${agentIdHash}`;
      addNode(nodeMap, {
        id: fNodeId,
        type: "Forecast",
        label: forecast.status,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
      addEdge(edgeMap, {
        id: `edge:${agentNodeId}:${fNodeId}:produces`,
        type: "PRODUCES",
        from: agentNodeId,
        to: fNodeId,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
    }
  }

  const bridge = inputs.bridge;
  for (const [provider, config] of Object.entries(bridge.bridge.providers)) {
    if (!config.enabled) {
      continue;
    }
    const providerNodeId = `provider:${provider}`;
    addNode(nodeMap, {
      id: providerNodeId,
      type: "ModelProvider",
      label: provider,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${wsNodeId}:${providerNodeId}:uses`,
      type: "USES",
      from: wsNodeId,
      to: providerNodeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    for (const pattern of config.modelAllowlist) {
      const family = modelFamily(pattern);
      const familyNodeId = `modelFamily:${family}`;
      addNode(nodeMap, {
        id: familyNodeId,
        type: "ModelFamily",
        label: family,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
      addEdge(edgeMap, {
        id: `edge:${providerNodeId}:${familyNodeId}:uses:${pattern}`,
        type: "USES",
        from: providerNodeId,
        to: familyNodeId,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
    }
  }

  const toolContext = inputs.tools;
  for (const group of toolContext.groups) {
    if (group.server) {
      addNode(nodeMap, {
        id: group.server.serverIdentity,
        type: "MCPServer",
        label: group.server.name,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
      addEdge(edgeMap, {
        id: `edge:${wsNodeId}:${group.server.serverIdentity}:constrained-by`,
        type: "CONSTRAINED_BY",
        from: wsNodeId,
        to: group.server.serverIdentity,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
    }
    for (const tool of group.tools) {
      const toolNodeId = tool.toolIdentity;
      addNode(nodeMap, {
        id: toolNodeId,
        type: "Tool",
        label: tool.name,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
      addEdge(edgeMap, {
        id: `edge:${wsNodeId}:${toolNodeId}:constrained-by`,
        type: "CONSTRAINED_BY",
        from: wsNodeId,
        to: toolNodeId,
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        }
      });
      if (group.server) {
        addEdge(edgeMap, {
          id: `edge:${group.server.serverIdentity}:${toolNodeId}:provides`,
          type: "PROVIDES",
          from: group.server.serverIdentity,
          to: toolNodeId,
          evidenceRefs: {
            runIds: [],
            eventHashes: []
          }
        });
      }
    }
  }

  const actionPolicy = inputs.action;
  const actionNodeId = `policy:action:v${actionPolicy.version}`;
  addNode(nodeMap, {
    id: actionNodeId,
    type: "PolicyPack",
    label: "action-policy",
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });
  addEdge(edgeMap, {
    id: `edge:${wsNodeId}:${actionNodeId}:governed`,
    type: "GOVERNED_BY",
    from: wsNodeId,
    to: actionNodeId,
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });

  const approvalPolicy = inputs.approval;
  const approvalNodeId = `approvalPolicy:v${approvalPolicy.approvalPolicy.version}`;
  addNode(nodeMap, {
    id: approvalNodeId,
    type: "ApprovalPolicy",
    label: "approval-policy",
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });
  addEdge(edgeMap, {
    id: `edge:${wsNodeId}:${approvalNodeId}:governed`,
    type: "GOVERNED_BY",
    from: wsNodeId,
    to: approvalNodeId,
    evidenceRefs: {
      runIds: [],
      eventHashes: []
    }
  });

  for (const agentId of agents) {
    const budget = inputs.agents.find(row => row.id === agentId)!.budget;
    if (!budget) {
      continue;
    }
    const budgetNodeId = `budget:${hashId(agentId, 8)}`;
    addNode(nodeMap, {
      id: budgetNodeId,
      type: "Budget",
      label: `dailyUsd:${budget.daily.maxCostUsd}`,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
  }

  const plugins = inputs.plugins;
  for (const plugin of plugins.installed.slice(0, 100)) {
    const pluginNodeId = `plugin:${plugin.id}@${plugin.version}`;
    addNode(nodeMap, {
      id: pluginNodeId,
      type: "Plugin",
      label: `${plugin.id}@${plugin.version}`,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${wsNodeId}:${pluginNodeId}:depends`,
      type: "DEPENDS_ON",
      from: wsNodeId,
      to: pluginNodeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
  }

  const registries = inputs.registries;
  for (const registry of registries.pluginRegistries.registries) {
    const registryNodeId = `registry:${registry.id}`;
    addNode(nodeMap, {
      id: registryNodeId,
      type: "Registry",
      label: registry.id,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${wsNodeId}:${registryNodeId}:depends`,
      type: "DEPENDS_ON",
      from: wsNodeId,
      to: registryNodeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
  }

  const bench = inputs.bench;
  if (bench) {
    const benchNodeId = `bench:latest`;
    addNode(nodeMap, {
      id: benchNodeId,
      type: "Bench",
      label: bench.scope.type,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
    addEdge(edgeMap, {
      id: `edge:${wsNodeId}:${benchNodeId}:produces`,
      type: "PRODUCES",
      from: wsNodeId,
      to: benchNodeId,
      evidenceRefs: {
        runIds: [],
        eventHashes: []
      }
    });
  }

  const nodes = [...nodeMap.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, params.policy.cgxPolicy.maxGraphNodes);
  const nodeIds = new Set(nodes.map((row) => row.id));
  const edges = [...edgeMap.values()]
    .filter((row) => nodeIds.has(row.from) && nodeIds.has(row.to))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, params.policy.cgxPolicy.pruning.maxEdges);

  return cgxGraphSchema.parse({
    v: 1,
    scope,
    generatedTs: Date.now(),
    policySha256: params.policySha256 ?? cgxPolicySha256(params.workspace),
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length
    }
  });
}

export function buildCgxGraph(params: {
  workspace: string;
  scope: CgxScope;
  persist?: boolean;
}): {
  graph: CgxGraph;
  saved: ReturnType<typeof saveCgxGraph> | null;
  transparencyHash: string | null;
} {
  const policySig = verifyCgxPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`cgx policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = loadCgxPolicy(params.workspace);
  const graph = buildGraph({
    workspace: params.workspace,
    scope: params.scope,
    policy
  });

  if (params.persist === false) {
    return {
      graph,
      saved: null,
      transparencyHash: null
    };
  }

  const saved = saveCgxGraph(params.workspace, graph.scope, graph);
  const sha = sha256Hex(canonicalize(graph));
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "CGX_GRAPH_CREATED",
    agentId: graph.scope.type === "agent" ? graph.scope.id : "workspace",
    artifact: {
      kind: "policy",
      id: `cgx-${graph.scope.type}-${graph.scope.id}-${graph.generatedTs}`,
      sha256: sha
    }
  });
  return {
    graph,
    saved,
    transparencyHash: entry.hash
  };
}

export function cgxLatestGraphFile(workspace: string, scope: CgxScope): string {
  return cgxLatestGraphPath(workspace, scope);
}

export class CgxOutputsPartialError extends Error {
  readonly code = "CGX_OUTPUTS_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly phase: string, cause: unknown, readonly transparencyHashes: readonly string[] = []) {
    super("CGX publication has committed earlier outputs; inspect state before retrying", { cause }); this.name = "CgxOutputsPartialError";
  }
}
/** Maintained async writer. persist:false remains a computation-only synchronous-compatible branch. */
export async function buildCgxGraphRunAsync(input: { workspace: string; scope: CgxScope; persist?: boolean }, options: OrgPairsOptions = {}) {
  options = { ...options }; const params = { ...input, scope: { ...input.scope } }, initial = options.beforePublish; initial?.();
  if (params.persist === false) return { result: buildCgxGraph(params), assertCurrent: () => {} };
  const original = captureOrgPairsAuthority(params.workspace, initial);
  const policyAttempt = await loadCgxPolicyAttemptAsync(params.workspace, { beforePublish: original }), beforePublish = policyAttempt.assertCurrent; beforePublish();
  const policyPair = captureOrgPairs([cgxPolicyPath(params.workspace)]), policyBytes = orgPairBytes(policyPair, cgxPolicyPath(params.workspace)), policySignature = orgPairBytes(policyPair, `${cgxPolicyPath(params.workspace)}.sig`);
  if (policyBytes === null || policySignature === null || !verifyAuditorSignatureBytes(params.workspace, "BUNDLE", policyBytes, policySignature).valid) throw new Error("cgx policy signature invalid: captured pair is not trusted");
  const policy = cgxPolicySchema.parse(YAML.parse(policyBytes.toString("utf8"))), inputs = graphInputs(params.workspace, params.scope, policy), selected = canonicalize(inputs);
  const graph = buildGraph({ ...params, policy, inputs, policySha256: sha256Hex(policyBytes) }); assertOrgPairsCurrent(policyPair);
  const prepared = await prepareCgxGraphAsync(params.workspace, graph.scope, graph, { beforePublish, assertInputsCurrent() {
    options.assertInputsCurrent?.(); assertOrgPairsCurrent(policyPair);
    if (canonicalize(graphInputs(params.workspace, params.scope, policy)) !== selected) throw new Error("selected CGX graph inputs changed while signing");
  } });
  const saved = prepared.publish();
  try {
    prepared.assertCurrent(); const entry = await appendTransparencyEntryAsync({ workspace: params.workspace, type: "CGX_GRAPH_CREATED",
      agentId: graph.scope.type === "agent" ? graph.scope.id : "workspace", artifact: { kind: "policy", id: `cgx-${graph.scope.type}-${graph.scope.id}-${graph.generatedTs}`, sha256: sha256Hex(canonicalize(graph)) } }, { beforeCommit: prepared.assertCurrent });
    return { result: { graph, saved, transparencyHash: entry.hash }, assertCurrent: prepared.assertCurrent };
  } catch (error) { throw new CgxOutputsPartialError([saved.latestPath, saved.latestSigPath, saved.snapshotPath, saved.snapshotSigPath], "graph-transparency", error); }
}
export async function buildCgxGraphAsync(params: Parameters<typeof buildCgxGraphRunAsync>[0], options: OrgPairsOptions = {}) {
  return (await buildCgxGraphRunAsync(params, options)).result;
}
