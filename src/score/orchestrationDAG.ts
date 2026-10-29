import type { EvidenceOutcome } from "../types.js";

export interface DAGNode {
  agentId: string;
  role: 'orchestrator' | 'worker' | 'monitor' | 'reviewer';
  inputs: string[];
  outputs: string[];
  trustLevel: 'high' | 'medium' | 'low' | 'untrusted';
}

export interface OrchestrationDAG {
  nodes: DAGNode[];
  edges: { from: string; to: string; dataType: string }[];
  hasHumanCheckpoints: boolean;
  hasCycles: boolean;
  maxDepth: number;
  trustBoundaries: number;
}

export function captureDAG(nodes: DAGNode[]): OrchestrationDAG {
  const edges: { from: string; to: string; dataType: string }[] = [];
  for (const node of nodes) {
    for (const out of node.outputs) {
      edges.push({ from: node.agentId, to: out, dataType: 'task' });
    }
  }
  const hasCycles = detectCycles(nodes);
  const maxDepth = computeMaxDepth(nodes);
  let trustBoundaries = 0;
  for (const edge of edges) {
    const fromNode = nodes.find(n => n.agentId === edge.from);
    const toNode = nodes.find(n => n.agentId === edge.to);
    if (fromNode && toNode && fromNode.trustLevel !== toNode.trustLevel) trustBoundaries++;
  }
  const hasHumanCheckpoints = nodes.some(n => n.role === 'reviewer');
  return { nodes, edges, hasHumanCheckpoints, hasCycles, maxDepth, trustBoundaries };
}

function detectCycles(nodes: DAGNode[]): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    const node = nodes.find(n => n.agentId === id);
    if (node) {
      for (const out of node.outputs) {
        if (dfs(out)) return true;
      }
    }
    stack.delete(id);
    return false;
  }

  for (const node of nodes) {
    if (dfs(node.agentId)) return true;
  }
  return false;
}

function computeMaxDepth(nodes: DAGNode[]): number {
  const memo = new Map<string, number>();

  function depth(id: string, seen: Set<string>): number {
    if (seen.has(id)) return 0;
    if (memo.has(id)) return memo.get(id)!;
    seen.add(id);
    const node = nodes.find(n => n.agentId === id);
    let max = 0;
    if (node) {
      for (const out of node.outputs) {
        max = Math.max(max, depth(out, seen));
      }
    }
    seen.delete(id);
    const d = 1 + max;
    memo.set(id, d);
    return d;
  }

  let maxD = 0;
  for (const node of nodes) {
    maxD = Math.max(maxD, depth(node.agentId, new Set()));
  }
  return maxD;
}

export function scoreDAGGovernance(dag: OrchestrationDAG): {
  outcome: EvidenceOutcome;
  score: number | null;
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | null;
  risks: string[];
  recommendations: string[];
} {
  if (dag.nodes.length === 0) {
    return {
      outcome: "not_evaluated", score: null, level: null,
      risks: ["No orchestration nodes to evaluate"], recommendations: [],
    };
  }
  let score = 100;
  const risks: string[] = [];
  const recommendations: string[] = [];

  if (dag.hasCycles) {
    score -= 30;
    risks.push('DAG contains cycles — risk of infinite loops');
    recommendations.push('Remove cycles or add cycle breakers');
  }
  if (!dag.hasHumanCheckpoints) {
    score -= 20;
    risks.push('No human checkpoints in orchestration');
    recommendations.push('Add human reviewer nodes at trust boundaries');
  }
  if (dag.trustBoundaries > 3) {
    score -= 10 * (dag.trustBoundaries - 3);
    risks.push(`${dag.trustBoundaries} trust boundary crossings`);
    recommendations.push('Reduce trust boundary crossings or add verification at each');
  }
  if (dag.maxDepth > 5) {
    score -= 10;
    risks.push('Deep orchestration chain increases latency and failure risk');
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 90 ? 'L5' : score >= 70 ? 'L4' : score >= 50 ? 'L3' : score >= 30 ? 'L2' : 'L1';
  return { outcome: "measured", score, level, risks, recommendations };
}
