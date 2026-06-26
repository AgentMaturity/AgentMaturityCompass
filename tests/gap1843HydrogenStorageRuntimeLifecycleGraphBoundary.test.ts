import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendRuntimeRunEvent,
  completeRuntimeRun,
  createRuntimeRun,
  resumeRuntimeRun
} from "../src/runtime/runManager.js";
import {
  buildRuntimeLifecycleGraph,
  renderRuntimeLifecycleGraphAuditExport,
  verifyRuntimeLifecycleGraph,
  writeRuntimeLifecycleGraph,
  type RuntimeLifecycleGraphSourceCitation
} from "../src/runtime/lifecycleGraph.js";

const DOC = "docs/source-reviews/GAP-1843-hydrogen-storage-runtime-lifecycle-graph.md";
const OPENALEX = "https://openalex.org/W4414991289";
const DOI = "https://doi.org/10.1039/d5sc09921h";
const RSC = "https://pubs.rsc.org/en/content/articlelanding/2026/sc/d5sc09921h";
const TITLE = "\"DIVE\" into hydrogen storage materials discovery with AI agents";
const IDENTIFIER = "hydrogen_storage_runtime_lifecycle_graph";
const IMPLEMENTATION_FILES = [
  "src/runtime/lifecycleGraph.ts",
  "src/runtime/runManager.ts",
  "src/lifecycle/artifactSignature.ts",
  "src/fleet/fleetLifecycle.ts"
];

const sourceCitations: RuntimeLifecycleGraphSourceCitation[] = [
  {
    sourceId: "openalex-w4414991289",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:36:35.000Z"
  },
  {
    sourceId: "doi-10-1039-d5sc09921h",
    title: "RSC DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T08:36:35.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1843-runtime-graph-"));
  roots.push(dir);
  return dir;
}

function populateMaterialsDiscoveryRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "fleet",
    stage: "materials.discovery.created",
    episodeId: "episode-hydrogen-storage-1",
    lifecycleRunId: "lifecycle-hydrogen-storage-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "studio",
    type: "stage.changed",
    stage: "plan.created",
    message: "Materials discovery plan created.",
    links: { receiptId: "receipt-materials-plan" },
    payload: { planId: "materials-plan-1", literatureScopeHash: "d".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "sdk",
    type: "trace.received",
    stage: "tool.knowledge-extraction",
    message: "Knowledge-extraction tool call recorded.",
    links: { receiptId: "receipt-materials-tool", traceId: "trace-materials-tool" },
    payload: { toolId: "knowledge-extraction", figureBatchHash: "e".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "sdk",
    type: "trace.received",
    stage: "memory.write",
    message: "Structured materials evidence memory write recorded.",
    links: { receiptId: "receipt-materials-memory", traceId: "trace-materials-memory" },
    payload: { memoryRef: "memory-materials-evidence-chain" }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "fleet",
    type: "stage.changed",
    stage: "handoff.lab-review",
    message: "Handoff to lab review agent.",
    links: { receiptId: "receipt-materials-handoff", decisionId: "lab-review-handoff" },
    payload: { toAgentId: "lab-review-agent" }
  });
  resumeRuntimeRun({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    source: "watch",
    stage: "retry.data-extraction",
    message: "Retrying after incomplete experimental data extraction."
  });
  completeRuntimeRun({
    workspace: ws,
    runId: "runtime-hydrogen-storage-1",
    agentId: "materials-discovery-agent",
    reason: "Materials discovery run finalized."
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1843 hydrogen storage materials runtime graph boundary", () => {
  it("documents the live DIVE source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1843");
    expect(doc).toContain("Signed runtime lifecycle graph");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(RSC);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Royal Society of Chemistry");
    expect(doc).toContain("Chemical Science");
    expect(doc).toContain("multi-agent workflow");
    expect(doc).toContain("hydrogen storage");
    expect(doc).toContain("materials discovery");
    expect(doc).toContain("knowledge extraction");
    expect(doc).toContain("inverse design");
    expect(doc).toContain("plan, tool, memory, handoff, retry, and finalization");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No materials science subsystem");
  });

  it("reuses the generic signed runtime lifecycle graph for materials discovery runs", () => {
    const ws = workspace();
    populateMaterialsDiscoveryRun(ws);

    const written = writeRuntimeLifecycleGraph({
      workspace: ws,
      runId: "runtime-hydrogen-storage-1",
      agentId: "materials-discovery-agent",
      sourceCitations
    });

    expect(written.graph.failClosed).toBe(false);
    expect(written.graph.replay.replayable).toBe(true);
    expect(written.graph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      "plan",
      "tool",
      "memory",
      "handoff",
      "retry",
      "finalization"
    ]));
    expect(written.graph.edges.filter((edge) => edge.kind === "tool_execution").map((edge) => edge.receiptId)).toContain("receipt-materials-tool");
    expect(written.graph.edges.filter((edge) => edge.kind === "handoff").map((edge) => edge.receiptId)).toContain("receipt-materials-handoff");
    expect(verifyRuntimeLifecycleGraph(written.graph).valid).toBe(true);

    const auditExport = renderRuntimeLifecycleGraphAuditExport(written.graph);
    expect(auditExport).toContain("AMC Runtime Lifecycle Graph Export");
    expect(auditExport).toContain("runtime-hydrogen-storage-1");
    expect(auditExport).toContain("REPLAYABLE");
    expect(auditExport).toContain("receipt-materials-handoff");
  });

  it("fails closed when materials paper metadata replaces signed runtime graph evidence", () => {
    const graph = buildRuntimeLifecycleGraph({
      run: {
        schemaVersion: "2026-05-22",
        runId: "metadata-only-hydrogen-storage-run",
        agentId: "metadata-only-agent",
        episodeId: null,
        lifecycleRunId: null,
        source: "fleet",
        status: "completed",
        currentStage: "paper.metadata",
        severity: "info",
        createdAt: "2026-06-25T08:36:35.000Z",
        updatedAt: "2026-06-25T08:36:35.000Z",
        startedAt: "2026-06-25T08:36:35.000Z",
        resumedAt: null,
        completedAt: "2026-06-25T08:36:35.000Z",
        canceledAt: null,
        degradedAt: null,
        cancelReason: null,
        degradedReason: null,
        completionReason: null,
        eventCount: 0,
        alertCount: 0,
        policyDecisionCount: 0,
        receiptCount: 0,
        candidateCount: 0,
        redactedEventCount: 0,
        lastEventId: null,
        lastEventAt: null,
        resumeToken: "resume_metadata_only",
        statePath: null,
        signaturePath: null,
        eventsDir: null
      },
      events: [],
      sourceCitations
    });

    expect(graph.failClosed).toBe(true);
    expect(graph.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-lifecycle-graph:plan:missing",
      "runtime-lifecycle-graph:tool:missing",
      "runtime-lifecycle-graph:memory:missing",
      "runtime-lifecycle-graph:handoff:missing",
      "runtime-lifecycle-graph:retry:missing",
      "runtime-lifecycle-graph:finalization:missing",
      "runtime-lifecycle-graph:evidence-chain:missing"
    ]));
    expect(verifyRuntimeLifecycleGraph(graph).valid).toBe(false);
  });

  it("does not add materials-source identifiers to generic runtime, lifecycle, or fleet implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("d5sc09921h");
    expect(combined).not.toContain("W4414991289");
    expect(combined).not.toContain("DIVE");
    expect(combined).not.toContain("\"DIVE\" into hydrogen storage materials discovery with AI agents");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
