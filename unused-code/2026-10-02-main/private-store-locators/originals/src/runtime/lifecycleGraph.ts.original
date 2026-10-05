import { join, resolve } from "node:path";
import { artifactSigPath, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  listRuntimeRunEvents,
  loadRuntimeRun,
  runtimeRunEventsDir,
  type RuntimeManagedRun,
  type RuntimeRunEvent
} from "./runManager.js";

export const runtimeLifecycleRequiredNodeKinds = ["plan", "tool", "memory", "handoff", "retry", "finalization"] as const;

export type RuntimeLifecycleRequiredNodeKind = typeof runtimeLifecycleRequiredNodeKinds[number];
export type RuntimeLifecycleNodeKind = RuntimeLifecycleRequiredNodeKind | "state" | "receipt";
export type RuntimeLifecycleEdgeKind =
  | "transition"
  | "plan_transition"
  | "tool_execution"
  | "memory_access"
  | "handoff"
  | "retry"
  | "finalization"
  | "receipt_link";

export interface RuntimeLifecycleGraphSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface RuntimeLifecycleGraphNode {
  nodeId: string;
  kind: RuntimeLifecycleNodeKind;
  label: string;
  timestamp: string;
  agentId: string;
  stage: string | null;
  eventId: string;
  eventType: RuntimeRunEvent["type"];
  source: RuntimeRunEvent["source"];
  receiptId: string | null;
  payloadSha256: string | null;
  eventPath: string | null;
  eventSignaturePath: string | null;
  evidenceRefs: string[];
  nodeHash: string;
}

export interface RuntimeLifecycleGraphEdge {
  edgeId: string;
  kind: RuntimeLifecycleEdgeKind;
  from: string;
  to: string;
  timestamp: string;
  receiptId: string | null;
  evidenceRefs: string[];
  edgeHash: string;
}

export interface RuntimeLifecycleGraphReplay {
  replayable: boolean;
  eventCount: number;
  nodeCount: number;
  edgeCount: number;
  missingNodeKinds: RuntimeLifecycleRequiredNodeKind[];
  replayHash: string;
}

export interface RuntimeLifecycleGraph {
  schemaVersion: "2026-06-25";
  graphId: string;
  runId: string;
  agentId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  source: RuntimeManagedRun["source"];
  status: RuntimeManagedRun["status"];
  createdAt: string;
  exportedAt: string;
  requiredNodeKinds: RuntimeLifecycleRequiredNodeKind[];
  surfaceBinding: ["Fleet", "Watch", "Studio"];
  sourceCitations: RuntimeLifecycleGraphSourceCitation[];
  nodes: RuntimeLifecycleGraphNode[];
  edges: RuntimeLifecycleGraphEdge[];
  replay: RuntimeLifecycleGraphReplay;
  failClosed: boolean;
  failClosedReasons: string[];
  graphHash: string;
  graphPath: string | null;
  signaturePath: string | null;
}

export interface RuntimeLifecycleGraphVerification {
  valid: boolean;
  failClosedReasons: string[];
}

export interface RuntimeLifecycleGraphWriteResult {
  graph: RuntimeLifecycleGraph;
  graphPath: string;
  signaturePath: string | null;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "node";
}

function textFor(event: RuntimeRunEvent): string {
  return `${event.type} ${event.stage ?? ""} ${event.message}`.toLowerCase();
}

function classifyNodeKind(event: RuntimeRunEvent): RuntimeLifecycleNodeKind {
  const text = textFor(event);
  if (event.type === "run.completed") return "finalization";
  if (event.type === "run.resumed" || text.includes("retry")) return "retry";
  if (text.includes("handoff")) return "handoff";
  if (text.includes("memory")) return "memory";
  if (text.includes("tool")) return "tool";
  if (text.includes("plan")) return "plan";
  if (event.type === "receipt.written" || event.links.receiptId) return "receipt";
  return "state";
}

function edgeKindFor(nodeKind: RuntimeLifecycleNodeKind): RuntimeLifecycleEdgeKind {
  if (nodeKind === "plan") return "plan_transition";
  if (nodeKind === "tool") return "tool_execution";
  if (nodeKind === "memory") return "memory_access";
  if (nodeKind === "handoff") return "handoff";
  if (nodeKind === "retry") return "retry";
  if (nodeKind === "finalization") return "finalization";
  if (nodeKind === "receipt") return "receipt_link";
  return "transition";
}

function hashNode(node: Omit<RuntimeLifecycleGraphNode, "nodeHash">): string {
  return sha256Hex(canonicalize(node));
}

function hashEdge(edge: Omit<RuntimeLifecycleGraphEdge, "edgeHash">): string {
  return sha256Hex(canonicalize(edge));
}

