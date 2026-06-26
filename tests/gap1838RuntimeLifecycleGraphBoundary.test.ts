import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
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

const DOC = "docs/source-reviews/GAP-1838-ai-research-runtime-lifecycle-graph.md";
const OPENALEX = "https://openalex.org/W7140287209";
const DOI = "https://doi.org/10.1038/s41586-026-10265-5";
const NATURE = "https://www.nature.com/articles/s41586-026-10265-5";
const TITLE = "Towards end-to-end automation of AI research";
const IDENTIFIER = "ai_research_runtime_lifecycle_graph";
const IMPLEMENTATION_FILES = [
  "src/runtime/lifecycleGraph.ts",
  "src/runtime/runManager.ts",
  "src/fleet/fleetLifecycle.ts",
  "src/fleet/typedGraph.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RuntimeLifecycleGraphSourceCitation[] = [
  {
    sourceId: "openalex-w7140287209",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:20:00.000Z"
  },
  {
    sourceId: "doi-10-1038-s41586-026-10265-5",
    title: "Nature DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T08:20:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1838-runtime-graph-"));
  roots.push(dir);
  return dir;
}

function populateRuntimeRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "fleet",
    stage: "research.created",
    episodeId: "episode-ai-research-1",
    lifecycleRunId: "lifecycle-ai-research-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "studio",
    type: "stage.changed",
    stage: "plan.created",
    message: "Research plan created.",
    links: { receiptId: "receipt-plan-created" },
    payload: { planId: "plan-research-1", goal: "Run a basic literature scan." }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "sdk",
    type: "trace.received",
    stage: "tool.call",
    message: "Tool call executed for search.",
    links: { receiptId: "receipt-tool-search", traceId: "trace-tool-search" },
    payload: { toolId: "web-search", queryHash: "a".repeat(64) }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "sdk",
    type: "trace.received",
    stage: "memory.write",
    message: "Memory write recorded.",
    links: { receiptId: "receipt-memory-write", traceId: "trace-memory-write" },
    payload: { memoryRef: "memory-literature-finding-1" }
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "fleet",
    type: "stage.changed",
    stage: "handoff.reviewer",
    message: "Handoff to reviewer agent.",
    links: { receiptId: "receipt-handoff-reviewer", decisionId: "handoff-reviewer" },
    payload: { toAgentId: "research-reviewer-agent" }
  });
  resumeRuntimeRun({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    source: "watch",
    stage: "retry.tool",
    message: "Retrying after a transient tool timeout."
  });
  completeRuntimeRun({
    workspace: ws,
    runId: "runtime-ai-research-1",
    agentId: "ai-research-agent",
    reason: "Research run finalized."
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1838 signed runtime lifecycle graph boundary", () => {
  it("documents the live AI research source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1838");
    expect(doc).toContain("Signed runtime lifecycle graph");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(NATURE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Nature");
    expect(doc).toContain("research life cycle");
    expect(doc).toContain("creates research ideas");
    expect(doc).toContain("writes code");
    expect(doc).toContain("runs experiments");
    expect(doc).toContain("peer review");
    expect(doc).toContain("plan, tool, memory, handoff, retry, and finalization");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No AI Scientist subsystem");
  });

  it("exports and signs a replayable plan/tool/memory/handoff/retry/finalization graph from runtime events", () => {
    const ws = workspace();
    populateRuntimeRun(ws);

    const written = writeRuntimeLifecycleGraph({
      workspace: ws,
      runId: "runtime-ai-research-1",
      agentId: "ai-research-agent",
      sourceCitations
    });

    expect(existsSync(written.graphPath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.graph.failClosed).toBe(false);
    expect(written.graph.graphHash).toMatch(/^[a-f0-9]{64}$/);
    expect(written.graph.replay.replayable).toBe(true);
    expect(written.graph.surfaceBinding).toEqual(["Fleet", "Watch", "Studio"]);
    expect(written.graph.requiredNodeKinds).toEqual(["plan", "tool", "memory", "handoff", "retry", "finalization"]);
    expect(written.graph.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining([
      "plan",
      "tool",
      "memory",
      "handoff",
      "retry",
      "finalization"
    ]));
    expect(written.graph.edges.filter((edge) => edge.kind === "tool_execution").every((edge) => edge.receiptId)).toBe(true);
    expect(written.graph.edges.filter((edge) => edge.kind === "handoff").every((edge) => edge.receiptId)).toBe(true);
    expect(written.graph.edges.every((edge) => edge.timestamp)).toBe(true);
    expect(written.graph.nodes.every((node) => node.eventSignaturePath)).toBe(true);

    const verification = verifyRuntimeLifecycleGraph(written.graph);
    expect(verification.valid).toBe(true);
    expect(verification.failClosedReasons).toHaveLength(0);
    expect(verifyArtifactFileSignature({ workspace: ws, path: written.graphPath }).valid).toBe(true);

    const auditExport = renderRuntimeLifecycleGraphAuditExport(written.graph);
    expect(auditExport).toContain("AMC Runtime Lifecycle Graph Export");
    expect(auditExport).toContain("runtime-ai-research-1");
    expect(auditExport).toContain("plan/tool/memory/handoff/retry/finalization");
    expect(auditExport).toContain("REPLAYABLE");
    expect(auditExport).toContain("receipt-handoff-reviewer");
  });

  it("fails closed when paper metadata replaces signed lifecycle graph evidence", () => {
    const graph = buildRuntimeLifecycleGraph({
      run: {
        schemaVersion: "2026-05-22",
        runId: "metadata-only-ai-research-run",
        agentId: "metadata-only-agent",
        episodeId: null,
        lifecycleRunId: null,
        source: "fleet",
        status: "completed",
        currentStage: "paper.metadata",
        severity: "info",
        createdAt: "2026-06-25T08:20:00.000Z",
        updatedAt: "2026-06-25T08:20:00.000Z",
        startedAt: "2026-06-25T08:20:00.000Z",
        resumedAt: null,
        completedAt: "2026-06-25T08:20:00.000Z",
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

  it("does not add source-specific AI Scientist identifiers to generic runtime, lifecycle, fleet, or signing implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("s41586-026-10265-5");
    expect(combined).not.toContain("W7140287209");
    expect(combined).not.toContain("The AI Scientist");
    expect(combined).not.toContain("Towards end-to-end automation of AI research");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
