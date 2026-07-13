/**
 * CGX Impact Propagation Simulator
 *
 * Walks REQUIRES/DEPENDS_ON/ENABLES edges from a changed node and calculates
 * impact scores based on edge confidence and path length.
 */

import type { CgxGraph, CgxEdge } from "./cgxSchema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpactNode {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  impactScore: number;
  pathLength: number;
  pathEdgeTypes: string[];
  path: string[];
}

export interface SimulationResult {
  changeNodeId: string;
  changeNodeLabel: string;
  affectedNodes: ImpactNode[];
  blastRadius: number;
  totalImpactScore: number;
}

// ---------------------------------------------------------------------------
// Edge type weights for propagation
// ---------------------------------------------------------------------------

const PROPAGATION_EDGE_TYPES = new Set([
  "REQUIRES",
  "DEPENDS_ON",
  "ENABLES",
  "GOVERNED_BY",
  "CONSTRAINED_BY",
  "PROVIDES",
  "USES",
  "OWNS",
  "BLOCKS",
]);

const EDGE_WEIGHT: Record<string, number> = {
  REQUIRES: 0.9,
  DEPENDS_ON: 0.8,
  ENABLES: 0.7,
  BLOCKS: 0.85,
  GOVERNED_BY: 0.5,
  CONSTRAINED_BY: 0.5,
  PROVIDES: 0.8,
  USES: 0.4,
  OWNS: 0.3,
};

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function simulateImpact(
  graph: CgxGraph,
  changeNodeId: string,
  options?: {
    maxDepth?: number;
    minImpact?: number;
  },
): SimulationResult {
  const maxDepth = options?.maxDepth ?? 6;
  const minImpact = options?.minImpact ?? 0.01;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const changeNode = nodeMap.get(changeNodeId);
  if (!changeNode) {
    return {
      changeNodeId,
      changeNodeLabel: changeNodeId,
      affectedNodes: [],
      blastRadius: 0,
      totalImpactScore: 0,
    };
  }

  // Build adjacency: for each node, edges where it's `from` or `to` (reverse propagation)
  const forwardEdges = new Map<string, CgxEdge[]>();
  const reverseEdges = new Map<string, CgxEdge[]>();
  for (const edge of graph.edges) {
    if (!PROPAGATION_EDGE_TYPES.has(edge.type)) continue;
    if (!forwardEdges.has(edge.from)) forwardEdges.set(edge.from, []);
    forwardEdges.get(edge.from)!.push(edge);
    if (!reverseEdges.has(edge.to)) reverseEdges.set(edge.to, []);
    reverseEdges.get(edge.to)!.push(edge);
  }

  // BFS from changeNode — propagate forward (things that depend on this node)
  // and reverse (things this node depends on get impacted differently)
  const bestScore = new Map<string, ImpactNode>();

  interface QueueItem {
    nodeId: string;
    score: number;
    depth: number;
    edgeTypes: string[];
    path: string[];
  }

  const queue: QueueItem[] = [
    { nodeId: changeNodeId, score: 1.0, depth: 0, edgeTypes: [], path: [changeNodeId] },
  ];
  const visited = new Set<string>([changeNodeId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    // Forward: nodes that have edges FROM changeNode (direct dependents)
    const fwd = forwardEdges.get(current.nodeId) ?? [];
    // Reverse: nodes that have edges TO changeNode (reverse: things depending on changed node)
    const rev = reverseEdges.get(current.nodeId) ?? [];

    for (const edge of [...fwd, ...rev]) {
      const targetId = edge.from === current.nodeId ? edge.to : edge.from;
      if (visited.has(targetId)) continue;
      visited.add(targetId);

      const weight = EDGE_WEIGHT[edge.type] ?? 0.3;
      const edgeConfidence = edge.confidence ?? 1.0;
      const depthDecay = 1.0 / (current.depth + 2);
      const propagatedScore = current.score * weight * edgeConfidence * depthDecay;

      if (propagatedScore < minImpact) continue;

      const targetNode = nodeMap.get(targetId);
      const impactNode: ImpactNode = {
        nodeId: targetId,
        nodeLabel: targetNode?.label ?? targetId,
        nodeType: targetNode?.type ?? "unknown",
        impactScore: Number(propagatedScore.toFixed(4)),
        pathLength: current.depth + 1,
        pathEdgeTypes: [...current.edgeTypes, edge.type],
        path: [...current.path, targetId],
      };

      const existing = bestScore.get(targetId);
      if (!existing || impactNode.impactScore > existing.impactScore) {
        bestScore.set(targetId, impactNode);
      }

      queue.push({
        nodeId: targetId,
        score: propagatedScore,
        depth: current.depth + 1,
        edgeTypes: impactNode.pathEdgeTypes,
        path: impactNode.path,
      });
    }
  }

  const affectedNodes = Array.from(bestScore.values()).sort(
    (a, b) => b.impactScore - a.impactScore,
  );

  const totalNodes = graph.nodes.length;
  const blastRadius = totalNodes > 1 ? affectedNodes.length / (totalNodes - 1) : 0;
  const totalImpactScore = affectedNodes.reduce((sum, n) => sum + n.impactScore, 0);

  return {
    changeNodeId,
    changeNodeLabel: changeNode.label,
    affectedNodes,
    blastRadius: Number(blastRadius.toFixed(4)),
    totalImpactScore: Number(totalImpactScore.toFixed(4)),
  };
}

export function renderSimulationMarkdown(result: SimulationResult): string {
  const lines: string[] = [
    "# CGX Impact Propagation Simulation",
    "",
    `- Changed node: ${result.changeNodeId} (${result.changeNodeLabel})`,
    `- Blast radius: ${(result.blastRadius * 100).toFixed(1)}%`,
    `- Total impact score: ${result.totalImpactScore}`,
    `- Affected nodes: ${result.affectedNodes.length}`,
    "",
  ];

  if (result.affectedNodes.length > 0) {
    lines.push("## Affected Nodes (by impact)");
    lines.push("");
    lines.push("| Node | Type | Impact | Hops | Edge Path |");
    lines.push("|---|---|---:|---:|---|");
    for (const n of result.affectedNodes.slice(0, 30)) {
      const label = n.nodeLabel.length > 30 ? `${n.nodeLabel.slice(0, 27)}...` : n.nodeLabel;
      lines.push(
        `| ${label} | ${n.nodeType} | ${n.impactScore.toFixed(3)} | ${n.pathLength} | ${n.pathEdgeTypes.join("→")} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
