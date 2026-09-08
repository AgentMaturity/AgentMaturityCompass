import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildTraceFailureIndex, writeTraceFailureIndex, topTraceFailureClusters, loadTraceFailureIndex } from "../src/watch/traceFailureIndex.js";
import type { ProductionTrace } from "../src/agents/traceIngestion.js";
const trace = (id: string, timestamp: number | null): ProductionTrace => ({ traceId: id, agentId: "default", agentType: "test", input: "hello", output: "synthetic failure", durationMs: null, timestamp, metadata: {}, error: true, errorMessage: "synthetic failure" });

test("unknown event dates remain null, sort last and do not set cluster bounds", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-watch-time-"));
  try {
    const known = Date.UTC(2026, 8, 8);
    const index = buildTraceFailureIndex({ workspace, runId: "mixed", traces: [trace("unknown", null), trace("known", known)] });
    expect(index.entries.map((entry) => entry.traceId)).toEqual(["known", "unknown"]);
    expect(index.entries[1]!.timestamp).toBeNull();
    expect(index.clusters[0]!.firstSeenAt).toBe(new Date(known).toISOString());
    expect(index.clusters[0]!.lastSeenAt).toBe(new Date(known).toISOString());
    writeTraceFailureIndex({ workspace, runId: "unknown", traces: [trace("u", null)] });
    writeTraceFailureIndex({ workspace, runId: "known", traces: [trace("k", known)] });
    const clusters = topTraceFailureClusters({ workspace });
    expect(clusters[0]!.count).toBe(2);
    expect(clusters[0]!.firstSeenAt).toBe(new Date(known).toISOString());
    expect(clusters[0]!.lastSeenAt).toBe(new Date(known).toISOString());
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test("legacy dated indexes remain readable alongside nullable indexes without rewriting old files", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-watch-time-"));
  try {
    const known = Date.UTC(2026, 8, 8);
    const old = writeTraceFailureIndex({ workspace, runId: "legacy", traces: [trace("known", known)] });
    writeFileSync(old.path, JSON.stringify({ ...old.index, schemaVersion: "2026-05-22" }));
    const oldBytes = readFileSync(old.path, "utf8");
    const current = writeTraceFailureIndex({ workspace, runId: "unknown", traces: [null, NaN, Infinity, 1e100].map((time, i) => trace(`u${i}`, time)) });
    expect(current.index.schemaVersion).toBe("2026-09-08");
    expect(current.index.entries.every((entry) => entry.timestamp === null)).toBe(true);
    expect(current.index.entries.map((entry) => entry.traceId)).toEqual(["u0", "u1", "u2", "u3"]);
    expect(current.index.clusters[0]?.firstSeenAt).toBeNull();
    expect(current.index.clusters[0]?.lastSeenAt).toBeNull();
    expect(loadTraceFailureIndex({ workspace, selector: "legacy" }).schemaVersion).toBe("2026-05-22");
    const combined = topTraceFailureClusters({ workspace });
    expect(combined[0]?.count).toBe(5);
    expect(combined[0]?.firstSeenAt).toBe(new Date(known).toISOString());
    expect(combined[0]?.lastSeenAt).toBe(new Date(known).toISOString());
    expect(readFileSync(old.path, "utf8")).toBe(oldBytes);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
