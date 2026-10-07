import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import {
  ObservabilityOTELExporter,
  getSharedObservabilityExporter,
  resetSharedObservabilityExporterForTests
} from "../src/observability/otelExporter.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * Failure policy row `telemetry-exporter-down` (P0-11, docs/security/THREAT_MODEL.md):
 * execution continues and mandatory evidence persists locally when the
 * telemetry exporter fails. Reporting dropped telemetry is a separate gap (P2-18).
 */
const PASS = "telemetry-exporter-failure-pass";
const ENV = ["AMC_VAULT_PASSPHRASE", "AMC_OTEL_ENABLED", "AMC_OTEL_EXPORTERS", "AMC_OTEL_FLUSH_MAX_RETRIES"] as const;
const saved = new Map(ENV.map((name) => [name, process.env[name]]));
const dirs: string[] = [];
const open: Array<{ close: () => void }> = [];

beforeEach(() => {
  process.env.AMC_VAULT_PASSPHRASE ??= PASS;
  process.env.AMC_OTEL_ENABLED = "true";
  process.env.AMC_OTEL_EXPORTERS = "otlp";
  process.env.AMC_OTEL_FLUSH_MAX_RETRIES = "0";
  resetSharedObservabilityExporterForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSharedObservabilityExporterForTests();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  while (open.length > 0) {
    try { open.pop()?.close(); } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function readyWorkspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-telemetry-fail-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, "workspace", "output"), { recursive: true });
  writeFileSync(join(dir, "workspace", "n.txt"), "hello");
  return dir;
}

function allowedAudits(workspace: string, callId: string): number {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit'").all() as Array<{ meta_json: string }>)
      .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
      .filter((meta) => meta["auditType"] === "TOOL_CALL_ALLOWED" && meta["callId"] === callId).length;
  } finally {
    db.close();
  }
}

async function governedRead(workspace: string) {
  const toolset = agentToolset({ workspace, agentId: "default", sessionId: "telemetry-failure-session" });
  open.push(toolset);
  const callId = `c-read-${Math.random().toString(36).slice(2, 8)}`;
  const result = await toolset.seam.execute({
    callId, toolName: "fs.read", rawArguments: JSON.stringify({ path: "workspace/n.txt" }), sessionId: "s1",
    turn: 1, step: 1, parentToken: null, dispatch: "native" as const, signal: new AbortController().signal
  });
  return { callId, outcome: result.outcome };
}

describe("a failing telemetry exporter (failure policy: telemetry-exporter-down)", () => {
  it("does not fail a governed tool call or drop its ledger row when recording throws", async () => {
    const workspace = readyWorkspace();
    const record = vi.spyOn(ObservabilityOTELExporter.prototype, "recordEvidenceEvent").mockImplementation(() => {
      throw new Error("exporter crashed");
    });

    const { callId, outcome } = await governedRead(workspace);

    expect(record).toHaveBeenCalled();
    expect(outcome).toBe("OK");
    expect(allowedAudits(workspace, callId)).toBe(1);
  });

  it("does not fail a governed tool call or drop its ledger row when the collector is unreachable", async () => {
    const workspace = readyWorkspace();
    // Every append crosses the shared flush threshold, so each one dispatches.
    vi.spyOn(ObservabilityOTELExporter.prototype, "getBufferStats").mockReturnValue({ traces: 128, metrics: 0, logs: 0 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connect ECONNREFUSED 127.0.0.1:4318"));

    const { callId, outcome } = await governedRead(workspace);
    await getSharedObservabilityExporter().flush();

    expect(fetchSpy).toHaveBeenCalled();
    expect(outcome).toBe("OK");
    expect(allowedAudits(workspace, callId)).toBe(1);
  });
});
