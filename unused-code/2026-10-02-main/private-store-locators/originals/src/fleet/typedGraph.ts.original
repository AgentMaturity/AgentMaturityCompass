import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { ActionClass } from "../types.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const typedGraphNodeTypeSchema = z.enum(["agent", "human", "tool", "workflow", "memory", "policy"]);
export const typedGraphEdgeTypeSchema = z.enum(["handoff", "delegation", "tool_call", "memory_read", "memory_write", "approval", "observation"]);
export const typedGraphFailurePropagationSchema = z.enum(["isolate", "degrade", "cascade", "block"]);
export const typedGraphInvariantSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const actionClassSchema = z.enum([
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);

export const typedGraphPortSchema = z.object({
  name: z.string().min(1),
  schema: z.string().min(1)
});

export const typedGraphToolSchema = z.object({
  toolId: z.string().min(1),
  permission: actionClassSchema,
  policyRefs: z.array(z.string().min(1)).default([])
});

export const typedGraphNodeSchema = z.object({
  nodeId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  nodeType: typedGraphNodeTypeSchema,
  role: z.string().min(1),
  description: z.string().default(""),
  inputs: z.array(typedGraphPortSchema).default([]),
  outputs: z.array(typedGraphPortSchema).default([]),
  tools: z.array(typedGraphToolSchema).default([]),
  memoryScopes: z.array(z.string().min(1)).default([]),
  policyRefs: z.array(z.string().min(1)).default([]),
  permissions: z.array(actionClassSchema).default(["READ_ONLY"])
});

export const typedGraphContractSchema = z.object({
  inputSchema: z.string().min(1),
  outputSchema: z.string().min(1),
  requiredEvidence: z.array(z.string().min(1)).default([]),
  approvalRequired: z.boolean().default(false)
});

export const typedGraphEdgeSchema = z.object({
  edgeId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  edgeType: typedGraphEdgeTypeSchema,
  purpose: z.string().min(1),
  contract: typedGraphContractSchema.nullable().default(null),
  permissions: z.array(actionClassSchema).default(["READ_ONLY"]),
  failurePropagation: typedGraphFailurePropagationSchema.default("degrade")
});

export const typedGraphInvariantSchema = z.object({
  invariantId: z.string().min(1),
  description: z.string().min(1),
  severity: typedGraphInvariantSeveritySchema,
  requiredEvidence: z.array(z.string().min(1)).default([])
});

export const typedMultiAgentGraphSchema = z.object({
  schemaVersion: z.literal("2026-05-22"),
  graphId: z.string().min(1),
  fleetId: z.string().min(1).default("default"),
  createdAt: z.string().min(1),
  maxFanOut: z.number().int().positive().default(5),
  nodes: z.array(typedGraphNodeSchema).min(1),
  edges: z.array(typedGraphEdgeSchema).default([]),
  invariants: z.array(typedGraphInvariantSchema).default([])
});

export type TypedGraphNode = z.infer<typeof typedGraphNodeSchema>;
export type TypedGraphEdge = z.infer<typeof typedGraphEdgeSchema>;
export type TypedMultiAgentGraph = z.infer<typeof typedMultiAgentGraphSchema>;

export type TypedGraphIssueCode =
  | "invalid_schema"
  | "duplicate_node"
  | "duplicate_edge"
  | "missing_node"
  | "missing_node_contract"
  | "missing_handoff_contract"
  | "contract_schema_mismatch"
  | "unsafe_permission_without_policy"
  | "cycle_detected"
  | "unbounded_fanout";

export interface TypedGraphValidationIssue {
  code: TypedGraphIssueCode;
  severity: "warning" | "error";
  message: string;
  nodeId?: string;
  edgeId?: string;
  evidenceRefs: string[];
}

export interface TypedGraphValidation {
  valid: boolean;
  summary: string;
  issueCount: number;
  issues: TypedGraphValidationIssue[];
}

export interface TypedMultiAgentGraphRef {
  graphId: string;
  path: string;
  digestSha256: string;
  nodeCount: number;
  edgeCount: number;
  validation: TypedGraphValidation;
}

export interface WriteTypedMultiAgentGraphResult {
  graph: TypedMultiAgentGraph;
  graphPath: string;
  latestPath: string;
  ref: TypedMultiAgentGraphRef;
}

const HIGH_RISK_PERMISSIONS = new Set<ActionClass>([
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);

function graphRoot(workspace: string): string {
  return join(workspace, ".amc", "fleet", "typed-graphs");
}

export function latestTypedMultiAgentGraphPath(workspace: string): string {
  return join(graphRoot(workspace), "latest.json");
}

export function typedMultiAgentGraphPath(workspace: string, graphId: string): string {
  return join(graphRoot(workspace), `${graphId}.json`);
}

export function typedMultiAgentGraphDigest(graph: TypedMultiAgentGraph): string {
  const normalized = typedMultiAgentGraphSchema.parse(graph);
  return sha256Hex(canonicalize(normalized));
}

function issue(params: Omit<TypedGraphValidationIssue, "evidenceRefs"> & { evidenceRefs?: string[] }): TypedGraphValidationIssue {
  return {
    evidenceRefs: params.evidenceRefs ?? [],
    ...params
  };
}

function hasHighRiskPermission(permissions: ActionClass[]): boolean {
  return permissions.some((permission) => HIGH_RISK_PERMISSIONS.has(permission));
}

function detectCycles(nodes: TypedGraphNode[], edges: TypedGraphEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.nodeId, []);
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      adjacency.get(edge.from)!.push(edge.to);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function visit(nodeId: string): void {
    if (visiting.has(nodeId)) {
      const index = stack.indexOf(nodeId);
      cycles.push(index >= 0 ? stack.slice(index).concat(nodeId) : [nodeId]);
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }
    visiting.add(nodeId);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of nodes) {
    visit(node.nodeId);
  }
  return cycles;
}

export function validateTypedMultiAgentGraph(value: unknown): TypedGraphValidation {
  let graph: TypedMultiAgentGraph;
  try {
    graph = typedMultiAgentGraphSchema.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      summary: `1 issue found in typed multi-agent graph.`,
      issueCount: 1,
      issues: [issue({
        code: "invalid_schema",
        severity: "error",
        message: `Graph schema is invalid: ${message}`
      })]
    };
  }

  const issues: TypedGraphValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.nodeId)) {
      issues.push(issue({
        code: "duplicate_node",
        severity: "error",
        nodeId: node.nodeId,
        message: `Node ${node.nodeId} is declared more than once.`
      }));
    }
    nodeIds.add(node.nodeId);
    if (node.inputs.length === 0 && node.outputs.length === 0 && node.nodeType !== "human") {
      issues.push(issue({
        code: "missing_node_contract",
        severity: "error",
        nodeId: node.nodeId,
        message: `Node ${node.nodeId} needs at least one typed input or output contract.`
      }));
    }
    if (hasHighRiskPermission(node.permissions) && node.policyRefs.length === 0) {
      issues.push(issue({
        code: "unsafe_permission_without_policy",
        severity: "error",
        nodeId: node.nodeId,
        message: `Node ${node.nodeId} has high-risk permissions without policyRefs.`
      }));
    }
    for (const tool of node.tools) {
      if (HIGH_RISK_PERMISSIONS.has(tool.permission) && tool.policyRefs.length === 0 && node.policyRefs.length === 0) {
        issues.push(issue({
          code: "unsafe_permission_without_policy",
          severity: "error",
          nodeId: node.nodeId,
          message: `Tool ${tool.toolId} on ${node.nodeId} has ${tool.permission} without tool or node policyRefs.`
        }));
      }
    }
  }

  const fanout = new Map<string, number>();
  const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) {
      issues.push(issue({
        code: "duplicate_edge",
        severity: "error",
        edgeId: edge.edgeId,
        message: `Edge ${edge.edgeId} is declared more than once.`
      }));
    }
    edgeIds.add(edge.edgeId);

    const fromNode = nodesById.get(edge.from);
    const toNode = nodesById.get(edge.to);
    if (!fromNode || !toNode) {
      issues.push(issue({
        code: "missing_node",
        severity: "error",
        edgeId: edge.edgeId,
        message: `Edge ${edge.edgeId} references missing node(s): ${!fromNode ? edge.from : ""}${!fromNode && !toNode ? ", " : ""}${!toNode ? edge.to : ""}.`
      }));
    }

    fanout.set(edge.from, (fanout.get(edge.from) ?? 0) + 1);
    if ((edge.edgeType === "handoff" || edge.edgeType === "delegation") && !edge.contract) {
      issues.push(issue({
        code: "missing_handoff_contract",
        severity: "error",
        edgeId: edge.edgeId,
        message: `Edge ${edge.edgeId} needs a typed handoff/delegation contract.`
      }));
    }
    if (edge.contract && fromNode && toNode) {
      const sourceOutputs = new Set(fromNode.outputs.map((port) => port.schema));
      const targetInputs = new Set(toNode.inputs.map((port) => port.schema));
      if (!sourceOutputs.has(edge.contract.inputSchema) || !targetInputs.has(edge.contract.inputSchema)) {
        issues.push(issue({
          code: "contract_schema_mismatch",
          severity: "error",
          edgeId: edge.edgeId,
          message: `Edge ${edge.edgeId} contract input ${edge.contract.inputSchema} must match a source output and target input schema.`
        }));
      }
    }
    if (hasHighRiskPermission(edge.permissions) && edge.contract?.approvalRequired !== true) {
      issues.push(issue({
        code: "unsafe_permission_without_policy",
        severity: "error",
        edgeId: edge.edgeId,
        message: `Edge ${edge.edgeId} carries high-risk permissions without approvalRequired=true.`
      }));
    }
  }

  for (const [nodeId, count] of fanout.entries()) {
    if (count > graph.maxFanOut) {
      issues.push(issue({
        code: "unbounded_fanout",
        severity: "error",
        nodeId,
        message: `Node ${nodeId} has fan-out ${count}, above maxFanOut ${graph.maxFanOut}.`
      }));
    }
  }

  const cycles = detectCycles(graph.nodes, graph.edges);
  if (cycles.length > 0) {
    issues.push(issue({
      code: "cycle_detected",
      severity: "error",
      message: `Graph contains cycle(s): ${cycles.map((cycle) => cycle.join(" -> ")).join("; ")}.`
    }));
  }

  const valid = issues.length === 0;
  return {
    valid,
    summary: valid ? "Typed multi-agent graph is valid." : `${issues.length} issue${issues.length === 1 ? "" : "s"} found in typed multi-agent graph.`,
    issueCount: issues.length,
    issues
  };
}

