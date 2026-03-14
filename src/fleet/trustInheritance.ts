/**
 * Trust Inheritance Policy Modes
 *
 * Three modes for how trust propagates in multi-agent systems:
 * - STRICT: no trust inheritance, each agent evaluated independently
 * - WEIGHTED: trust proportional to evidence quality at each link (weighted harmonic mean)
 * - FLOOR: orchestrator trust floored at weakest verified link
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as YAML from "yaml";
import { fleetRoot } from "./paths.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import type { TrustLabel } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustInheritancePolicyMode = "STRICT" | "WEIGHTED" | "FLOOR";

export const trustInheritancePolicySchema = z.object({
  mode: z.enum(["STRICT", "WEIGHTED", "FLOOR"]).default("STRICT"),
  weightDecayFactor: z.number().min(0).max(1).default(0.9),
  minimumFloor: z.number().min(0).max(1).default(0.1),
});

export type TrustInheritancePolicy = z.infer<typeof trustInheritancePolicySchema>;

export interface AgentTrustInput {
  agentId: string;
  integrityIndex: number;
  confidence: number;
  evidenceQuality: number; // 0-1 based on observed/attested ratio
}

export interface InheritedTrustResult {
  mode: TrustInheritancePolicyMode;
  orchestratorId: string;
  ownTrust: number;
  compositeTrust: number;
  workerTrusts: { agentId: string; trust: number; weight: number }[];
  flooredBy: string | null;
  trustLabel: TrustLabel;
}

export interface TrustInheritanceGraphNode {
  agentId: string;
  ownTrust: number; // 0..1
}

export interface TrustInheritanceGraphEdge {
  parentAgentId: string;
  childAgentId: string;
  weight?: number; // Optional delegation attenuation factor, defaults to 1.
}

export interface TrustInheritanceGraphBound {
  parentAgentId: string;
  parentEffectiveTrust: number;
  edgeWeight: number;
  candidateUpperBound: number;
}

export interface TrustInheritanceGraphNodeResult {
  agentId: string;
  ownTrust: number;
  effectiveTrust: number;
  inheritedUpperBound: number;
  boundedBy: string[];
  parentBounds: TrustInheritanceGraphBound[];
  trustLabel: TrustLabel;
}

export interface TrustInheritanceGraphResult {
  nodes: TrustInheritanceGraphNodeResult[];
  roots: string[];
  edges: TrustInheritanceGraphEdge[];
}

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

function policyPath(workspace: string): string {
  return join(fleetRoot(workspace), "trust-inheritance-policy.yaml");
}

export function loadTrustInheritancePolicy(workspace: string): TrustInheritancePolicy {
  const file = policyPath(workspace);
  if (!pathExists(file)) {
    return trustInheritancePolicySchema.parse({});
  }
  const raw = YAML.parse(readFileSync(file, "utf8")) as unknown;
  return trustInheritancePolicySchema.parse(raw);
}

export function saveTrustInheritancePolicy(workspace: string, policy: TrustInheritancePolicy): string {
  ensureDir(fleetRoot(workspace));
  const file = policyPath(workspace);
  writeFileAtomic(file, YAML.stringify(policy), 0o644);
  return file;
}

export function setTrustInheritanceMode(workspace: string, mode: TrustInheritancePolicyMode): TrustInheritancePolicy {
  const policy = loadTrustInheritancePolicy(workspace);
  policy.mode = mode;
  saveTrustInheritancePolicy(workspace, policy);
  return policy;
}

// ---------------------------------------------------------------------------
// Trust computation
// ---------------------------------------------------------------------------

function trustLabelFromIndex(idx: number): TrustLabel {
  if (idx >= 0.7) return "HIGH TRUST";
  if (idx >= 0.4) return "LOW TRUST";
  return "UNRELIABLE — DO NOT USE FOR CLAIMS";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Weighted harmonic mean of trust values.
 */
function weightedHarmonicMean(values: { value: number; weight: number }[]): number {
  const filtered = values.filter((v) => v.value > 0 && v.weight > 0);
  if (filtered.length === 0) return 0;
  const weightSum = filtered.reduce((s, v) => s + v.weight, 0);
  const reciprocalSum = filtered.reduce((s, v) => s + v.weight / v.value, 0);
  if (reciprocalSum === 0) return 0;
  return weightSum / reciprocalSum;
}

