import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { buildEnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import {
  loadLatestTypedMultiAgentGraph,
  typedMultiAgentGraphDigest,
  validateTypedMultiAgentGraph,
  writeTypedMultiAgentGraph,
  type TypedMultiAgentGraph
} from "../src/fleet/typedGraph.js";
import { buildFleetLifecycleRunArtifact, detectFleetCascadeFailures } from "../src/fleet/fleetLifecycle.js";
import { renderFleetScoringMarkdown, type FleetScoringResult } from "../src/fleet/fleetScoring.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-typed-graph-"));
  roots.push(dir);
  return dir;
}

function validGraph(): TypedMultiAgentGraph {
  return {
    schemaVersion: "2026-05-22",
    graphId: "support-graph",
    fleetId: "default",
    createdAt: "2026-05-22T12:00:00.000Z",
    maxFanOut: 3,
    nodes: [
      {
        nodeId: "orchestrator",
        agentId: "orchestrator",
        nodeType: "agent",
        role: "orchestrator",
        description: "Routes support work to specialist agents.",
        inputs: [{ name: "customer_request", schema: "SupportRequest" }],
        outputs: [{ name: "triage_ticket", schema: "TriageTicket" }],
        tools: [{ toolId: "ticket-router", permission: "WRITE_LOW", policyRefs: ["policy:ticket-routing"] }],
        memoryScopes: ["case-summary"],
        policyRefs: ["policy:ticket-routing"],
        permissions: ["READ_ONLY", "WRITE_LOW"]
      },
      {
        nodeId: "specialist",
        agentId: "specialist",
        nodeType: "agent",
        role: "specialist",
        description: "Resolves routed tickets.",
        inputs: [{ name: "triage_ticket", schema: "TriageTicket" }],
        outputs: [{ name: "resolution", schema: "Resolution" }],
        tools: [{ toolId: "kb-search", permission: "READ_ONLY", policyRefs: ["policy:kb"] }],
        memoryScopes: ["case-summary"],
        policyRefs: ["policy:kb"],
        permissions: ["READ_ONLY"]
      }
    ],
    edges: [
      {
        edgeId: "handoff-orchestrator-specialist",
        from: "orchestrator",
        to: "specialist",
        edgeType: "handoff",
        purpose: "Route validated support ticket.",
        contract: {
          inputSchema: "TriageTicket",
          outputSchema: "Resolution",
          requiredEvidence: ["signed-handoff"],
          approvalRequired: false
        },
        permissions: ["READ_ONLY"],
        failurePropagation: "degrade"
      }
    ],
    invariants: [
      {
        invariantId: "signed-handoffs",
        description: "Every handoff must carry signed evidence.",
        severity: "high",
        requiredEvidence: ["signed-handoff"]
      }
    ]
  };
}

