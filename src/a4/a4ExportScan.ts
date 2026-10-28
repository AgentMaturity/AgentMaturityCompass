/**
 * P2-02's detectors over A4 exports (P2-36; CISO must-fix §8.1). The binder slice is a hashed projection, so every string
 * it carries runs through `detectProtectedText` and each match is replaced by `hash:<hashAuditId>` of the matched text;
 * a credential match (an API key, a token, a private key) refuses the export instead. The bundle slice carries the rows
 * as stored so a verifier recomputes every digest without a key: its free text is scanned the same way, a credential
 * refuses it, and every other match is counted in `a4/index.json`, never rewritten (that plaintext stays under the
 * operator's control). Detection is P2-02's heuristic set: it misses names and identifiers outside its patterns.
 */
import { detectProtectedText } from "../dataflow/detectors.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";

export interface A4ExportScan {
  /** `<where>: <detector>` for each credential match; any one refuses the export. */
  readonly credentials: string[];
  /** Matches of every other class, counted. */
  readonly counts: Partial<Record<ProtectedDataClass, number>>;
}

/** `text` with each non-credential match replaced by `hash(match)`; credential matches are reported under `where`. */
export function redactExportText(text: string, where: string, hash: (match: string) => string, scan: A4ExportScan): string {
  const merged: Array<{ start: number; end: number }> = [];
  for (const span of detectProtectedText(text)) {
    if (span.dataClass === "credential") {
      scan.credentials.push(`${where}: ${span.detector}`);
      continue;
    }
    scan.counts[span.dataClass] = (scan.counts[span.dataClass] ?? 0) + 1;
    // Spans arrive sorted by start; overlapping ones are replaced as one.
    const last = merged.at(-1);
    if (last !== undefined && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ start: span.start, end: span.end });
  }
  return merged.reduceRight((out, span) => `${out.slice(0, span.start)}${hash(text.slice(span.start, span.end))}${out.slice(span.end)}`, text);
}

/** Every string in `value` (object keys included) through redactExportText, as a new value. */
export function redactExportValue(value: unknown, where: string, hash: (match: string) => string, scan: A4ExportScan): unknown {
  if (typeof value === "string") return redactExportText(value, where, hash, scan);
  if (Array.isArray(value)) return value.map((entry, index) => redactExportValue(entry, `${where}[${index}]`, hash, scan));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [redactExportText(key, `${where}.${key}`, hash, scan),
      redactExportValue(entry, `${where}.${key}`, hash, scan)]));
  }
  return value;
}

export const emptyScan = (): A4ExportScan => ({ credentials: [], counts: {} });
