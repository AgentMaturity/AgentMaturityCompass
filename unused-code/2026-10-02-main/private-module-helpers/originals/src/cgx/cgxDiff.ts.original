/**
 * CGX Graph Diff — compare two CGX snapshots.
 *
 * Shows added/removed/modified nodes and edges, highlights confidence changes.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { cgxGraphSchema, type CgxGraph, type CgxEdge, type CgxNode } from "./cgxSchema.js";
import { cgxSnapshotGraphDir } from "./cgxStore.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeDiff {
  nodeId: string;
  label: string;
  type: string;
  change: "added" | "removed" | "modified";
  oldHash?: string;
  newHash?: string;
}

export interface EdgeDiff {
  edgeId: string;
  type: string;
  from: string;
  to: string;
  change: "added" | "removed" | "modified";
  confidenceChange?: number;
  oldConfidence?: number;
  newConfidence?: number;
}

export interface GraphDiffReport {
  runA: string;
  runB: string;
  generatedTs: number;
  nodes: {
    added: NodeDiff[];
    removed: NodeDiff[];
    modified: NodeDiff[];
  };
  edges: {
    added: EdgeDiff[];
    removed: EdgeDiff[];
    modified: EdgeDiff[];
  };
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
    avgConfidenceChange: number;
  };
}

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

function loadSnapshotById(
  workspace: string,
  scopeType: "workspace" | "agent",
  scopeId: string,
  snapshotId: string,
): CgxGraph | null {
  const scope = scopeType === "workspace"
    ? { type: "workspace" as const, id: "workspace" }
    : { type: "agent" as const, id: scopeId };
  const dir = cgxSnapshotGraphDir(workspace, scope);
  if (!pathExists(dir)) return null;

  // snapshotId can be a timestamp or a file prefix
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  // Try exact match
  const exact = files.find((f) => f === `${snapshotId}.json` || f.startsWith(snapshotId));
  if (exact) {
    try {
      return cgxGraphSchema.parse(JSON.parse(readUtf8(join(dir, exact))) as unknown);
    } catch {
      return null;
    }
  }

  // Try by index: "latest", "first", or numeric index
  if (snapshotId === "latest" && files.length > 0) {
    try {
      return cgxGraphSchema.parse(JSON.parse(readUtf8(join(dir, files[files.length - 1]!))) as unknown);
    } catch {
      return null;
    }
  }
  if (snapshotId === "first" && files.length > 0) {
    try {
      return cgxGraphSchema.parse(JSON.parse(readUtf8(join(dir, files[0]!))) as unknown);
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

export function diffGraphSnapshots(
  graphA: CgxGraph,
  graphB: CgxGraph,
  runA: string,
  runB: string,
): GraphDiffReport {
  const nodesA = new Map<string, CgxNode>(graphA.nodes.map((n) => [n.id, n]));
  const nodesB = new Map<string, CgxNode>(graphB.nodes.map((n) => [n.id, n]));
  const edgesA = new Map<string, CgxEdge>(graphA.edges.map((e) => [e.id, e]));
  const edgesB = new Map<string, CgxEdge>(graphB.edges.map((e) => [e.id, e]));

  const addedNodes: NodeDiff[] = [];
  const removedNodes: NodeDiff[] = [];
  const modifiedNodes: NodeDiff[] = [];

  for (const [id, node] of nodesB) {
    const old = nodesA.get(id);
    if (!old) {
      addedNodes.push({ nodeId: id, label: node.label, type: node.type, change: "added", newHash: node.hash });
    } else if (old.hash !== node.hash) {
      modifiedNodes.push({ nodeId: id, label: node.label, type: node.type, change: "modified", oldHash: old.hash, newHash: node.hash });
    }
  }
  for (const [id, node] of nodesA) {
    if (!nodesB.has(id)) {
      removedNodes.push({ nodeId: id, label: node.label, type: node.type, change: "removed", oldHash: node.hash });
    }
  }

  const addedEdges: EdgeDiff[] = [];
  const removedEdges: EdgeDiff[] = [];
  const modifiedEdges: EdgeDiff[] = [];

  for (const [id, edge] of edgesB) {
    const old = edgesA.get(id);
    if (!old) {
      addedEdges.push({ edgeId: id, type: edge.type, from: edge.from, to: edge.to, change: "added", newConfidence: edge.confidence });
    } else if (old.hash !== edge.hash) {
      const confChange = (edge.confidence ?? 1) - (old.confidence ?? 1);
      modifiedEdges.push({
        edgeId: id, type: edge.type, from: edge.from, to: edge.to, change: "modified",
        oldConfidence: old.confidence, newConfidence: edge.confidence,
        confidenceChange: Number(confChange.toFixed(4)),
      });
    }
  }
  for (const [id, edge] of edgesA) {
    if (!edgesB.has(id)) {
      removedEdges.push({ edgeId: id, type: edge.type, from: edge.from, to: edge.to, change: "removed", oldConfidence: edge.confidence });
    }
  }

  const allConfChanges = modifiedEdges
    .filter((e) => e.confidenceChange !== undefined)
    .map((e) => e.confidenceChange!);
  const avgConfChange = allConfChanges.length > 0
    ? allConfChanges.reduce((s, v) => s + v, 0) / allConfChanges.length
    : 0;

  return {
    runA,
    runB,
    generatedTs: Date.now(),
    nodes: { added: addedNodes, removed: removedNodes, modified: modifiedNodes },
    edges: { added: addedEdges, removed: removedEdges, modified: modifiedEdges },
    summary: {
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesModified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
      edgesModified: modifiedEdges.length,
      avgConfidenceChange: Number(avgConfChange.toFixed(4)),
    },
  };
}

export function loadAndDiffSnapshots(params: {
  workspace: string;
  scopeType: "workspace" | "agent";
  scopeId: string;
  runA: string;
  runB: string;
}): GraphDiffReport {
  const graphA = loadSnapshotById(params.workspace, params.scopeType, params.scopeId, params.runA);
  const graphB = loadSnapshotById(params.workspace, params.scopeType, params.scopeId, params.runB);
  if (!graphA) throw new Error(`Snapshot not found: ${params.runA}`);
  if (!graphB) throw new Error(`Snapshot not found: ${params.runB}`);
  return diffGraphSnapshots(graphA, graphB, params.runA, params.runB);
}

export function renderGraphDiffMarkdown(diff: GraphDiffReport): string {
  const lines: string[] = [
    "# CGX Graph Diff Report",
    "",
    `- Run A: ${diff.runA}`,
    `- Run B: ${diff.runB}`,
    `- Generated: ${new Date(diff.generatedTs).toISOString()}`,
    "",
    "## Summary",
    "",
    `- Nodes: +${diff.summary.nodesAdded} / -${diff.summary.nodesRemoved} / ~${diff.summary.nodesModified}`,
    `- Edges: +${diff.summary.edgesAdded} / -${diff.summary.edgesRemoved} / ~${diff.summary.edgesModified}`,
    `- Avg confidence change: ${diff.summary.avgConfidenceChange >= 0 ? "+" : ""}${diff.summary.avgConfidenceChange}`,
    "",
  ];

  if (diff.nodes.added.length > 0) {
    lines.push("## Nodes Added");
    for (const n of diff.nodes.added.slice(0, 20)) {
      lines.push(`- ${n.nodeId} (${n.type}): ${n.label}`);
    }
    lines.push("");
  }

  if (diff.nodes.removed.length > 0) {
    lines.push("## Nodes Removed");
    for (const n of diff.nodes.removed.slice(0, 20)) {
      lines.push(`- ${n.nodeId} (${n.type}): ${n.label}`);
    }
    lines.push("");
  }

  if (diff.nodes.modified.length > 0) {
    lines.push("## Nodes Modified");
    for (const n of diff.nodes.modified.slice(0, 20)) {
      lines.push(`- ${n.nodeId} (${n.type}): ${n.label}`);
    }
    lines.push("");
  }

  if (diff.edges.modified.length > 0) {
    lines.push("## Edge Confidence Changes");
    lines.push("| Edge | Type | Old | New | Δ |");
    lines.push("|---|---|---:|---:|---:|");
    for (const e of diff.edges.modified.slice(0, 20)) {
      lines.push(
        `| ${e.edgeId.slice(0, 30)} | ${e.type} | ${(e.oldConfidence ?? 1).toFixed(2)} | ${(e.newConfidence ?? 1).toFixed(2)} | ${e.confidenceChange?.toFixed(3) ?? "—"} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
