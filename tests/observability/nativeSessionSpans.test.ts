/** SH-OBS-01: GenAI-shaped spans and metrics for native sessions, OTLP/HTTP JSON export, OTEL_* env, otel-preview. */
import { createServer, type Server } from "node:http";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeSpanFolder } from "../../src/observability/nativeSessionSpans.js";
import { ObservabilityOTELExporter, flushSharedObservabilityExporter, recordFoldOutput, resetSharedObservabilityExporterForTests } from "../../src/observability/otelExporter.js";
import { resolveOtelEnvConfig } from "../../src/observability/otelEnvConfig.js";
import { traceIdFor } from "../../src/observability/otelValues.js";
import { registerOtelPreviewCommand } from "../../src/cli-observability-otel-commands.js";
import { removeWorkspace, runStubSession, sessionEvents, stubWorkspace } from "./helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 120_000 });
const ENV = ["AMC_OTEL_ENABLED", "AMC_OTEL_EXPORTERS", "AMC_OTEL_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_SDK_DISABLED", "OTEL_SERVICE_NAME", "OTEL_RESOURCE_ATTRIBUTES", "AMC_OTEL_FLUSH_MAX_RETRIES"];
const saved = new Map(ENV.map((name) => [name, process.env[name]]));
let ws: string;
const servers: Server[] = [];
const cwd = process.cwd();

beforeEach(() => { for (const name of ENV) delete process.env[name]; resetSharedObservabilityExporterForTests(); ws = stubWorkspace("amc-otel-"); });
afterEach(async () => {
  process.chdir(cwd);
  resetSharedObservabilityExporterForTests();
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  for (const server of servers.splice(0)) await new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
  removeWorkspace(ws);
  vi.restoreAllMocks();
});

async function collector(): Promise<{ base: string; received: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> }> {
  const received: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
    req.on("end", () => { received.push({ path: req.url ?? "", headers: req.headers, body: JSON.parse(body) }); res.writeHead(200).end("{}"); });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("collector did not bind");
  return { base: `http://127.0.0.1:${address.port}`, received };
}

type Span = { name: string; spanId: string; parentSpanId?: string; traceId: string; kind: number; attributes: Array<{ key: string; value: Record<string, unknown> }>; status: { code: number } };
const attrOf = (span: Span, key: string) => span.attributes.find((a) => a.key === key)?.value;

describe("native session span folder", () => {
  it("folds a stub turn with a tool call into invoke_agent -> turn -> chat + execute_tool, synthetic usage, no cost", async () => {
    const { sessionId } = await runStubSession(ws, "read the note", { tools: "workspace" });
    const rows = sessionEvents(ws, sessionId);
    expect(rows.some((row) => row.event_type === "tool/call")).toBe(true);
    const folder = new NativeSpanFolder();
    const spans: Span[] = [], metrics: Array<{ name: string; kind: string; value: number }> = [];
    for (const row of rows) { const out = folder.ingest(row); if (out) { spans.push(...(out.spans as unknown as Span[])); metrics.push(...out.metrics); } }
    expect(folder.size(), "session/close leaves nothing open").toBe(0);
    const agent = spans.find((span) => span.name.startsWith("invoke_agent"))!;
    const turn = spans.find((span) => span.name === "turn 1")!;
    const chats = spans.filter((span) => span.name.startsWith("chat "));
    const tool = spans.find((span) => span.name.startsWith("execute_tool"))!;
    expect(agent.parentSpanId).toBeUndefined();
    expect(turn.parentSpanId).toBe(agent.spanId);
    expect(chats.length).toBeGreaterThanOrEqual(2);
    for (const chat of chats) { expect(chat.parentSpanId).toBe(turn.spanId); expect(chat.kind).toBe(3); expect(attrOf(chat, "gen_ai.request.model")).toEqual({ stringValue: "amc-stub-1" }); expect(attrOf(chat, "amc.usage.status")).toEqual({ stringValue: "synthetic" }); }
    expect(tool.parentSpanId).toBe(turn.spanId);
    expect(attrOf(tool, "gen_ai.tool.name")).toEqual({ stringValue: "fs.read" });
    expect(attrOf(tool, "gen_ai.tool.type")).toEqual({ stringValue: "function" });
    expect(new Set(spans.map((span) => span.traceId)).size).toBe(1);
    expect(spans[0]!.traceId).toBe(traceIdFor(sessionId));
    // Stub zeros are synthetic: never exported as observed tokens or cost (the fabrication rule).
    expect(spans.flatMap((span) => span.attributes).some((a) => a.key.startsWith("gen_ai.usage.") || a.key === "amc.cost.usd")).toBe(false);
    expect(metrics.filter((point) => point.name.startsWith("gen_ai.client.inference.usage") || point.name === "amc.request.cost.usd")).toHaveLength(0);
    expect(metrics.filter((point) => point.name === "gen_ai.client.operation.duration")).toHaveLength(chats.length);
    expect(metrics.filter((point) => point.name === "amc.tool.duration")).toHaveLength(1);
    // Mutation check: a non-native row is never folded.
    expect(folder.ingest({ ...rows[0]!, meta_json: JSON.stringify({ agentId: "x" }) })).toBeNull();
  });

  it("derives trace ids from sha256 so a non-hex session id neither collides nor collapses to all zeros", () => {
    expect(traceIdFor("zzz")).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIdFor("zzz")).not.toBe("0".repeat(32));
    expect(traceIdFor("zzz")).not.toBe(traceIdFor("zzzz"));
  });

  it("emits open spans as unterminated on drain and marks recovery closers interrupted", async () => {
    const { sessionId } = await runStubSession(ws, "hello");
    const rows = sessionEvents(ws, sessionId).filter((row) => row.event_type !== "session/close" && row.event_type !== "turn/end");
    const folder = new NativeSpanFolder();
    for (const row of rows) folder.ingest(row);
    const drained = folder.drain(Date.now());
    const names = drained.spans.map((span) => span.name);
    expect(names).toContain("turn 1");
    expect(drained.spans.every((span) => span.attributes.some((a) => a.key === "amc.span.unterminated" && a.value.boolValue === true))).toBe(true);
    expect(folder.size()).toBe(0);
  });
});