export function computeInheritedTrust(
  orchestrator: AgentTrustInput,
  workers: AgentTrustInput[],
  policy: TrustInheritancePolicy,
): InheritedTrustResult {
  const workerTrusts = workers.map((w) => ({
    agentId: w.agentId,
    trust: w.integrityIndex,
    weight: w.evidenceQuality * policy.weightDecayFactor,
  }));

  if (policy.mode === "STRICT") {
    return {
      mode: "STRICT",
      orchestratorId: orchestrator.agentId,
      ownTrust: orchestrator.integrityIndex,
      compositeTrust: orchestrator.integrityIndex,
      workerTrusts,
      flooredBy: null,
      trustLabel: trustLabelFromIndex(orchestrator.integrityIndex),
    };
  }

  if (policy.mode === "FLOOR") {
    const minWorker = workers.length > 0
      ? workers.reduce((min, w) => w.integrityIndex < min.integrityIndex ? w : min, workers[0]!)
      : null;
    const minWorkerTrust = minWorker?.integrityIndex ?? orchestrator.integrityIndex;
    const composite = Math.max(
      Math.min(orchestrator.integrityIndex, minWorkerTrust),
      policy.minimumFloor,
    );
    return {
      mode: "FLOOR",
      orchestratorId: orchestrator.agentId,
      ownTrust: orchestrator.integrityIndex,
      compositeTrust: composite,
      workerTrusts,
      flooredBy: minWorker && minWorkerTrust < orchestrator.integrityIndex ? minWorker.agentId : null,
      trustLabel: trustLabelFromIndex(composite),
    };
  }

  // WEIGHTED: weighted harmonic mean
  const allValues = [
    { value: orchestrator.integrityIndex, weight: 1 },
    ...workerTrusts.map((w) => ({ value: w.trust, weight: w.weight })),
  ];
  const composite = Math.max(weightedHarmonicMean(allValues), policy.minimumFloor);

  return {
    mode: "WEIGHTED",
    orchestratorId: orchestrator.agentId,
    ownTrust: orchestrator.integrityIndex,
    compositeTrust: composite,
    workerTrusts,
    flooredBy: null,
    trustLabel: trustLabelFromIndex(composite),
  };
}

function normalizeEdgeWeight(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return clamp01(value);
}

function normalizeNodeMap(nodes: TrustInheritanceGraphNode[]): Map<string, TrustInheritanceGraphNode> {
  const map = new Map<string, TrustInheritanceGraphNode>();
  for (const node of nodes) {
    if (map.has(node.agentId)) {
      throw new Error(`Duplicate node in trust inheritance graph: ${node.agentId}`);
    }
    map.set(node.agentId, {
      agentId: node.agentId,
      ownTrust: clamp01(node.ownTrust)
    });
  }
  return map;
}

function topologicalOrder(
  nodeMap: Map<string, TrustInheritanceGraphNode>,
  edges: TrustInheritanceGraphEdge[]
): string[] {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodeMap.keys()) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    if (!nodeMap.has(edge.parentAgentId)) {
      throw new Error(`Unknown parent node: ${edge.parentAgentId}`);
    }
    if (!nodeMap.has(edge.childAgentId)) {
      throw new Error(`Unknown child node: ${edge.childAgentId}`);
    }
    outgoing.get(edge.parentAgentId)!.push(edge.childAgentId);
    indegree.set(edge.childAgentId, (indegree.get(edge.childAgentId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const child of outgoing.get(current) ?? []) {
      const nextDegree = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, nextDegree);
      if (nextDegree === 0) {
        queue.push(child);
      }
    }
  }

  if (order.length !== nodeMap.size) {
    throw new Error("Trust inheritance graph contains a cycle.");
  }
  return order;
}

/**
 * Compute inherited trust across a multi-agent orchestration graph.
 * Child effective trust is bounded by every parent's effective trust.
 */
