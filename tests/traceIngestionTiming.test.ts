import { expect, test } from "vitest";
import { TraceIngestionPipeline, type ProductionTrace } from "../src/agents/traceIngestion.js";
const trace = (id: string, durationMs: number | null): ProductionTrace => ({ traceId: id, agentId: "default", agentType: "test", input: "hello", output: "A safe complete response.", durationMs, timestamp: Date.now(), metadata: {} });

test("unknown latency stays null and mixed latency averages only measured samples", () => {
  const pipeline = new TraceIngestionPipeline();
  expect(pipeline.getStats().avgLatencyMs).toBeNull();
  pipeline.ingest(trace("unknown", null));
  expect(pipeline.getStats().avgLatencyMs).toBeNull();
  pipeline.ingest(trace("measured", 100));
  expect(pipeline.getStats().avgLatencyMs).toBe(100);
  pipeline.ingest(trace("unknown-2", null));
  expect(pipeline.getStats().avgLatencyMs).toBe(100);
});

test("latency is a lifetime measured average across buffer eviction and scoring early returns", () => {
  const pipeline = new TraceIngestionPipeline({ maxBufferSize: 1, scoreErrors: false });
  pipeline.ingest(trace("first", 100));
  pipeline.ingest({ ...trace("empty", 200), output: "" });
  pipeline.ingest({ ...trace("error", 300), error: true });
  pipeline.ingest(trace("unknown", null));
  for (const [id, ms] of [["negative", -1], ["infinite", Infinity], ["nan", NaN]] as const) pipeline.ingest(trace(id, ms));
  expect(pipeline.getStats().avgLatencyMs).toBe(200);
  pipeline.clear();
  expect(pipeline.getStats().avgLatencyMs).toBeNull();
  pipeline.ingest(trace("zero-is-measured", 0));
  expect(pipeline.getStats().avgLatencyMs).toBe(0);
});

test("measured latency survives invalid metric groups and finite samples whose sum would overflow", () => {
  const pipeline = new TraceIngestionPipeline({ metricGroupId: "missing-group" });
  pipeline.ingest(trace("first", Number.MAX_VALUE));
  pipeline.ingest(trace("second", Number.MAX_VALUE));
  expect(pipeline.getStats().avgLatencyMs).toBe(Number.MAX_VALUE);
});