function evidenceRefsFor(event: RuntimeRunEvent): string[] {
  return [
    event.links.receiptId,
    event.links.decisionId,
    event.links.policyDecisionId,
    event.links.traceId,
    event.links.candidateId,
    event.links.commitId,
    event.links.rollbackId,
    event.eventPath,
    event.signaturePath
  ].filter((ref): ref is string => Boolean(ref));
}

function buildNode(event: RuntimeRunEvent, index: number): RuntimeLifecycleGraphNode {
  const nodeWithoutHash: Omit<RuntimeLifecycleGraphNode, "nodeHash"> = {
    nodeId: `node-${String(index + 1).padStart(4, "0")}-${safeIdPart(event.eventId)}`,
    kind: classifyNodeKind(event),
    label: event.message || event.type,
    timestamp: event.createdAt,
    agentId: event.agentId,
    stage: event.stage,
    eventId: event.eventId,
    eventType: event.type,
    source: event.source,
    receiptId: event.links.receiptId,
    payloadSha256: event.payloadSha256,
    eventPath: event.eventPath,
    eventSignaturePath: event.signaturePath,
    evidenceRefs: evidenceRefsFor(event)
  };
  return { ...nodeWithoutHash, nodeHash: hashNode(nodeWithoutHash) };
}

function buildEdge(from: RuntimeLifecycleGraphNode, to: RuntimeLifecycleGraphNode): RuntimeLifecycleGraphEdge {
  const edgeWithoutHash: Omit<RuntimeLifecycleGraphEdge, "edgeHash"> = {
    edgeId: `edge-${safeIdPart(from.nodeId)}-to-${safeIdPart(to.nodeId)}`.slice(0, 180),
    kind: edgeKindFor(to.kind),
    from: from.nodeId,
    to: to.nodeId,
    timestamp: to.timestamp,
    receiptId: to.receiptId,
    evidenceRefs: to.evidenceRefs
  };
  return { ...edgeWithoutHash, edgeHash: hashEdge(edgeWithoutHash) };
}

function missingRequiredKinds(nodes: RuntimeLifecycleGraphNode[]): RuntimeLifecycleRequiredNodeKind[] {
  const present = new Set(nodes.map((node) => node.kind));
  return runtimeLifecycleRequiredNodeKinds.filter((kind) => !present.has(kind));
}

function graphDigest(graph: RuntimeLifecycleGraph): string {
  return sha256Hex(canonicalize({
    ...graph,
    graphHash: "",
    graphPath: null,
    signaturePath: null
  }));
}

function replayHashFor(nodes: RuntimeLifecycleGraphNode[], edges: RuntimeLifecycleGraphEdge[]): string {
  return sha256Hex(canonicalize({
    nodes: nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      eventId: node.eventId,
      nodeHash: node.nodeHash
    })),
    edges: edges.map((edge) => ({
      edgeId: edge.edgeId,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      edgeHash: edge.edgeHash
    }))
  }));
}

function collectFailClosedReasons(params: {
  nodes: RuntimeLifecycleGraphNode[];
  edges: RuntimeLifecycleGraphEdge[];
  missingKinds: RuntimeLifecycleRequiredNodeKind[];
}): string[] {
  const reasons: string[] = [];
  for (const kind of params.missingKinds) {
    reasons.push(`runtime-lifecycle-graph:${kind}:missing`);
  }
  if (params.nodes.length === 0 || params.nodes.some((node) => !node.eventPath || !node.eventSignaturePath)) {
    reasons.push("runtime-lifecycle-graph:evidence-chain:missing");
  }
  for (const edge of params.edges) {
    if (!edge.timestamp) {
      reasons.push(`runtime-lifecycle-graph:${edge.edgeId}:timestamp:missing`);
    }
    if ((edge.kind === "tool_execution" || edge.kind === "handoff") && !edge.receiptId) {
      reasons.push(`runtime-lifecycle-graph:${edge.kind}:receipt:missing`);
    }
  }
  return [...new Set(reasons)];
}

