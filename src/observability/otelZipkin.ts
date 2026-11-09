/** Zipkin v2 projection of one buffered batch (moved out of otelExporter.ts unchanged, SH-OBS-01). */
import type { OTelAttribute, OTelSpan } from "./otelValues.js";
import { sha256Hex } from "../utils/hash.js";

export interface ZipkinBatch {
  spans: OTelSpan[];
  metrics: Array<{ metricName: string; unit: string; ts: number; value: number; attributes: OTelAttribute[] }>;
  logs: Array<{ ts: number; severityText: string; body: string; attributes: OTelAttribute[] }>;
}

function tagsOf(attributes: readonly OTelAttribute[], base: Record<string, string>): Record<string, string> {
  const tags = { ...base };
  for (const attribute of attributes) {
    const value = attribute.value.stringValue ?? attribute.value.doubleValue ?? attribute.value.intValue ?? attribute.value.boolValue;
    tags[attribute.key] = value === undefined ? "" : String(value);
  }
  return tags;
}

export function toZipkinSpans(batch: ZipkinBatch, serviceName: string): Array<Record<string, unknown>> {
  const localEndpoint = { serviceName };
  const spans: Array<Record<string, unknown>> = batch.spans.map((span) => ({
    traceId: span.traceId,
    id: span.spanId,
    parentId: span.parentSpanId,
    name: span.name,
    timestamp: Math.floor(Number(span.startTimeUnixNano) / 1000),
    duration: Math.max(1, Math.floor((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1000)),
    localEndpoint,
    tags: tagsOf(span.attributes, {})
  }));
  for (const metric of batch.metrics) {
    spans.push({
      traceId: sha256Hex(metric.metricName).slice(0, 32),
      id: sha256Hex(`${metric.metricName}-${metric.ts}`).slice(0, 16),
      parentId: undefined,
      name: `amc.metric.${metric.metricName}`,
      timestamp: metric.ts * 1000,
      duration: 1,
      localEndpoint,
      tags: tagsOf(metric.attributes, { "amc.metric.name": metric.metricName, "amc.metric.unit": metric.unit, "amc.metric.value": String(metric.value) })
    });
  }
  for (const entry of batch.logs) {
    spans.push({
      traceId: sha256Hex(entry.body).slice(0, 32),
      id: sha256Hex(`${entry.ts}`).slice(0, 16),
      parentId: undefined,
      name: "amc.incident.log",
      timestamp: entry.ts * 1000,
      duration: 1,
      localEndpoint,
      tags: tagsOf(entry.attributes, { "amc.log.severity": entry.severityText, "amc.log.message": entry.body })
    });
  }
  return spans;
}
