/**
 * OSCAL export v0 (P1-28): the pinned OSCAL version, stable ids, the AMC prop namespace and the value helpers every
 * document shares. Field names and patterns come from the NIST OSCAL 1.2.3 JSON schemas; docs/exports/OSCAL.md lists
 * each field used.
 */
import { createHash } from "node:crypto";
import { canonicalize } from "../../utils/json.js";

/** The OSCAL release this export targets. Re-pin deliberately (docs/exports/OSCAL.md); never follow "latest". */
export const OSCAL_VERSION = "1.2.3";
/** The one namespace of every AMC prop and part, on the P1-01 URL base. */
export const AMC_OSCAL_NS = "https://agentmaturity.co/spec/oscal/v0";
/** Fixed namespace for oscalUuid. Changing it changes every exported id. */
const AMC_OSCAL_UUID_NAMESPACE = "502e72b2-14be-4507-8154-dcf6aa03f245";

/** RFC 9562 version 5 UUID of `name` under `namespace`. SHA-1 is what version 5 specifies; it is an id, not a digest. */
export function uuidV5(namespace: string, name: string): string {
  const bytes = createHash("sha1").update(Buffer.from(namespace.replaceAll("-", ""), "hex")).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable across exports: the same kind and AMC id always give the same OSCAL UUID. */
export function oscalUuid(kind: string, amcId: string): string {
  return uuidV5(AMC_OSCAL_UUID_NAMESPACE, `${kind}:${amcId}`);
}

export interface OscalProp { name: string; ns: string; value: string; class?: string; remarks?: string }

/** OSCAL StringDatatype and MarkupLineDatatype refuse line breaks and edge whitespace. */
export const line = (text: string): string => text.replace(/\s+/g, " ").trim();
/** An ISO time as OSCAL DateTimeWithTimezoneDatatype (UTC); throws on an invalid time. */
export const utc = (time: string): string => new Date(time).toISOString();
/** Spreads `{ [key]: items }` only when there are items: OSCAL arrays have minItems 1. */
export const nonEmpty = <T>(key: string, items: readonly T[]): Record<string, T[]> => (items.length > 0 ? { [key]: [...items] } : {});

export const prop = (name: string, value: string, extra: { class?: string; remarks?: string } = {}): OscalProp =>
  ({ name, ns: AMC_OSCAL_NS, value: line(value), ...extra });
/** A structured AMC field as canonical JSON in one prop value, line separators escaped so it stays one line. */
export const jsonProp = (name: string, value: unknown): OscalProp =>
  ({ name, ns: AMC_OSCAL_NS, value: canonicalize(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029") });

export function oscalMetadata(title: string, lastModified: string, version: string, props: OscalProp[], remarks: string) {
  return { title: line(title), "last-modified": utc(lastModified), version: line(version), "oscal-version": OSCAL_VERSION, ...nonEmpty("props", props), remarks };
}

/** Canonical JSON (sorted keys), indented, with a final newline: the same inputs give byte-identical files. */
export const oscalJson = (doc: unknown): string => `${JSON.stringify(JSON.parse(canonicalize(doc)), null, 2)}\n`;
