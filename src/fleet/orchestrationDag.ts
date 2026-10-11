/**
 * Orchestration DAG Capture
 *
 * Records multi-agent call graphs with typed edges when agent A delegates to agent B.
 * DAG is stored per-fleet, signed, and hash-chained.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { fleetRoot } from "./paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestrationEventType =
  | "agent_handoff_sent"
  | "agent_handoff_received"
  | "agent_delegation_started"
  | "agent_delegation_completed";

export const dagNodeSchema = z.object({
  nodeId: z.string().min(1),
  dagId: z.string().min(1),
  callerAgentId: z.string().min(1),
  calleeAgentId: z.string().min(1),
  eventType: z.enum([
    "agent_handoff_sent",
    "agent_handoff_received",
    "agent_delegation_started",
    "agent_delegation_completed",
  ]),
  taskDescription: z.string(),
  contextHash: z.string(),
  startTs: z.number(),
  endTs: z.number().nullable(),
  outcome: z.string().nullable(),
  parentNodeId: z.string().nullable(),
  prevHash: z.string(),
  nodeHash: z.string(),
  signature: z.string(),
});

export type DagNode = z.infer<typeof dagNodeSchema>;

export interface OrchestrationDag {
  dagId: string;
  fleetId: string;
  createdTs: number;
  nodes: DagNode[];
  dagHash: string;
  dagSignature: string;
}

export interface DagVisualization {
  dagId: string;
  lines: string[];
  nodeCount: number;
  rootAgents: string[];
  leafAgents: string[];
}

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

function dagDir(workspace: string): string {
  return join(fleetRoot(workspace), "dags");
}

function dagFilePath(workspace: string, dagId: string): string {
  return join(dagDir(workspace), `${dagId}.json`);
}

// ---------------------------------------------------------------------------
// DAG creation & node appending
// ---------------------------------------------------------------------------

export function createDag(workspace: string, fleetId?: string): OrchestrationDag {
  ensureDir(dagDir(workspace));
  const dagId = `dag_${randomUUID().slice(0, 12)}`;
  const dag: OrchestrationDag = {
    dagId,
    fleetId: fleetId ?? "default",
    createdTs: Date.now(),
    nodes: [],
    dagHash: "",
    dagSignature: "",
  };
  dag.dagHash = sha256Hex(Buffer.from(canonicalize({ dagId: dag.dagId, fleetId: dag.fleetId, createdTs: dag.createdTs }), "utf8"));
  try {
    dag.dagSignature = signHexDigest(dag.dagHash, getSigningKey(workspace, "artifact-seal"));
  } catch {
    dag.dagSignature = "unsigned";
  }
  saveDag(workspace, dag);
  return dag;
}

export function appendDagNode(
  workspace: string,
  dagId: string,
  params: {
    callerAgentId: string;
    calleeAgentId: string;
    eventType: OrchestrationEventType;
    taskDescription: string;
    contextHash: string;
    startTs: number;
    endTs?: number | null;
    outcome?: string | null;
    parentNodeId?: string | null;
  },
): DagNode {
  const dag = loadDag(workspace, dagId);
  const prevHash = dag.nodes.length > 0 ? dag.nodes[dag.nodes.length - 1]!.nodeHash : dag.dagHash;

  const nodeId = `node_${randomUUID().slice(0, 12)}`;
  const nodeBody = {
    nodeId,
    dagId,
    callerAgentId: params.callerAgentId,
    calleeAgentId: params.calleeAgentId,
    eventType: params.eventType,
    taskDescription: params.taskDescription,
    contextHash: params.contextHash,
    startTs: params.startTs,
    endTs: params.endTs ?? null,
    outcome: params.outcome ?? null,
    parentNodeId: params.parentNodeId ?? null,
    prevHash,
  };

  const nodeHash = sha256Hex(Buffer.from(canonicalize(nodeBody), "utf8"));
  let signature = "unsigned";
  try {
    signature = signHexDigest(nodeHash, getSigningKey(workspace, "artifact-seal"));
  } catch { /* unsigned */ }

  const node: DagNode = dagNodeSchema.parse({
    ...nodeBody,
    nodeHash,
    signature,
  });

  dag.nodes.push(node);
  dag.dagHash = nodeHash;
  try {
    dag.dagSignature = signHexDigest(dag.dagHash, getSigningKey(workspace, "artifact-seal"));
  } catch {
    dag.dagSignature = "unsigned";
  }

  saveDag(workspace, dag);
  return node;
}

// ---------------------------------------------------------------------------
// DAG I/O
// ---------------------------------------------------------------------------

function saveDag(workspace: string, dag: OrchestrationDag): void {
  ensureDir(dagDir(workspace));
  writeFileAtomic(dagFilePath(workspace, dag.dagId), JSON.stringify(dag, null, 2), 0o644);
}

export function loadDag(workspace: string, dagId: string): OrchestrationDag {
  const file = dagFilePath(workspace, dagId);
  if (!pathExists(file)) {
    throw new Error(`DAG not found: ${dagId}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as OrchestrationDag;
}

export function listDags(workspace: string): string[] {
  const dir = dagDir(workspace);
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function queryDagsByAgent(
  workspace: string,
  agentId: string,
  windowMs?: number,
): OrchestrationDag[] {
  const ids = listDags(workspace);
  const now = Date.now();
  const cutoff = windowMs ? now - windowMs : 0;

  return ids
    .map((id) => loadDag(workspace, id))
    .filter((dag) => {
      if (dag.createdTs < cutoff) return false;
      return dag.nodes.some(
        (n) => n.callerAgentId === agentId || n.calleeAgentId === agentId,
      );
    });
}

// ---------------------------------------------------------------------------
// Visualization
// ---------------------------------------------------------------------------

export function visualizeDag(dag: OrchestrationDag): DagVisualization {
  const lines: string[] = [
    `DAG: ${dag.dagId}`,
    `Fleet: ${dag.fleetId}`,
    `Created: ${new Date(dag.createdTs).toISOString()}`,
    `Nodes: ${dag.nodes.length}`,
    "",
  ];

  const callers = new Set<string>();
  const callees = new Set<string>();

  for (const node of dag.nodes) {
    callers.add(node.callerAgentId);
    callees.add(node.calleeAgentId);

    const endStr = node.endTs ? new Date(node.endTs).toISOString() : "ongoing";
    const outcomeStr = node.outcome ?? "pending";
    lines.push(
      `  ${node.callerAgentId} → ${node.calleeAgentId} [${node.eventType}]`,
    );
    lines.push(
      `    Task: ${node.taskDescription}`,
    );
    lines.push(
      `    ${new Date(node.startTs).toISOString()} → ${endStr} | Outcome: ${outcomeStr}`,
    );
  }

  const rootAgents = [...callers].filter((a) => !callees.has(a));
  const leafAgents = [...callees].filter((a) => !callers.has(a));

  return {
    dagId: dag.dagId,
    lines,
    nodeCount: dag.nodes.length,
    rootAgents,
    leafAgents,
  };
}

export function renderDagMarkdown(dag: OrchestrationDag): string {
  const vis = visualizeDag(dag);
  return vis.lines.join("\n");
}
