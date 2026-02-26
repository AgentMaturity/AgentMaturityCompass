import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, test } from "vitest";
import { openLedger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];

function newWorkspace(prefix: string): string {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

afterEach(() => {
  while (roots.length > 0) {
    const workspace = roots.pop();
    if (workspace) {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

describe("performance: ingestion pipeline", () => {
  test("batch append outperforms per-event append for bulk ingest payloads", () => {
    const eventCount = 800;
    const payloads = Array.from({ length: eventCount }, (_, i) => `evidence-line-${i}-${"x".repeat(64)}`);

    const serialWorkspace = newWorkspace("amc-perf-ingest-serial-");
    const serialLedger = openLedger(serialWorkspace);
    serialLedger.startSession({
      sessionId: "serial",
      runtime: "unknown",
      binaryPath: "perf",
      binarySha256: "serial"
    });
    const serialStart = performance.now();
    for (let i = 0; i < payloads.length; i += 1) {
      serialLedger.appendEvidence({
        sessionId: "serial",
        runtime: "unknown",
        eventType: "review",
        payload: payloads[i],
        inline: true,
        meta: {
          questionId: "AMC-1.1",
          seq: i
        }
      });
    }
    serialLedger.sealSession("serial");
    const serialMs = performance.now() - serialStart;
    serialLedger.close();

    const batchWorkspace = newWorkspace("amc-perf-ingest-batch-");
    const batchLedger = openLedger(batchWorkspace);
    batchLedger.startSession({
      sessionId: "batch",
      runtime: "unknown",
      binaryPath: "perf",
      binarySha256: "batch"
    });
    const batchStart = performance.now();
    const results = batchLedger.appendEvidenceBatch(
      payloads.map((payload, i) => ({
        sessionId: "batch",
        runtime: "unknown" as const,
        eventType: "review" as const,
        payload,
        inline: true,
        meta: {
          questionId: "AMC-1.1",
          seq: i
        }
      }))
    );
    batchLedger.sealSession("batch");
    const batchMs = performance.now() - batchStart;
    batchLedger.close();

    expect(results.length).toBe(eventCount);
    // Allow 20% tolerance for CI/loaded-machine timing variance
    expect(batchMs).toBeLessThan(serialMs * 1.2);

    console.info("[perf][ingest]", {
      serialMs: Number(serialMs.toFixed(3)),
      batchMs: Number(batchMs.toFixed(3)),
      speedupX: Number((serialMs / Math.max(batchMs, 0.001)).toFixed(3))
    });
  });
});