function fleetResult(): FleetScoringResult {
  return {
    runId: "fleet-run-graph",
    ts: Date.UTC(2026, 4, 22, 12, 1, 0),
    window: "7d",
    agentCount: 2,
    agents: [],
    failures: [],
    aggregate: {
      fleetMeanScore: 0,
      fleetMedianScore: 0,
      fleetMinScore: 0,
      fleetMaxScore: 0,
      fleetStdDev: 0,
      layerAverages: {},
      layerWorst: {}
    },
    weakLinks: [],
    cascadeFailures: [],
    pairComparisons: [],
    diagnosticReports: [],
    progressEvents: [],
    fleetLifecycle: null,
    reportSha256: "0".repeat(64)
  };
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  const req = Readable.from(stream) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    }
  } as unknown as ServerResponse;
  return { res, state };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("typed multi-agent graph", () => {
  test("validates, digests, writes, and loads a valid graph", () => {
    const ws = workspace();
    const graph = validGraph();
    const validation = validateTypedMultiAgentGraph(graph);
    const digest = typedMultiAgentGraphDigest(graph);
    const written = writeTypedMultiAgentGraph({ workspace: ws, graph });
    const loaded = loadLatestTypedMultiAgentGraph(ws);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
    expect(digest).toHaveLength(64);
    expect(existsSync(written.graphPath)).toBe(true);
    expect(existsSync(written.latestPath)).toBe(true);
    expect(written.ref.digestSha256).toBe(digest);
    expect(loaded?.graphId).toBe(graph.graphId);
  });

  test("returns actionable validation errors for unsafe graph shapes", () => {
    const graph = validGraph();
    graph.nodes[0]!.permissions = ["READ_ONLY", "WRITE_HIGH", "DATA_EXPORT"];
    graph.nodes[0]!.policyRefs = [];
    graph.maxFanOut = 1;
    graph.edges.push(
      {
        edgeId: "missing-node",
        from: "orchestrator",
        to: "ghost",
        edgeType: "handoff",
        purpose: "Invalid missing node.",
        contract: null,
        permissions: ["WRITE_HIGH"],
        failurePropagation: "cascade"
      },
      {
        edgeId: "cycle",
        from: "specialist",
        to: "orchestrator",
        edgeType: "delegation",
        purpose: "Creates cycle.",
        contract: {
          inputSchema: "Resolution",
          outputSchema: "TriageTicket",
          requiredEvidence: [],
          approvalRequired: false
        },
        permissions: ["READ_ONLY"],
        failurePropagation: "cascade"
      }
    );

    const validation = validateTypedMultiAgentGraph(graph);
    const codes = validation.issues.map((issue) => issue.code);

    expect(validation.valid).toBe(false);
    expect(codes).toContain("unsafe_permission_without_policy");
    expect(codes).toContain("missing_node");
    expect(codes).toContain("missing_handoff_contract");
    expect(codes).toContain("cycle_detected");
    expect(codes).toContain("unbounded_fanout");
    expect(validation.issueCount).toBeGreaterThanOrEqual(5);
    expect(validation.summary).toContain("issue");
  });

  test("attaches graph digest to resource manifests and fleet lifecycle evidence", () => {
    const ws = workspace();
    const written = writeTypedMultiAgentGraph({ workspace: ws, graph: validGraph() });
    const manifest = buildEnforceResourceManifest({ workspace: ws, agentId: "default" });
    const graphResource = manifest.resources.find((resource) => resource.id === "graph:.amc/fleet/typed-graphs/latest.json");
    const lifecycle = buildFleetLifecycleRunArtifact({ workspace: ws, result: fleetResult() });

    expect(graphResource?.digest).toBe(written.ref.digestSha256);
    expect(graphResource?.schema).toBe("typed-multi-agent-graph.json");
    expect(lifecycle.typedGraph?.digestSha256).toBe(written.ref.digestSha256);
    expect(lifecycle.typedGraph?.validation.valid).toBe(true);
  });

  test("projects graph validation findings into fleet score risks", () => {
    const ws = workspace();
    const graph = validGraph();
    graph.nodes[0]!.permissions = ["READ_ONLY", "DATA_EXPORT"];
    graph.nodes[0]!.policyRefs = [];
    const written = writeTypedMultiAgentGraph({ workspace: ws, graph });
    const result = fleetResult();
    result.typedGraph = written.ref;
    result.graphRisks = written.ref.validation.issues;
    result.cascadeFailures = detectFleetCascadeFailures(result);
    const markdown = renderFleetScoringMarkdown(result);

    expect(result.graphRisks.map((risk) => risk.code)).toContain("unsafe_permission_without_policy");
    expect(result.cascadeFailures.some((failure) => failure.type === "graph_validation_risk")).toBe(true);
    expect(markdown).toContain("Typed Multi-Agent Graph");
    expect(markdown).toContain("unsafe_permission_without_policy");
  });

  test("exposes graph inspection and validation through fleet API", async () => {
    const ws = workspace();
    const graph = validGraph();
    const createReq = mockReq("POST", "/api/v1/fleet/graph", { graph });
    const createRes = mockRes();
    const created = await handleApiRoute("/api/v1/fleet/graph", "POST", createReq, createRes.res, ws);
    expect(created).toBe(true);
    expect(createRes.state.statusCode).toBe(201);

    const inspectRes = mockRes();
    await handleApiRoute("/api/v1/fleet/graph", "GET", mockReq("GET", "/api/v1/fleet/graph"), inspectRes.res, ws);
    const inspected = JSON.parse(inspectRes.state.body) as { ok: boolean; data: { ref: { graphId: string } } };
    expect(inspected.data.ref.graphId).toBe(graph.graphId);

    const validateRes = mockRes();
    await handleApiRoute("/api/v1/fleet/graph/validate", "GET", mockReq("GET", "/api/v1/fleet/graph/validate"), validateRes.res, ws);
    const validated = JSON.parse(validateRes.state.body) as { ok: boolean; data: { validation: { valid: boolean } } };
    expect(validated.data.validation.valid).toBe(true);
  });
});
