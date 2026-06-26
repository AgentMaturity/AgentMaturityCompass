import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTraceFailureIndex } from "../src/watch/traceFailureIndex.js";
import type { ProductionTrace } from "../src/agents/traceIngestion.js";

const DOC = "docs/source-reviews/GAP-3748-langtrace-trace-failure-taxonomy.md";
const HOME = "https://www.langtrace.ai";
const DOCS = "https://docs.langtrace.ai";
const REPO = "https://github.com/Scale3-Labs/langtrace";
const REPO_API = "https://api.github.com/repos/Scale3-Labs/langtrace";
const README = "https://raw.githubusercontent.com/Scale3-Labs/langtrace/main/README.md";
const TITLE = "Langtrace";

const implementationFiles = [
  "src/watch/traceFailureIndex.ts",
  "src/observability/sessionCorrelator.ts",
  "src/studio/openapi.ts",
];

function trace(traceId: string, errorMessage: string, metadata: Record<string, unknown> = {}): ProductionTrace {
  return {
    traceId,
    agentId: "gap3748-langtrace-agent",
    agentType: "research-agent",
    input: { prompt: "Investigate production behavior." },
    output: { error: errorMessage },
    durationMs: typeof metadata.latencyMs === "number" ? metadata.latencyMs : 1200,
    timestamp: Date.UTC(2026, 5, 26, 10, 48, 0),
    spanCount: 4,
    sessionId: "gap3748-session",
    error: true,
    errorMessage,
    metadata,
  };
}

describe("GAP-3748 Langtrace trace failure taxonomy boundary", () => {
  it("documents live Langtrace metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3748");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(REPO);
    expect(doc).toContain(REPO_API);
    expect(doc).toContain(README);
    expect(doc).toContain("homepage currently returns HTTP 404");
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("license `AGPL-3.0`");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("Open Telemetry");
    expect(doc).toContain("traces and metrics");
    expect(doc).toContain("LLM APIs");
    expect(doc).toContain("Vector Databases");
    expect(doc).toContain("LLM Frameworks");
    expect(doc).toContain("Real-time Monitoring");
    expect(doc).toContain("Performance Insights");
    expect(doc).toContain("Debug Tools");
    expect(doc).toContain("Analytics");
    expect(doc).toContain("Self-hosting");
    expect(doc).toContain("TypeScript SDK");
    expect(doc).toContain("Python SDK");
    expect(doc).toContain("Trace schema, taxonomy label, cluster ID, and linked remediation");
    expect(doc).toContain("prompt");
    expect(doc).toContain("retrieval");
    expect(doc).toContain("tool");
    expect(doc).toContain("policy");
    expect(doc).toContain("latency");
    expect(doc).toContain("cost");
    expect(doc).toContain("human-review");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("classifies prompt, retrieval, tool, policy, latency, cost, and human-review failures with remediation clusters", () => {
    const index = buildTraceFailureIndex({
      workspace: "/tmp/gap3748",
      agentId: "gap3748-langtrace-agent",
      runId: "gap3748-run",
      traces: [
        trace("prompt-1", "Prompt template variable was missing and system prompt instructions conflicted."),
        trace("retrieval-1", "RAG vector search failed because context was missing from retrieval."),
        trace("tool-1", "Tool call argument schema mismatched the external API contract."),
        trace("policy-1", "Policy guardrail denied action because approval ticket was absent."),
        trace("latency-1", "Request timeout exceeded deadline after high latency.", { latencyMs: 8000 }),
        trace("cost-1", "Token usage and provider cost spiked beyond budget limit.", { costUsd: 3.2 }),
        trace("human-1", "Human review queue missed escalation and manual review did not happen."),
      ],
    });

    expect(index.schemaVersion).toBe("2026-05-22");
    expect(index.entries.map((entry) => entry.failureClass)).toEqual(expect.arrayContaining([
      "prompt_error",
      "retrieval_error",
      "tool_misuse",
      "policy_violation",
      "latency_timeout",
      "cost_spike",
      "human_review_gap",
    ]));
    expect(index.entries.every((entry) => entry.traceId && entry.rawTraceRef && entry.redactedSnippet)).toBe(true);
    expect(index.clusters.length).toBeGreaterThanOrEqual(7);
    for (const cluster of index.clusters) {
      expect(cluster.clusterId).toMatch(/^tfcl_[a-f0-9]{16}$/);
      expect(cluster.failureClass).not.toBe("unknown_failure");
      expect(cluster.recommendationIds[0]).toBe(`repair.${cluster.failureClass}`);
      expect(cluster.suggestedRepairInput.failureClass).toBe(cluster.failureClass);
      expect(cluster.sampleEvidenceRefs.length).toBeGreaterThan(0);
    }
  });

  it("fails closed when Langtrace metadata replaces AMC-owned trace taxonomy entries", () => {
    const index = buildTraceFailureIndex({
      workspace: "/tmp/gap3748",
      agentId: "gap3748-langtrace-agent",
      runId: "gap3748-metadata-only",
      traces: [
        {
          ...trace("metadata-only", "Langtrace OpenTelemetry observability metadata only.", { sourceRef: HOME }),
          error: false,
        },
      ],
    });

    expect(index.summary.entryCount).toBe(0);
    expect(index.summary.clusterCount).toBe(0);
    expect(index.entries).toEqual([]);
    expect(index.clusters).toEqual([]);
  });

  it("does not add Langtrace identifiers to generic Watch, Observability, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("Langtrace");
      expect(source).not.toContain("Scale3-Labs/langtrace");
    }
  });
});
