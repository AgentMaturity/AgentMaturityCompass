import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";
import { CallbackTelemetryCapture } from "../src/importers/callbackTelemetryCapture.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "amc-record-map-")); roots.push(root);
  const inputPath = join(root, "source"), workspace = join(root, "workspace");
  mkdirSync(inputPath); mkdirSync(workspace);
  return { root, inputPath, workspace, agentId: "default" };
}
function json(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value)); }
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("per-record neutral import mapping", () => {
  it("accounts for mixed rows without inventing missing time, duration, success or cost", () => {
    const input = setup();
    json(join(input.inputPath, "events.json"), [
      { id: "measured-by-source", input: "question", output: "answer", timestamp: "2026-09-08T01:02:03.000Z", durationMs: 42, extra: { arbitrary: true } },
      null,
      { id: "failure", input: "question", error: "timeout", timestamp: "invalid", durationMs: -1 },
      { id: "unknown", input: "question", metadata: { password: "fixture-private-password", nested: { authorization: "bearer private-value-1234" } } }
    ]);
    const plan = validateNeutralImport(input), map = plan.normalization!.recordMapping!;
    expect(map.schemaVersion).toBe("amc-record-map/2");
    expect(map.counts).toMatchObject({ records: 4, mapped: 3, unsupported: 1, retainedOnly: 0, malformed: 0, mappedTraceLinks: 3, unlinkedTraces: 0 });
    expect(map.records.map(row => row.pointer)).toEqual(["/0", "/1", "/2", "/3"]);
    expect(map.records[0].traces[0]).toMatchObject({ index: 0, traceId: "measured-by-source", sourceTime: Date.parse("2026-09-08T01:02:03.000Z"),
      durationMs: 42, durationStatus: "source-reported", inferredDuration: false, ingestTimeRef: "plan.detectedAt", cost: null, costStatus: "not-normalized" });
    expect(map.records[0].fields.retainedOnly).toContain("/0/extra");
    expect(map.records[2].traces[0]).toMatchObject({ index: 1, sourceTime: null, sourceTimeStatus: "invalid", durationMs: null, failure: true, outcome: "source-reported-failure" });
    expect(map.records[3].traces[0]).toMatchObject({ index: 2, sourceTime: null, durationMs: null, failure: false, outcome: "unknown-or-not-classified" });
    expect(map.records[3].fields.redactionMarkers).toContain("/3/metadata");
    expect(JSON.stringify(plan)).not.toContain("fixture-private-password");
    expect(JSON.stringify(plan)).not.toContain("private-value-1234");
    expect(existsSync(join(input.workspace, ".amc"))).toBe(false);
  });

  it("keeps exact zero source duration distinct from absent and never replaces event time with ingest time", () => {
    const input = setup(); json(join(input.inputPath, "events.json"), [{ input: "a", durationMs: 0, timestamp: 0 }, { input: "b" }]);
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.records[0].traces[0]).toMatchObject({ sourceTime: 0, durationMs: 0, durationStatus: "source-reported" });
    expect(map.records[1].traces[0]).toMatchObject({ sourceTime: null, durationMs: null, durationStatus: "absent-or-invalid" });
  });

  it("distinguishes retained wrapper context and artifact-only fields from mapped records", () => {
    const input = setup(); json(join(input.inputPath, "run.json"), { runId: "source-run", spans: [{ input: "task", output: "answer" }, "unusable"], secret: "private-secret-value" });
    json(join(input.inputPath, "memory.json"), { memories: ["plain memory", { text: "context" }] });
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.records.filter(row => row.source === "run.json").map(row => [row.pointer, row.disposition])).toEqual([["", "retained-only"], ["/spans/0", "mapped"], ["/spans/1", "unsupported"]]);
    expect(map.records.filter(row => row.source === "memory.json").every(row => row.disposition === "retained-only")).toBe(true);
    expect(map.records.find(row => row.source === "run.json" && row.pointer === "")?.fields.redactionMarkers).toContain("/secret");
    expect(JSON.stringify(map)).not.toContain("private-secret-value");
  });

  it("maps Pi rows by sanitized source identity, accounts for malformed physical lines and does not map the header", () => {
    const input = setup(); const when = "2026-09-08T00:00:00.000Z";
    const lines = [
      JSON.stringify({ type: "session", version: 3, id: "reply", timestamp: when, cwd: "/fixture" }),
      "not json",
      JSON.stringify({ type: "message", id: "user", parentId: null, timestamp: when, message: { role: "user", content: "prompt" } }),
      JSON.stringify({ type: "message", id: "reply", parentId: "user", timestamp: when, message: { role: "assistant", content: [{ type: "text", text: "answer" }], stopReason: "stop" } }),
      JSON.stringify({ type: "malformed", id: 123 })
    ];
    writeFileSync(join(input.inputPath, "pi.jsonl"), lines.join("\n"));
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.sources[0]).toMatchObject({ version: 3, format: "pi-session", recordCount: 5 });
    expect(map.counts).toMatchObject({ records: 5, mapped: 1, retainedOnly: 2, malformed: 2, unlinkedTraces: 0 });
    expect(map.records.find(row => row.sourceLine === 1)?.disposition).toBe("retained-only");
    expect(map.records.find(row => row.sourceLine === 4)?.traces[0]).toMatchObject({ traceId: "reply:reply", durationMs: null });
    expect(map.records.filter(row => row.disposition === "malformed").map(row => row.sourceLine).sort()).toEqual([2, 5]);
  });

  it("links actual callback capture envelope/span IDs while separating source time from capture time", async () => {
    const input = setup(); const capture = new CallbackTelemetryCapture();
    await capture.startSpan({ name: "pi.tool", attributes: { "amc.source.timestamp": 1000, "amc.source.duration_ms": 8, "pi.ai.usage.cost": 0.1 } }, span => {
      span.setStatus({ status: "error" });
    });
    await capture.startSpan({ name: "pi.operation" }, () => undefined);
    const document = capture.snapshot(); json(join(input.inputPath, "callbacks.json"), document);
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.sources[0]).toMatchObject({ format: "callback-telemetry", version: 1 });
    expect(map.counts).toMatchObject({ records: 3, mapped: 2, retainedOnly: 1, unlinkedTraces: 0 });
    expect(map.records.find(row => row.pointer === "/spans/0")?.traces[0]).toMatchObject({ traceId: `callback:${document.spans[0].id}`, sourceTime: 1000, durationMs: 8, failure: true, cost: null });
    expect(map.records.find(row => row.pointer === "/spans/1")?.traces[0]).toMatchObject({ traceId: `callback:${document.spans[1].id}`, sourceTime: null, durationMs: null });
    expect(map.records.find(row => row.pointer === "")?.disposition).toBe("retained-only");
  });

  it("links pinned DSH event sequences to their actual primary trace entries without calling structural events executions", () => {
    const input = setup(); const events = [
      { type: "session", version: 2, id: "dsh-fixture", createdAt: 1000, isSeeded: false, delegationDepth: 0 },
      { type: "turn/start", seq: 0, time: 1001, data: { turn: 0 } },
      { type: "tool/call", seq: 1, time: 1002, data: { turn: 0, step: 0, callId: "call", name: "read", arguments: '{"path":"fixture"}' } },
      { type: "tool/result", seq: 2, time: 1003, data: { turn: 0, step: 0, message: { id: "result", role: "user", source: { kind: "tool", callId: "call" }, content: [{ type: "tool-result", toolCallId: "call", isError: true, content: [{ type: "text", text: "source failure" }] }] } } },
      { type: "turn/end", seq: 3, time: 1004, data: { turn: 0, reason: { kind: "error" } } }
    ];
    writeFileSync(join(input.inputPath, "dsh.jsonl"), events.map(row => JSON.stringify(row)).join("\n"));
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.sources[0]).toMatchObject({ format: "dsh-session", version: 2, recordCount: 5 });
    expect(map.counts).toMatchObject({ records: 5, mapped: 2, retainedOnly: 3, unlinkedTraces: 0 });
    expect(map.records.filter(row => row.disposition === "mapped").map(row => [row.sourceLine, row.traces[0].traceId])).toEqual([[4, "dsh-fixture:2"], [5, "dsh-fixture:3"]]);
    expect(map.records.find(row => row.sourceLine === 4)?.traces[0]).toMatchObject({ sourceTime: 1003, durationMs: null, failure: true });
  });

  it("does not silently map nonconforming rows in a recognized AMC trace stream", () => {
    const input = setup();
    writeFileSync(join(input.inputPath, "amc.jsonl"), [
      { amc_trace_v: 1, ts: 10, agentId: "default", event: "llm_call", extra: "not projected" },
      { input: "ordinary row", output: "does not become a second AMC trace" }
    ].map(value => JSON.stringify(value)).join("\n"));
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.counts).toMatchObject({ records: 2, mapped: 1, unsupported: 1, mappedTraceLinks: 1 });
    expect(map.records[0].fields.retainedOnly).toContain("/0/extra");
    expect(map.records[1].disposition).toBe("unsupported");
  });

  it("reports unusable files with known byte digests and unknown record counts, without a runnable apply action", () => {
    const input = setup(); writeFileSync(join(input.inputPath, "bad.json"), '{"secret":"fixture-sensitive-value",');
    json(join(input.inputPath, "unknown.json"), { unrelated: true }); writeFileSync(join(input.inputPath, "binary.dat"), "opaque");
    const plan = validateNeutralImport(input), map = plan.normalization!.recordMapping!;
    expect(plan.status).toBe("unsupported");
    expect(map.counts).toMatchObject({ records: 0, skippedFilesWithUnknownRecordCount: 3 });
    expect(map.sources.every(source => source.recordCount === null && source.disposition === "skipped")).toBe(true);
    expect(map.sources.find(source => source.path === "bad.json")?.digest).toBe(sha256Hex(readFileSync(join(input.inputPath, "bad.json"))));
    expect(map.sources.find(source => source.path === "binary.dat")?.digest).toBeNull();
    expect(plan.normalization!.nextActions.some(action => action.argv.includes("--expected-digest"))).toBe(false);
    expect(JSON.stringify(plan)).not.toContain("fixture-sensitive-value");
    expect(() => runNeutralImport({ ...input, mode: "import" })).toThrow(/Unsupported import/);
  });

  it("keeps the semantic record map identical across review times and binds applied data to the reviewed snapshot", () => {
    const input = setup(); const path = join(input.inputPath, "run.json"); json(path, { runId: "r", spans: [{ input: "task", durationMs: 4 }] });
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T01:00:00.000Z"));
    const first = validateNeutralImport(input);
    vi.setSystemTime(new Date("2026-09-09T02:00:00.000Z"));
    const second = validateNeutralImport(input);
    expect(second.detectedAt).not.toBe(first.detectedAt);
    expect(second.normalization!.semanticDigest).toBe(first.normalization!.semanticDigest);
    expect(second.normalization!.recordMapping).toEqual(first.normalization!.recordMapping);
    vi.useRealTimers();
    const result = runNeutralImport({ ...input, mode: "import", expectedSemanticDigest: first.normalization!.semanticDigest, retainOriginals: false });
    const normalized = JSON.parse(readFileSync(result.normalizedPath!, "utf8"));
    expect(normalized.plan.normalization.recordMapping).toEqual(first.normalization!.recordMapping);
    json(path, { runId: "changed", spans: [{ input: "different" }] });
    expect(() => runNeutralImport({ ...input, mode: "import", expectedSemanticDigest: first.normalization!.semanticDigest })).toThrow(/source changed/);
  });

  it("bounds record details without shrinking the complete record denominator", () => {
    const input = setup(); json(join(input.inputPath, "events.json"), Array.from({ length: 2005 }, (_, id) => ({ id, input: "task", timestamp: 0 })));
    const map = validateNeutralImport(input).normalization!.recordMapping!;
    expect(map.counts).toMatchObject({ records: 2005, mapped: 2005, mappedTraceLinks: 2005, unlinkedTraces: 0 });
    expect(map.detailCoverage).toMatchObject({ complete: false, emittedRecords: 2000, omittedRecords: 5 });
    expect(map.records).toHaveLength(2000);
    expect(Buffer.byteLength(JSON.stringify(map.records))).toBeLessThan(2_000_000);
  });
});