describe("exporter metrics and env", () => {
  it("aggregates two same-stream increments into one delta point and builds histograms", () => {
    const exporter = new ObservabilityOTELExporter({ enabled: false, targets: [{ kind: "otlp", endpoint: "http://127.0.0.1:4318" }] });
    const attributes = [{ key: "gen_ai.request.model", value: { stringValue: "m" } }];
    exporter.recordMetricPoint({ kind: "sum", name: "gen_ai.client.inference.usage.input_tokens", unit: "{token}", value: 3, attributes });
    exporter.recordMetricPoint({ kind: "sum", name: "gen_ai.client.inference.usage.input_tokens", unit: "{token}", value: 4, attributes });
    exporter.recordMetricPoint({ kind: "histogram", name: "gen_ai.client.operation.duration", unit: "s", value: 0.5, attributes });
    const metrics = exporter.previewRequests().find((r) => r.signal === "metrics")!.payload as { resourceMetrics: Array<{ scopeMetrics: Array<{ metrics: Array<Record<string, any>> }> }> };
    const list = metrics.resourceMetrics[0]!.scopeMetrics[0]!.metrics;
    const sum = list.find((m) => m.name === "gen_ai.client.inference.usage.input_tokens")!;
    expect(sum.sum.aggregationTemporality).toBe(1);
    expect(sum.sum.isMonotonic).toBe(true);
    expect(sum.sum.dataPoints).toHaveLength(1);
    expect(sum.sum.dataPoints[0].asDouble).toBe(7);
    expect(sum.sum.dataPoints[0].startTimeUnixNano).toBeDefined();
    const histogram = list.find((m) => m.name === "gen_ai.client.operation.duration")!;
    expect(histogram.histogram.dataPoints[0].count).toBe(1);
    expect(histogram.histogram.dataPoints[0].bucketCounts.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    expect(histogram.histogram.dataPoints[0].explicitBounds.length + 1).toBe(histogram.histogram.dataPoints[0].bucketCounts.length);
  });

  it("honours OTEL_* variables with AMC_OTEL_* precedence, OTEL_SDK_DISABLED and an unsupported protocol fail closed", () => {
    expect(resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318", OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20abc,x=1", OTEL_SERVICE_NAME: "svc", OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=dev" }))
      .toMatchObject({ disabledReason: null, config: { enabled: true, serviceName: "svc", resourceAttributes: { "deployment.environment": "dev" }, targets: [{ kind: "otlp", endpoint: "http://c:4318", headers: { authorization: "Bearer abc", x: "1" } }] } });
    expect(resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1", AMC_OTEL_EXPORTERS: "otlp", AMC_OTEL_OTLP_ENDPOINT: "http://a:1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://b:2" }).config.targets[0]!.endpoint).toBe("http://a:1");
    expect(resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://t/custom/traces" }).config.targets[0]!.signalEndpoints).toEqual({ traces: "http://t/custom/traces" });
    expect(resolveOtelEnvConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318" }).config.enabled, "AMC_OTEL_ENABLED is the only on switch").toBe(false);
    expect(resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318", OTEL_SDK_DISABLED: "true" })).toMatchObject({ config: { enabled: false }, disabledReason: "OTEL_SDK_DISABLED is set" });
    const grpc = resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4317", OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" });
    expect(grpc.config.enabled).toBe(false);
    expect(grpc.disabledReason).toContain("grpc");
    expect(resolveOtelEnvConfig({ AMC_OTEL_ENABLED: "1" }).disabledReason).toContain("no exporter target");
  });
});

describe("end to end: a stub run exports a GenAI trace to a loopback OTLP collector", () => {
  it("sends traces and metrics with OTEL headers, never prints header values, and the preview matches offline", async () => {
    const { base, received } = await collector();
    process.env.AMC_OTEL_ENABLED = "1";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = base;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "authorization=Bearer%20top-secret-token";
    process.env.AMC_OTEL_FLUSH_MAX_RETRIES = "0";
    resetSharedObservabilityExporterForTests();
    const { sessionId } = await runStubSession(ws, "hello", { tools: "workspace" });
    await flushSharedObservabilityExporter({ budgetMs: 5_000 });
    // session/close triggers a flush of its own; wait for both to land.
    for (let i = 0; i < 50 && !received.some((r) => r.path === "/v1/metrics"); i += 1) await new Promise((done) => setTimeout(done, 50));
    const traces = received.filter((r) => r.path === "/v1/traces");
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0]!.headers.authorization).toBe("Bearer top-secret-token");
    const spans = traces.flatMap((r) => ((r.body as any).resourceSpans[0].scopeSpans[0].spans as Span[]));
    const names = spans.map((span) => span.name);
    expect(names.some((name) => name.startsWith("invoke_agent"))).toBe(true);
    expect(names).toContain("turn 1");
    expect(names).toContain("chat amc-stub-1");
    expect(names.some((name) => name.startsWith("execute_tool"))).toBe(true);
    expect(names.some((name) => name.startsWith("amc.evidence.")), "native rows are folded, not emitted as 1 ms evidence spans").toBe(false);
    const json = JSON.stringify(received);
    expect(json).not.toContain("hello"); // no prompt content leaves the process
    const metricsBodies = received.filter((r) => r.path === "/v1/metrics");
    expect(metricsBodies.length).toBeGreaterThan(0);
    const metricNames = metricsBodies.flatMap((r) => ((r.body as any).resourceMetrics[0].scopeMetrics[0].metrics as Array<{ name: string }>).map((m) => m.name));
    expect(metricNames).toContain("gen_ai.client.operation.duration");
    expect(metricNames.some((name) => name.startsWith("gen_ai.client.inference.usage")), "stub usage is synthetic: no token sums").toBe(false);

    // otel-preview prints the same span tree offline and never the header value or the endpoint's full URL.
    const program = new Command();
    const observe = program.command("observe");
    registerOtelPreviewCommand(observe);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    process.chdir(ws);
    await program.parseAsync(["observe", "otel-preview", "--session", sessionId, "--json"], { from: "user" });
    const preview = JSON.parse(logs.join("\n")) as { export: string; requests: Array<{ signal: string; endpoint: string; payload: any }> };
    expect(preview.export).toBe("enabled");
    const previewNames = preview.requests.find((r) => r.signal === "traces")!.payload.resourceSpans[0].scopeSpans[0].spans.map((span: Span) => span.name).sort();
    expect(previewNames).toEqual(names.sort());
    expect(logs.join("\n")).not.toContain("top-secret-token");
    expect(preview.requests[0]!.endpoint).toBe(base);
  });
});

describe("recordFoldOutput", () => {
  it("counts a stream cap overflow as dropped, never silently", () => {
    const exporter = new ObservabilityOTELExporter({ enabled: false, maxBufferSize: 1, targets: [{ kind: "otlp", endpoint: "http://127.0.0.1:4318" }] });
    recordFoldOutput(exporter, { spans: [], metrics: [
      { kind: "sum", name: "a", unit: "1", value: 1, attributes: [] },
      { kind: "sum", name: "b", unit: "1", value: 1, attributes: [] }] });
    expect(exporter.getBufferStats().metrics).toBe(1);
  });
});