export function computeTrustInheritanceGraph(
  nodes: TrustInheritanceGraphNode[],
  edges: TrustInheritanceGraphEdge[],
  options?: { minimumFloor?: number }
): TrustInheritanceGraphResult {
  const nodeMap = normalizeNodeMap(nodes);
  const order = topologicalOrder(nodeMap, edges);
  const minimumFloor = clamp01(options?.minimumFloor ?? 0);

  const incomingByChild = new Map<string, TrustInheritanceGraphEdge[]>();
  for (const edge of edges) {
    if (!incomingByChild.has(edge.childAgentId)) {
      incomingByChild.set(edge.childAgentId, []);
    }
    incomingByChild.get(edge.childAgentId)!.push(edge);
  }

  const resultByNode = new Map<string, TrustInheritanceGraphNodeResult>();
  const roots: string[] = [];

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const incoming = incomingByChild.get(nodeId) ?? [];

    if (incoming.length === 0) {
      const effectiveTrust = Math.max(node.ownTrust, minimumFloor);
      roots.push(nodeId);
      resultByNode.set(nodeId, {
        agentId: nodeId,
        ownTrust: node.ownTrust,
        effectiveTrust,
        inheritedUpperBound: 1,
        boundedBy: [],
        parentBounds: [],
        trustLabel: trustLabelFromIndex(effectiveTrust)
      });
      continue;
    }

    const parentBounds: TrustInheritanceGraphBound[] = incoming.map((edge) => {
      const parent = resultByNode.get(edge.parentAgentId);
      if (!parent) {
        throw new Error(`Parent trust not available for edge ${edge.parentAgentId} -> ${edge.childAgentId}`);
      }
      const edgeWeight = normalizeEdgeWeight(edge.weight);
      const candidateUpperBound = clamp01(parent.effectiveTrust * edgeWeight);
      return {
        parentAgentId: edge.parentAgentId,
        parentEffectiveTrust: parent.effectiveTrust,
        edgeWeight,
        candidateUpperBound
      };
    });

    const inheritedUpperBound = parentBounds.reduce((min, row) => Math.min(min, row.candidateUpperBound), 1);
    const effectiveTrust = Math.max(Math.min(node.ownTrust, inheritedUpperBound), minimumFloor);
    const boundedBy = parentBounds
      .filter((row) => Math.abs(row.candidateUpperBound - inheritedUpperBound) < 1e-12)
      .map((row) => row.parentAgentId);

    resultByNode.set(nodeId, {
      agentId: nodeId,
      ownTrust: node.ownTrust,
      effectiveTrust,
      inheritedUpperBound,
      boundedBy,
      parentBounds,
      trustLabel: trustLabelFromIndex(effectiveTrust)
    });
  }

  const nodesResult = order.map((id) => resultByNode.get(id)!);
  return {
    nodes: nodesResult,
    roots,
    edges: edges.map((edge) => ({
      parentAgentId: edge.parentAgentId,
      childAgentId: edge.childAgentId,
      weight: normalizeEdgeWeight(edge.weight)
    }))
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderTrustInheritanceMarkdown(result: InheritedTrustResult): string {
  const lines = [
    "# Trust Inheritance Result",
    "",
    `- Mode: ${result.mode}`,
    `- Orchestrator: ${result.orchestratorId}`,
    `- Own Trust: ${result.ownTrust.toFixed(3)}`,
    `- Composite Trust: ${result.compositeTrust.toFixed(3)}`,
    `- Trust Label: ${result.trustLabel}`,
    `- Floored By: ${result.flooredBy ?? "none"}`,
    "",
  ];

  if (result.workerTrusts.length > 0) {
    lines.push("## Worker Trusts");
    lines.push("| Agent | Trust | Weight |");
    lines.push("|---|---:|---:|");
    for (const w of result.workerTrusts) {
      lines.push(`| ${w.agentId} | ${w.trust.toFixed(3)} | ${w.weight.toFixed(3)} |`);
    }
  }

  return lines.join("\n");
}

export function renderTrustInheritanceGraphMarkdown(result: TrustInheritanceGraphResult): string {
  const lines: string[] = [
    "# Trust Inheritance Graph",
    "",
    `- Nodes: ${result.nodes.length}`,
    `- Edges: ${result.edges.length}`,
    `- Roots: ${result.roots.join(", ") || "none"}`,
    "",
    "| Agent | Own Trust | Effective Trust | Upper Bound | Bounded By | Trust Label |",
    "|---|---:|---:|---:|---|---|"
  ];

  for (const row of result.nodes) {
    lines.push(
      `| ${row.agentId} | ${row.ownTrust.toFixed(3)} | ${row.effectiveTrust.toFixed(3)} | ${row.inheritedUpperBound.toFixed(3)} | ${row.boundedBy.join(", ") || "-"} | ${row.trustLabel} |`
    );
  }

  return lines.join("\n");
}
