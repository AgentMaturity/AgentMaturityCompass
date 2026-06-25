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

const DOC = "docs/source-reviews/GAP-1842-rare-disease-runtime-lifecycle-graph.md";
const OPENALEX = "https://openalex.org/W7130436101";
const DOI = "https://doi.org/10.1038/s41586-025-10097-9";
const NATURE = "https://www.nature.com/articles/s41586-025-10097-9";
const TITLE = "An agentic system for rare disease diagnosis with traceable reasoning";
const IDENTIFIER = "rare_disease_runtime_lifecycle_graph";
const IMPLEMENTATION_FILES = [
  "src/runtime/lifecycleGraph.ts",
  "src/runtime/runManager.ts",
  "src/lifecycle/artifactSignature.ts",
  "src/fleet/fleetLifecycle.ts"
];

const sourceCitations: RuntimeLifecycleGraphSourceCitation[] = [
  {
    sourceId: "openalex-w7130436101",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:28:30.000Z"
  },
  {
    sourceId: "doi-10-1038-s41586-025-10097-9",
    title: "Nature DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T08:28:30.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1842-runtime-graph-"));
  roots.push(dir);
  return dir;
}

function populateTraceableReasoningRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "fleet",
    stage: "clinical.reasoning.created",
    episodeId: "episode-rare-disease-1",
    lifecycleRunId: "lifecycle-rare-disease-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "studio",
    type: "stage.changed",
    stage: "plan.created",
    message: "Traceable reasoning plan created.",
    links: { receiptId: "receipt-rare-plan" },
    payload: { planId: "rare-plan-1", goalHash: "b".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "sdk",
    type: "trace.received",
    stage: "tool.call",
    message: "Evidence lookup tool call recorded.",
    links: { receiptId: "receipt-rare-tool", traceId: "trace-rare-tool" },
    payload: { toolId: "evidence-lookup", evidenceQueryHash: "c".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "sdk",
    type: "trace.received",
    stage: "memory.write",
    message: "Reasoning evidence memory write recorded.",
    links: { receiptId: "receipt-rare-memory", traceId: "trace-rare-memory" },
    payload: { memoryRef: "memory-clinical-evidence-chain" }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "fleet",
    type: "stage.changed",
    stage: "handoff.clinician-review",
    message: "Handoff to clinician reviewer.",
    links: { receiptId: "receipt-rare-handoff", decisionId: "clinician-review-handoff" },
    payload: { toAgentId: "clinician-reviewer" }
  });
  resumeRuntimeRun({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    source: "watch",
    stage: "retry.evidence-lookup",
    message: "Retrying after incomplete evidence retrieval."
  });
  completeRuntimeRun({
    workspace: ws,
    runId: "runtime-rare-disease-1",
    agentId: "clinical-reasoning-agent",
    reason: "Traceable reasoning run finalized."
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1842 rare disease traceable reasoning runtime graph boundary", () => {
  it("documents the live rare disease source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1842");
    expect(doc).toContain("Signed runtime lifecycle graph");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(NATURE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Nature");
    expect(doc).toContain("rare disease");
    expect(doc).toContain("traceable reasoning");
    expect(doc).toContain("transparent reasoning");
    expect(doc).toContain("verifiable medical evidence");
    expect(doc).toContain("multi-agent");
    expect(doc).toContain("plan, tool, memory, handoff, retry, and finalization");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No clinical subsystem");
  });

  it("reuses the generic signed runtime lifecycle graph for traceable clinical reasoning runs", () => {
    const ws = workspace();
    populateTraceableReasoningRun(ws);

    const written = writeRuntimeLifecycleGraph({
      workspace: ws,
      runId: "runtime-rare-disease-1",
      agentId: "clinical-reasoning-agent",
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
    expect(written.graph.edges.filter((edge) => edge.kind === "tool_execution").map((edge) => edge.receiptId)).toContain("receipt-rare-tool");
    expect(written.graph.edges.filter((edge) => edge.kind === "handoff").map((edge) => edge.receiptId)).toContain("receipt-rare-handoff");
    expect(verifyRuntimeLifecycleGraph(written.graph).valid).toBe(true);

    const auditExport = renderRuntimeLifecycleGraphAuditExport(written.graph);
    expect(auditExport).toContain("AMC Runtime Lifecycle Graph Export");
    expect(auditExport).toContain("runtime-rare-disease-1");
    expect(auditExport).toContain("REPLAYABLE");
    expect(auditExport).toContain("receipt-rare-handoff");
  });

  it("fails closed when rare disease paper metadata replaces signed runtime graph evidence", () => {
    const graph = buildRuntimeLifecycleGraph({
      run: {
        schemaVersion: "2026-05-22",
        runId: "metadata-only-rare-disease-run",
        agentId: "metadata-only-agent",
        episodeId: null,
        lifecycleRunId: null,
        source: "fleet",
        status: "completed",
        currentStage: "paper.metadata",
        severity: "info",
        createdAt: "2026-06-25T08:28:30.000Z",
        updatedAt: "2026-06-25T08:28:30.000Z",
        startedAt: "2026-06-25T08:28:30.000Z",
        resumedAt: null,
        completedAt: "2026-06-25T08:28:30.000Z",
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

  it("does not add rare-disease-source identifiers to generic runtime, lifecycle, or fleet implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("s41586-025-10097-9");
    expect(combined).not.toContain("W7130436101");
    expect(combined).not.toContain("DeepRare");
    expect(combined).not.toContain("An agentic system for rare disease diagnosis with traceable reasoning");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
