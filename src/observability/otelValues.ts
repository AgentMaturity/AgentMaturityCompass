/**
 * OTLP/JSON value shapes shared by the exporter and the native session span folder.
 * Kept dependency-free so the folder (pure) and the exporter (I/O) never import each other.
 */
import { sha256Hex } from "../utils/hash.js";

interface OTelAnyValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
}

export interface OTelAttribute {
  key: string;
  value: OTelAnyValue;
}

export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  /** OTLP SpanKind: 1 INTERNAL, 2 SERVER, 3 CLIENT, 4 PRODUCER, 5 CONSUMER. */
  kind: number;
  attributes: OTelAttribute[];
  status: { code: number; message?: string };
  events: Array<{ name: string; timeUnixNano: string; attributes: OTelAttribute[] }>;
}

/** One increment of a delta sum or one histogram observation; aggregated per flush by the exporter. */
export interface OTelMetricPoint {
  readonly kind: "sum" | "histogram";
  readonly name: string;
  readonly unit: string;
  readonly value: number;
  readonly attributes: readonly OTelAttribute[];
}

export function otelAttr(key: string, value: string | number | boolean | undefined | null): OTelAttribute | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { key, value: { stringValue: value } };
  if (typeof value === "number") return Number.isInteger(value) ? { key, value: { intValue: value } } : { key, value: { doubleValue: value } };
  return { key, value: { boolValue: value } };
}

/** Attributes from candidates, dropping absent values; an absent value is never a zero or an empty string. */
export function otelAttrs(candidates: ReadonlyArray<OTelAttribute | null>): OTelAttribute[] {
  return candidates.filter((candidate): candidate is OTelAttribute => candidate !== null);
}

export function msToNanos(ts: number): string {
  return String(BigInt(Math.max(0, Math.trunc(ts))) * BigInt(1_000_000));
}

/** 16-byte trace id derived from a session id: a resumed or re-exported session lands in the same trace. */
export function traceIdFor(sessionId: string): string {
  return sha256Hex(`amc-trace:${sessionId}`).slice(0, 32);
}

/** 8-byte span id derived from an event id (or any stable seed). */
export function spanIdFor(seed: string): string {
  return sha256Hex(`amc-span:${seed}`).slice(0, 16);
}
