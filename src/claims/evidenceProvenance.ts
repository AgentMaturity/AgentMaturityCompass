import type { EvidenceEvent } from "../types.js";

/**
 * Who produced a ledger event. Only "amc-runtime" evidence (AMC observed it itself) may support a
 * positive regulated result; imported, manual, external and synthetic rows are recorded but never
 * admitted as proof. P0-18 owns this table and derives trust tiers from it.
 */
export type EvidenceProducer = "amc-runtime" | "import" | "manual" | "external-report" | "synthetic";

/** Every `meta.source` that is not AMC runtime evidence. Anything absent is amc-runtime. */
export const PRODUCER_BY_SOURCE: Readonly<Record<string, Exclude<EvidenceProducer, "amc-runtime">>> = Object.freeze({
  "dogfood-maturity": "synthetic",
  eval_import: "import",
  import: "import",
  watch: "import",
  attested_ingest: "import",
  chatgpt: "import",
  claude_console: "import",
  gemini_ui: "import",
  generic_json: "import",
  generic_text: "import",
  manual: "manual",
  operator: "manual",
  "feedback.ingest": "manual",
  webhook: "external-report"
});

const metaCache = new WeakMap<object, Record<string, unknown>>();

/** The event's parsed meta, or {} when it is missing or malformed. Cached per event object. */
export function eventMeta(event: Pick<EvidenceEvent, "meta_json">): Record<string, unknown> {
  const cached = metaCache.get(event);
  if (cached) return cached;
  let meta: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(event.meta_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
  } catch {
    // malformed meta claims nothing
  }
  metaCache.set(event, meta);
  return meta;
}

export function evidenceProducer(event: Pick<EvidenceEvent, "meta_json">): EvidenceProducer {
  const meta = eventMeta(event);
  if (meta.provenance === "dogfood" || meta.claimKind === "synthetic_example") return "synthetic";
  const source = meta.source;
  const producer = typeof source === "string" && Object.hasOwn(PRODUCER_BY_SOURCE, source) ? PRODUCER_BY_SOURCE[source] : undefined;
  return producer ?? "amc-runtime";
}
