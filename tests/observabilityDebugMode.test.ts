import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import {
  formatDebugEventLine,
  listEvidenceDebugEvents,
  streamEvidenceDebugEvents
} from "../src/observability/debugMode.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-observability-debug-test-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function appendEvent(params: {
  workspace: string;
  id: string;
  ts: number;
  eventType: "audit" | "metric" | "tool_action" | "tool_result";
  meta: Record<string, unknown>;
}): void {
  const ledger = openLedger(params.workspace);
  try {
    ledger.appendEvidence({
      id: params.id,
      ts: params.ts,
      sessionId: "session-1",
      runtime: "gateway",
      eventType: params.eventType,
      meta: params.meta
    });
  } finally {
    ledger.close();
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("observability debug mode", () => {
  test("lists evidence events with agent/dimension/question/event filters", () => {
    const workspace = newWorkspace();
    appendEvent({
      workspace,
      id: "ev-1",
      ts: 1_700_000_000_000,
      eventType: "audit",
      meta: {
        agentId: "agent-a",
        dimension: "resilience",
        questionId: "AMC-4.1",
        trustTier: "OBSERVED_HARDENED",
        severity: "high"
      }
    });
    appendEvent({
      workspace,
      id: "ev-2",
      ts: 1_700_000_001_000,
      eventType: "metric",
      meta: {
        agentId: "agent-b",
        dimension: "skills",
        questionId: "AMC-5.2"
      }
    });

    const rows = listEvidenceDebugEvents({
      workspace,
      agentId: "agent-a",
      dimension: "resilience",
      questionId: "AMC-4.1",
      eventType: "audit",
      limit: 20
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("ev-1");
    expect(rows[0]!.trustTier).toBe("OBSERVED_HARDENED");
  });

  test("formats debug rows with structured labels", () => {
    const workspace = newWorkspace();
    appendEvent({
      workspace,
      id: "ev-format",
      ts: 1_700_000_100_000,
      eventType: "tool_action",
      meta: {
        agentId: "agent-fmt",
        trustTier: "OBSERVED_HARDENED",
        severity: "CRITICAL",
        questionId: "AMC-2.5",
        dimension: "autonomy"
      }
    });
    const rows = listEvidenceDebugEvents({ workspace, agentId: "agent-fmt", limit: 10 });
    const line = formatDebugEventLine(rows[0]!, false);
    expect(line).toContain("[OBSERVED_HARDENED]");
    expect(line).toContain("[CRITICAL]");
    expect(line).toContain("q=AMC-2.5");
    expect(line).toContain("dim=autonomy");
  });

  test("streams follow mode and emits new matching events", async () => {
    const workspace = newWorkspace();
    const seen: string[] = [];

    const streamPromise = streamEvidenceDebugEvents({
      workspace,
      agentId: "agent-stream",
      follow: true,
      includeHistorical: false,
      pollIntervalMs: 10,
      maxFollowIterations: 25,
      onEvent: (event) => {
        seen.push(event.id);
      }
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    appendEvent({
      workspace,
      id: "ev-stream-1",
      ts: Date.now(),
      eventType: "tool_result",
      meta: {
        agentId: "agent-stream",
        trustTier: "OBSERVED"
      }
    });
    appendEvent({
      workspace,
      id: "ev-stream-other",
      ts: Date.now() + 1,
      eventType: "tool_result",
      meta: {
        agentId: "agent-other",
        trustTier: "OBSERVED"
      }
    });

    await streamPromise;
    expect(seen).toContain("ev-stream-1");
    expect(seen).not.toContain("ev-stream-other");
  });

  test("emits anomaly callbacks for trust regressions in streamed history", async () => {
    const workspace = newWorkspace();
    appendEvent({
      workspace,
      id: "ev-trust-1",
      ts: 1_700_000_000_000,
      eventType: "audit",
      meta: { agentId: "agent-anomaly", trustTier: "OBSERVED_HARDENED" }
    });
    appendEvent({
      workspace,
      id: "ev-trust-2",
      ts: 1_700_000_001_000,
      eventType: "audit",
      meta: { agentId: "agent-anomaly", trustTier: "OBSERVED" }
    });
    appendEvent({
      workspace,
      id: "ev-trust-3",
      ts: 1_700_000_002_000,
      eventType: "audit",
      meta: { agentId: "agent-anomaly", trustTier: "SELF_REPORTED" }
    });

    const anomalyTypes: string[] = [];
    await streamEvidenceDebugEvents({
      workspace,
      agentId: "agent-anomaly",
      follow: false,
      includeHistorical: true,
      limit: 20,
      onAnomaly: (anomaly) => {
        anomalyTypes.push(anomaly.type);
      }
    });
    expect(anomalyTypes).toContain("TRUST_TIER_REGRESSION");
  });
});