export function buildRuntimeLifecycleGraph(input: {
  run: RuntimeManagedRun;
  events: RuntimeRunEvent[];
  sourceCitations?: RuntimeLifecycleGraphSourceCitation[];
  exportedAt?: string;
}): RuntimeLifecycleGraph {
  const events = [...input.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId));
  const nodes = events.map((event, index) => buildNode(event, index));
  const edges = nodes.slice(1).map((node, index) => buildEdge(nodes[index]!, node));
  const missingKinds = missingRequiredKinds(nodes);
  const failClosedReasons = collectFailClosedReasons({ nodes, edges, missingKinds });
  const replay: RuntimeLifecycleGraphReplay = {
    replayable: failClosedReasons.length === 0,
    eventCount: events.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    missingNodeKinds: missingKinds,
    replayHash: replayHashFor(nodes, edges)
  };
  const graphWithoutHash: RuntimeLifecycleGraph = {
    schemaVersion: "2026-06-25",
    graphId: `runtime-lifecycle-${input.run.runId}`,
    runId: input.run.runId,
    agentId: input.run.agentId,
    episodeId: input.run.episodeId,
    lifecycleRunId: input.run.lifecycleRunId,
    source: input.run.source,
    status: input.run.status,
    createdAt: input.run.createdAt,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    requiredNodeKinds: [...runtimeLifecycleRequiredNodeKinds],
    surfaceBinding: ["Fleet", "Watch", "Studio"],
    sourceCitations: input.sourceCitations ?? [],
    nodes,
    edges,
    replay,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons,
    graphHash: "",
    graphPath: null,
    signaturePath: null
  };
  return { ...graphWithoutHash, graphHash: graphDigest(graphWithoutHash) };
}

export function verifyRuntimeLifecycleGraph(graph: RuntimeLifecycleGraph): RuntimeLifecycleGraphVerification {
  const missingKinds = missingRequiredKinds(graph.nodes);
  const reasons = collectFailClosedReasons({ nodes: graph.nodes, edges: graph.edges, missingKinds });
  const expectedGraphHash = graphDigest(graph);
  if (graph.graphHash !== expectedGraphHash) {
    reasons.push("runtime-lifecycle-graph:graph-hash:mismatch");
  }
  if (graph.failClosed && reasons.length === 0) {
    reasons.push("runtime-lifecycle-graph:fail-closed:mismatch");
  }
  if (!graph.failClosed && reasons.length > 0) {
    reasons.push("runtime-lifecycle-graph:fail-open:invalid");
  }
  const unique = [...new Set(reasons)];
  return { valid: unique.length === 0 && !graph.failClosed, failClosedReasons: unique };
}

export function runtimeLifecycleGraphPath(workspace: string, agentId: string, runId: string): string {
  return join(runtimeRunEventsDir(resolve(workspace), agentId, runId), "..", "lifecycle-graph.json");
}

export function writeRuntimeLifecycleGraph(input: {
  workspace: string;
  runId: string;
  agentId?: string | null;
  sourceCitations?: RuntimeLifecycleGraphSourceCitation[];
}): RuntimeLifecycleGraphWriteResult {
  const workspace = resolve(input.workspace);
  const run = loadRuntimeRun({ workspace, runId: input.runId, agentId: input.agentId });
  const events = listRuntimeRunEvents({ workspace, runId: run.runId, agentId: run.agentId, limit: Number.POSITIVE_INFINITY, redacted: false });
  const graph = buildRuntimeLifecycleGraph({ run, events, sourceCitations: input.sourceCitations });
  const graphPath = runtimeLifecycleGraphPath(workspace, run.agentId, run.runId);
  const signaturePath = artifactSigPath(graphPath);
  const writableGraph: RuntimeLifecycleGraph = { ...graph, graphPath, signaturePath };
  writeFileAtomic(graphPath, `${JSON.stringify(writableGraph, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path: graphPath, artifactKind: "runtime-lifecycle-graph" });
  return { graph: writableGraph, graphPath, signaturePath: signed?.sigPath ?? null };
}

export function renderRuntimeLifecycleGraphAuditExport(graph: RuntimeLifecycleGraph): string {
  const verification = verifyRuntimeLifecycleGraph(graph);
  const status = verification.valid ? "REPLAYABLE" : "FAIL_CLOSED";
  const lines = [
    "# AMC Runtime Lifecycle Graph Export",
    "",
    `- Run: ${graph.runId}`,
    `- Agent: ${graph.agentId}`,
    `- Status: ${status}`,
    `- Surfaces: ${graph.surfaceBinding.join(", ")}`,
    `- Required path: plan/tool/memory/handoff/retry/finalization`,
    `- Nodes: ${graph.nodes.length}`,
    `- Edges: ${graph.edges.length}`,
    `- Replay hash: ${graph.replay.replayHash}`,
    `- Graph hash: ${graph.graphHash}`,
    "",
    "## Nodes",
    ...graph.nodes.map((node) => `- ${node.nodeId} [${node.kind}] ${node.timestamp} receipt=${node.receiptId ?? "none"} signature=${node.eventSignaturePath ? "present" : "missing"}`),
    "",
    "## Edges",
    ...graph.edges.map((edge) => `- ${edge.edgeId} [${edge.kind}] ${edge.from} -> ${edge.to} at ${edge.timestamp} receipt=${edge.receiptId ?? "none"}`),
    "",
    "## Verification",
    verification.valid ? "- VALID" : `- FAIL_CLOSED: ${verification.failClosedReasons.join("; ")}`
  ];
  return `${lines.join("\n")}\n`;
}
