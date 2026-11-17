// NativeSpanFolder (src/observability/nativeSessionSpans.ts) on hand-built session rows: the error and orphan paths a
// stub session never takes (failed turns, failed tools and requests, retries, release reasons, eviction, foreign rows).
import { describe, expect, it } from "vitest";
import { NativeSpanFolder } from "../src/observability/nativeSessionSpans.js";
import { SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";
import { traceIdFor, type OTelMetricPoint, type OTelSpan } from "../src/observability/otelValues.js";
import type { EvidenceEvent } from "../src/types.js";

let seq = 0;
function row(sessionId: string, eventType: string, meta: Record<string, unknown>, ts: number, opts: { turn?: number | null; synthetic?: boolean } = {}): EvidenceEvent {
  seq += 1;
  const envelope = { v: 1, sessionId, seq, prevSessionEventHash: "0".repeat(64), turn: opts.turn ?? null, step: null, synthetic: opts.synthetic ?? false, surface: { op: "none" } };
  return { id: `ev-${seq}`, ts, session_id: sessionId, runtime: "unknown", event_type: eventType, payload_path: null, payload_inline: null,
    payload_sha256: "0".repeat(64), meta_json: JSON.stringify({ [SESSION_ENVELOPE_META_KEY]: envelope, ...meta }), prev_event_hash: "", event_hash: "", writer_sig: "" } as unknown as EvidenceEvent;
}
const attr = (span: OTelSpan, key: string) => span.attributes.find((a) => a.key === key)?.value;
function feed(folder: NativeSpanFolder, rows: EvidenceEvent[]) {
  const spans: OTelSpan[] = []; const metrics: OTelMetricPoint[] = [];
  for (const event of rows) { const out = folder.ingest(event); if (out) { spans.push(...out.spans); metrics.push(...out.metrics); } }
  return { spans, metrics };
}
const header = { model: "example-model", providerId: "example-provider", params: {}, encoderId: "enc", encoderVersion: 1, systemPromptEventId: "sys",
  toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: "cut", projectionDigest: "d".repeat(64), sourceEventIds: [], requestDigest: "r".repeat(64) };

describe("NativeSpanFolder on hand-built rows", () => {
  it("returns null for a row without a session envelope", () => {
    const folder = new NativeSpanFolder();
    const foreign = { ...row("s0", "session/open", {}, 1), meta_json: JSON.stringify({ agentId: "x" }) };
    expect(folder.ingest(foreign)).toBeNull();
    expect(folder.ingest({ ...foreign, meta_json: "not json" })).toBeNull();
    expect(folder.size()).toBe(0);
  });

  it("a failed tool, a failed turn, a retry event and a release with its reason each land on the right span", () => {
    const folder = new NativeSpanFolder();
    const { spans, metrics } = feed(folder, [
      row("s1", "session/open", { agentId: "agent-z", harnessVersion: "h1" }, 1_000),
      row("s1", "turn/start", { turn: 1, trigger: "user" }, 1_100, { turn: 1 }),
      row("s1", "loop/retry", { attempt: 2 }, 1_150, { turn: 1 }),
      row("s1", "tool/call", { toolCallId: "c1", toolName: "shell.run", dispatch: "native", argsSha256: "a".repeat(64) }, 1_200, { turn: 1 }),
      row("s1", "tool/result", { toolCallId: "c1", outcome: "ERROR", exitCode: 2, timedOut: true, denied: false }, 1_700, { turn: 1 }),
      // A result for a call that was never opened is ignored, as is a turn end for a turn that never started.
      row("s1", "tool/result", { toolCallId: "nobody", outcome: "OK" }, 1_710, { turn: 1 }),
      row("s1", "turn/end", { turn: 9, reason: "complete" }, 1_720, { turn: 9 }),
      row("s1", "turn/end", { turn: 1, reason: "cancelled" }, 1_800, { turn: 1 }),
      row("s1", "loop/cancel", {}, 1_850),
      row("s1", "session/release", { reason: "handoff" }, 1_900)
    ]);
    expect(folder.size()).toBe(0);
    const tool = spans.find((span) => span.name === "execute_tool shell.run")!;
    expect(tool.status).toEqual({ code: 2, message: "ERROR" });
    expect(attr(tool, "error.type")).toEqual({ stringValue: "ERROR" });
    expect(attr(tool, "amc.tool.exit_code")).toBeDefined();
    expect(attr(tool, "amc.tool.timed_out")).toEqual({ boolValue: true });
    const turn = spans.find((span) => span.name === "turn 1")!;
    expect(turn.status).toEqual({ code: 2, message: "turn ended cancelled" });
    expect(turn.events.map((event) => event.name)).toEqual(["loop/retry"]);
    const segment = spans.find((span) => span.name === "invoke_agent agent-z")!;
    expect(attr(segment, "amc.session.end")).toEqual({ stringValue: "handoff" });
    expect(segment.events.map((event) => event.name)).toEqual(["loop/cancel"]);
    expect(segment.status).toEqual({ code: 1 });
    expect(metrics.find((metric) => metric.name === "amc.tool.duration")!.value).toBeCloseTo(0.5);
    expect(new Set(spans.map((span) => span.traceId))).toEqual(new Set([traceIdFor("s1")]));
  });

  it("a failed request closes its chat span as an error with no token or cost values, and its duration sets the end", () => {
    const folder = new NativeSpanFolder();
    const open = row("s2", "session/open", { agentId: "agent-r" }, 5_000);
    const head = row("s2", "request/header", header, 5_100);
    const { spans, metrics } = feed(folder, [
      open,
      row("s2", "request/header", { model: 42 }, 5_050),
      head,
      row("s2", "request/response", { headerEventId: "never-opened" }, 5_150),
      row("s2", "request/failure", { headerEventId: head.id, durationMs: 250, failure: { code: "UPSTREAM_TIMEOUT" } }, 9_999),
      row("s2", "session/close", {}, 10_000)
    ]);
    const chat = spans.find((span) => span.name === "chat example-model")!;
    expect(chat.kind).toBe(3);
    expect(chat.status).toEqual({ code: 2, message: "UPSTREAM_TIMEOUT" });
    expect(attr(chat, "error.type")).toEqual({ stringValue: "UPSTREAM_TIMEOUT" });
    expect(chat.endTimeUnixNano).toBe(String(BigInt(5_350) * 1_000_000n));
    expect(chat.attributes.some((a) => a.key.startsWith("gen_ai.usage."))).toBe(false);
    expect(metrics.some((metric) => metric.name === "gen_ai.client.token.usage" || metric.name === "amc.request.cost.usd")).toBe(false);
    const duration = metrics.find((metric) => metric.name === "gen_ai.client.operation.duration")!;
    expect(duration.value).toBeCloseTo(0.25);
    expect(duration.attributes.find((a) => a.key === "error.type")?.value).toEqual({ stringValue: "UPSTREAM_TIMEOUT" });
    expect(spans.filter((span) => span.name.startsWith("chat ")).length).toBe(1);
    expect(attr(spans.find((span) => span.name === "invoke_agent agent-r")!, "amc.session.end")).toEqual({ stringValue: "close" });
  });

  it("a second open closes the first segment as unterminated; a synthetic closer marks spans interrupted", () => {
    const folder = new NativeSpanFolder();
    const { spans } = feed(folder, [
      row("s3", "session/open", { agentId: "agent-a" }, 100),
      row("s3", "tool/call", { toolName: "fs.read" }, 110),
      row("s3", "session/resume", {}, 200),
      row("s3", "session/release", {}, 300, { synthetic: true })
    ]);
    const first = spans.find((span) => span.name === "invoke_agent agent-a" && attr(span, "amc.session.segment")?.stringValue === "open")!;
    expect(attr(first, "amc.span.unterminated")).toEqual({ boolValue: true });
    const tool = spans.find((span) => span.name === "execute_tool fs.read")!;
    expect(attr(tool, "amc.span.unterminated")).toEqual({ boolValue: true });
    expect(attr(tool, "amc.span.interrupted")).toEqual({ boolValue: true });
    const second = spans.find((span) => attr(span, "amc.session.segment")?.stringValue === "resume")!;
    expect(attr(second, "amc.session.end")).toEqual({ stringValue: "release" });
    expect(attr(second, "amc.span.interrupted")).toEqual({ boolValue: true });
  });

  it("past its session limit it evicts the oldest session's open spans as unterminated", () => {
    const folder = new NativeSpanFolder(1);
    feed(folder, [row("old", "session/open", { agentId: "agent-old" }, 1), row("old", "turn/start", {}, 2, { turn: 4 })]);
    expect(folder.size()).toBe(2);
    const out = folder.ingest(row("new", "session/open", { agentId: "agent-new" }, 3))!;
    expect(out.spans.map((span) => span.name).sort()).toEqual(["invoke_agent agent-old", "turn 4"]);
    for (const span of out.spans) { expect(span.traceId).toBe(traceIdFor("old")); expect(attr(span, "amc.span.unterminated")).toEqual({ boolValue: true }); }
    expect(folder.size()).toBe(1);
    expect(folder.drain(50).spans.map((span) => span.name)).toEqual(["invoke_agent agent-new"]);
    expect(folder.size()).toBe(0);
  });
});
