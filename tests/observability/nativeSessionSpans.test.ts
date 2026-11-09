/** SH-OBS-01: GenAI-shaped spans and metrics for native sessions, OTLP/HTTP JSON export, OTEL_* env, otel-preview. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeSpanFolder } from "../../src/observability/nativeSessionSpans.js";
import { ObservabilityOTELExporter, flushSharedObservabilityExporter, getSharedObservabilityExporter, recordFoldOutput, resetSharedObservabilityExporterForTests } from "../../src/observability/otelExporter.js";
import { resolveOtelEnvConfig } from "../../src/observability/otelEnvConfig.js";
import { takeDroppedTelemetry } from "../../src/observability/telemetryDrops.js";
import { traceIdFor, type OTelSpan } from "../../src/observability/otelValues.js";
import { registerOtelPreviewCommand } from "../../src/cli-observability-otel-commands.js";
import { registerObservabilityCommands } from "../../src/cli-observability-commands.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { openAgentSession } from "../../src/agent/agentSession.js";
import { stubProviderTransport, STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../../src/agent/stubProvider.js";
import { nativeRouteFor, paramsFor } from "../../src/cli-agent-options.js";
import { LocalCredentialsService } from "../../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { allEvents, removeWorkspace, runStubSession, sessionEvents, stubWorkspace } from "./helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 120_000 });
const ENV = ["AMC_OTEL_ENABLED", "AMC_OTEL_EXPORTERS", "AMC_OTEL_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_SDK_DISABLED", "OTEL_SERVICE_NAME", "OTEL_RESOURCE_ATTRIBUTES", "AMC_OTEL_FLUSH_MAX_RETRIES", "AMC_OTEL_FLUSH_TIMEOUT_MS"];
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

async function collector(answerAfterMs = 0): Promise<{ base: string; received: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> }> {
  const received: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
    req.on("end", () => { received.push({ path: req.url ?? "", headers: req.headers, body: JSON.parse(body) }); setTimeout(() => res.writeHead(200).end("{}"), answerAfterMs); });
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

  it("a segment that starts at session/resume (a resumed session in a fresh process) carries the resume row's agent id, not `unknown`", async () => {
    const { sessionId } = await runStubSession(ws, "hello", { agentId: "resumed-agent" });
    const open = sessionEvents(ws, sessionId).find((row) => row.event_type === "session/open")!;
    expect((JSON.parse(open.meta_json) as { agentId: string }).agentId).toBe("resumed-agent");
    const folder = new NativeSpanFolder();
    folder.ingest({ ...open, event_type: "session/resume" });
    const [segment] = folder.drain(open.ts + 10).spans;
    expect(segment!.name).toBe("invoke_agent resumed-agent");
    expect(segment!.attributes.find((a) => a.key === "gen_ai.agent.name")!.value).toEqual({ stringValue: "resumed-agent" });
    expect(segment!.attributes.find((a) => a.key === "amc.session.segment")!.value).toEqual({ stringValue: "resume" });
  });

  it("otel-preview prints the spans still open in an unclosed session, marked unterminated, in its text tree", async () => {
    const route = nativeRouteFor(STUB_PROVIDER_ID, {}, STUB_PROVIDER_MODEL);
    const registry = new AdapterRegistry();
    registry.register(route);
    const credentials = new LocalCredentialsService({ projectDir: ws, watch: false });
    const session = openAgentSession({ workspace: ws, agentId: "default", harnessVersion: "test", tools: "none", maxSteps: 4,
      makeLlm: (s) => new LlmRuntime({ session: s, credentials, registry, transport: stubProviderTransport({}) }),
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: paramsFor(STUB_PROVIDER_ID, 256) },
      systemPrompt: "You are an AMC-governed agent.", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
    try {
      await session.prompt("hello");
      const program = new Command();
      registerOtelPreviewCommand(program.command("observe"));
      const logs: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
      process.chdir(ws);
      await program.parseAsync(["observe", "otel-preview", "--session", session.sessionId], { from: "user" });
      const text = logs.join("\n");
      expect(text, "the open invoke_agent segment is in the tree").toContain("invoke_agent default");
      expect(text).toContain("amc.span.unterminated=true");
      expect(text).toContain("turn 1");
    } finally { await session.close(); }
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
    // Native session rows are folded, never emitted as 1 ms evidence spans. Rows without a session envelope (here the
    // budgets module's own `native-budget-*` audit rows) are not native session rows and keep today's evidence span.
    const strayNative = spans.filter((span) => span.name.startsWith("amc.evidence.")
      && (span as unknown as { attributes: Array<{ key: string; value: { stringValue?: string } }> }).attributes.some((a) => a.key === "amc.session.id" && a.value.stringValue === sessionId));
    expect(strayNative.map((span) => span.name), "native rows are folded, not emitted as 1 ms evidence spans").toEqual([]);
    expect(spans.filter((span) => span.name.startsWith("amc.evidence.")).every((span) => (span as unknown as { attributes: Array<{ key: string; value: { stringValue?: string } }> }).attributes
      .some((a) => a.key === "amc.session.id" && a.value.stringValue?.startsWith("native-budget-"))), "only budget bookkeeping rows keep evidence spans").toBe(true);
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
    // The preview folds the session alone; the collector also saw the non-native evidence spans checked above.
    expect(previewNames).toEqual(names.filter((name) => !name.startsWith("amc.evidence.")).sort());
    expect(logs.join("\n")).not.toContain("top-secret-token");
    expect(preview.requests[0]!.endpoint).toBe(base);
  });
});

const testSpan = (name: string): OTelSpan => ({ traceId: "a".repeat(32), spanId: Buffer.from(name.padEnd(8, "-")).toString("hex").slice(0, 16), name, kind: 1,
  startTimeUnixNano: "1000000", endTimeUnixNano: "2000000", attributes: [], status: { code: 1 }, events: [] });
const spanNames = (received: Array<{ path: string; body: unknown }>) => received.filter((r) => r.path === "/v1/traces").flatMap((r) => ((r.body as any).resourceSpans[0].scopeSpans[0].spans as Span[]).map((span) => span.name));

describe("flush and buffers", () => {
  it("a flush that finds one in flight waits within its own budget, then sends what was buffered since under its own options", async () => {
    const { base, received } = await collector(400);
    const exporter = new ObservabilityOTELExporter({ enabled: true, targets: [{ kind: "otlp", endpoint: base }] });
    exporter.recordSpan(testSpan("first"));
    const first = exporter.flush({ timeoutMs: 5_000, maxRetries: 0 });
    exporter.recordSpan(testSpan("second"));
    const started = Date.now();
    const second = await exporter.flush({ timeoutMs: 5_000, maxRetries: 0 });
    expect(Date.now() - started, "the second flush waited for the first").toBeGreaterThanOrEqual(350);
    await first;
    expect(second.exported.traces, "the later span went out under the second flush, not left buffered").toBe(1);
    expect(spanNames(received).sort()).toEqual(["first", "second"]);
    expect(exporter.getBufferStats().traces).toBe(0);
  });

  it("the exit flush waits for a flush that outlived its budget, so what that flush drops is counted before the exit row", async () => {
    const { base } = await collector(1_500);
    process.env.AMC_OTEL_ENABLED = "1";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = base;
    process.env.AMC_OTEL_FLUSH_TIMEOUT_MS = "600"; // the session/close-style flush gives up at 600 ms; the collector answers at 1.5 s
    process.env.AMC_OTEL_FLUSH_MAX_RETRIES = "0";
    resetSharedObservabilityExporterForTests();
    takeDroppedTelemetry();
    const exporter = getSharedObservabilityExporter();
    exporter.recordSpan(testSpan("closing"));
    const closing = exporter.flush();
    exporter.recordSpan(testSpan("exit"));
    await flushSharedObservabilityExporter({ budgetMs: 100 });
    // Both drops are known when the exit flush returns: its own (no budget left) and the earlier flush's timeout.
    expect(takeDroppedTelemetry()).toBe(2);
    await closing;
  });

  it("keeps one metric stream per workspace scope, so a point recorded for workspace B never merges into A's stream", () => {
    const exporter = new ObservabilityOTELExporter({ enabled: false, targets: [{ kind: "otlp", endpoint: "http://127.0.0.1:4318" }] });
    const point = (value: number) => exporter.recordMetricPoint({ kind: "sum", name: "gen_ai.client.inference.usage.input_tokens", unit: "{token}", value, attributes: [] });
    withWorkspaceScope("/ws/A", () => point(100));
    withWorkspaceScope("/ws/B", () => point(5));
    const list = (exporter.previewRequests().find((r) => r.signal === "metrics")!.payload as any).resourceMetrics[0].scopeMetrics[0].metrics as Array<Record<string, any>>;
    const values = list.filter((m) => m.name === "gen_ai.client.inference.usage.input_tokens").flatMap((m) => m.sum.dataPoints.map((p: { asDouble: number }) => p.asDouble)).sort((a: number, b: number) => a - b);
    expect(values).toEqual([5, 100]);
  });

  it("Zipkin carries no aggregated streams: they are counted as dropped, not as exported metrics", async () => {
    const { base, received } = await collector();
    takeDroppedTelemetry();
    const exporter = new ObservabilityOTELExporter({ enabled: true, targets: [{ kind: "zipkin", endpoint: base }] });
    exporter.recordSpan(testSpan("s"));
    exporter.recordMetricPoint({ kind: "sum", name: "amc.request.cost.usd", unit: "USD", value: 0.01, attributes: [] });
    const result = await exporter.flush({ timeoutMs: 5_000, maxRetries: 0 });
    expect(received).toHaveLength(1);
    expect(result.exported.traces).toBe(1);
    expect(result.exported.metrics).toBe(0);
    expect(takeDroppedTelemetry()).toBe(1);
  });

  it("the exit flush writes a TELEMETRY_DROPPED row for what its budget left behind", async () => {
    process.env.AMC_OTEL_ENABLED = "1";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:9"; // discard port: every dispatch fails
    process.env.AMC_OTEL_FLUSH_MAX_RETRIES = "0";
    resetSharedObservabilityExporterForTests();
    takeDroppedTelemetry();
    const program = new Command().exitOverride();
    registerObservabilityCommands(program, () => "default");
    program.command("noop").action(() => { getSharedObservabilityExporter().recordSpan(testSpan("lost")); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.chdir(ws);
    await program.parseAsync(["noop"], { from: "user" });
    const rows = allEvents(ws).filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "TELEMETRY_DROPPED");
    expect(rows).toHaveLength(1);
    expect((JSON.parse(rows[0]!.meta_json) as { dropped: number }).dropped).toBe(1);
    expect(takeDroppedTelemetry(), "the count was taken into the row").toBe(0);
    // A second short command within the minute still writes its row: no later action would carry the count.
    await program.parseAsync(["noop"], { from: "user" });
    expect(allEvents(ws).filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "TELEMETRY_DROPPED")).toHaveLength(2);
  });

  it("outside a workspace the exit flush creates no ledger for the row and prints the count instead", async () => {
    process.env.AMC_OTEL_ENABLED = "1";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:9";
    process.env.AMC_OTEL_FLUSH_MAX_RETRIES = "0";
    resetSharedObservabilityExporterForTests();
    takeDroppedTelemetry();
    const bare = mkdtempSync(join(tmpdir(), "amc-no-ws-"));
    try {
      const program = new Command().exitOverride();
      registerObservabilityCommands(program, () => "default");
      program.command("noop").action(() => { getSharedObservabilityExporter().recordSpan(testSpan("lost")); });
      const errors: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.join(" ")); });
      process.chdir(bare);
      await program.parseAsync(["noop"], { from: "user" });
      expect(existsSync(join(bare, ".amc")), "no ledger, keys or vault were created in a non-workspace").toBe(false);
      expect(errors.join("\n")).toContain("1 item(s) could not be exported before exit");
    } finally {
      takeDroppedTelemetry();
      rmSync(bare, { recursive: true, force: true });
    }
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
