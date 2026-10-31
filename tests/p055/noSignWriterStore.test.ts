/**
 * P0-55 (pending-checks.md "Remaining AMC_NO_SIGN writers into the signed store"): under AMC_NO_SIGN=1 a command's
 * evidence writer opens the unsigned store, so `.amc/evidence.sqlite` never gains a `writer_sig='unsigned'` row.
 * Each case calls the shared function the command runs.
 */
import Database from "better-sqlite3";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p055-nosign-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_NO_SIGN", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** Rows whose `writer_sig` or `signature` is the literal "unsigned", in every table of a store. */
function unsignedRows(relative: string): number {
  let db: Database.Database;
  try { db = new Database(join(workspace, relative), { readonly: true, fileMustExist: true }); } catch { return 0; }
  try {
    let sum = 0;
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>) {
      const columns = (db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all() as Array<{ name: string }>).map((c) => c.name);
      for (const column of columns.filter((c) => c === "writer_sig" || c === "signature")) {
        sum += (db.prepare(`SELECT COUNT(*) AS n FROM ${JSON.stringify(name)} WHERE ${column} = 'unsigned'`).get() as { n: number }).n;
      }
    }
    return sum;
  } finally { db.close(); }
}

const writers: Array<[string, () => unknown | Promise<unknown>]> = [
  ["amc ingest (ingestEvidence)", async () => {
    const file = join(root, "notes.txt"); writeFileSync(file, "reviewed by hand\n");
    const { ingestEvidence } = await import("../../src/ingest/ingest.js");
    return ingestEvidence({ workspace, inputPath: file, type: "generic_text" as never });
  }],
  ["amc attest (attestIngestSession)", async () => {
    const file = join(root, "notes.txt"); writeFileSync(file, "reviewed by hand\n");
    const { ingestEvidence, attestIngestSession } = await import("../../src/ingest/ingest.js");
    const { ingestSessionId } = ingestEvidence({ workspace, inputPath: file, type: "generic_text" as never });
    return attestIngestSession({ workspace, ingestSessionId, attestedBy: "auditor", statement: "checked" } as never);
  }],
  ["amc budgets reset (resetBudgetDay)", async () => {
    const { resetBudgetDay } = await import("../../src/budgets/budgets.js");
    return resetBudgetDay({ workspace, agentId: "default", day: "2026-10-31" });
  }],
  ["amc archetype apply audit (recordArchetypeAudit)", async () => {
    const { recordArchetypeAudit } = await import("../../src/archetypes/index.js");
    return recordArchetypeAudit({ workspace, agentId: "default", archetypeId: "code-agent", fileHashes: {} });
  }],
  ["amc watch observability bridge (recordToLedger)", async () => {
    const { ObservabilityBridge } = await import("../../src/watch/observabilityBridge.js");
    const bridge = new ObservabilityBridge({ workspace, agentId: "default", providers: [] });
    const trace = { traceId: "t-1", startTimeMs: 0, endTimeMs: 1, durationMs: 1, status: "ok", spans: [], totalTokens: 0, totalCostUsd: 0,
      modelBreakdown: {}, errorCount: 0, toolCallCount: 0, llmCallCount: 0 };
    return (bridge as unknown as { recordToLedger(traces: unknown[]): Promise<void> }).recordToLedger([trace]);
  }],
  ["amc watch realtime assurance (recordViolationsToLedger)", async () => {
    const { ObservabilityBridge } = await import("../../src/watch/observabilityBridge.js");
    const { RealtimeAssuranceEngine } = await import("../../src/watch/realtimeAssurance.js");
    const engine = new RealtimeAssuranceEngine({ workspace, agentId: "default", bridge: new ObservabilityBridge({ workspace, agentId: "default", providers: [] }) });
    const violation = { violationId: "v-1", checkId: "latency", checkName: "latency", severity: "high", traceId: "t-1", message: "slow", details: {},
      recommendation: "none", ts: 1 };
    return (engine as unknown as { recordViolationsToLedger(v: unknown[]): Promise<void> }).recordViolationsToLedger([violation]);
  }]
];

for (const [name, write] of writers) {
  test(`AMC_NO_SIGN=1 ${name} writes no unsigned row into .amc/evidence.sqlite`, async () => {
    expect(unsignedRows(".amc/evidence.sqlite")).toBe(0);
    await write();
    expect(unsignedRows(".amc/evidence.sqlite")).toBe(0);
    expect(unsignedRows(UNSIGNED_EVIDENCE_STORE)).toBeGreaterThan(0);
  });
}