export function typedMultiAgentGraphRef(params: {
  workspace: string;
  graph: TypedMultiAgentGraph;
  path?: string;
}): TypedMultiAgentGraphRef {
  const graph = typedMultiAgentGraphSchema.parse(params.graph);
  return {
    graphId: graph.graphId,
    path: params.path ? resolve(params.path) : latestTypedMultiAgentGraphPath(params.workspace),
    digestSha256: typedMultiAgentGraphDigest(graph),
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    validation: validateTypedMultiAgentGraph(graph)
  };
}

export function writeTypedMultiAgentGraph(input: {
  workspace: string;
  graph: unknown;
}): WriteTypedMultiAgentGraphResult {
  const graph = typedMultiAgentGraphSchema.parse(input.graph);
  ensureDir(graphRoot(input.workspace));
  const graphPath = typedMultiAgentGraphPath(input.workspace, graph.graphId);
  const latestPath = latestTypedMultiAgentGraphPath(input.workspace);
  const payload = `${JSON.stringify(graph, null, 2)}\n`;
  writeFileAtomic(graphPath, payload, 0o644);
  writeFileAtomic(latestPath, payload, 0o644);
  return {
    graph,
    graphPath,
    latestPath,
    ref: typedMultiAgentGraphRef({ workspace: input.workspace, graph, path: latestPath })
  };
}

export function loadTypedMultiAgentGraph(workspace: string, graphId: string): TypedMultiAgentGraph {
  const path = typedMultiAgentGraphPath(workspace, graphId);
  return typedMultiAgentGraphSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function loadLatestTypedMultiAgentGraph(workspace: string): TypedMultiAgentGraph | null {
  const path = latestTypedMultiAgentGraphPath(workspace);
  if (!existsSync(path)) {
    return null;
  }
  return typedMultiAgentGraphSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function listTypedMultiAgentGraphs(workspace: string): TypedMultiAgentGraphRef[] {
  const root = graphRoot(workspace);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .filter((entry) => entry.endsWith(".json") && entry !== "latest.json")
    .map((entry) => {
      const path = join(root, entry);
      const graph = typedMultiAgentGraphSchema.parse(JSON.parse(readUtf8(path)) as unknown);
      return typedMultiAgentGraphRef({ workspace, graph, path });
    })
    .sort((a, b) => a.graphId.localeCompare(b.graphId));
}
