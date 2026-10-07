/** Pure admission/replay rules for one atomic origin-addressed surface edit. */
import { z } from "zod";
import type { ClaimKind } from "../claims/eligibility/types.js";
import type { EvidenceEvent } from "../types.js";
import type { SurfaceEntry } from "./surfaceProjection.js";
import type { SessionEnvelope, SurfaceOp, TokenUsage } from "./sessionTypes.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();
/** Adapters report DISJOINT counts (StreamTokenUsage), so the prompt is their sum. Never estimated from bytes. */
export const PROMPT_TOKENS_FORMULA = "inputTokens+cacheRead+cacheWrite";
export function promptTokensFor(usage: TokenUsage | null): number | null {
  if (usage === null) return null;
  const tokens = usage.inputTokens + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  return Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null;
}
/** A model-written summary is the agent's own statement, never evidence of what happened. */
export const SUMMARY_CLAIM_KIND = "self_reported" satisfies ClaimKind;
const receiptFields = {
  mode: z.enum(["replace", "summarize", "drop"]), reason: z.string().min(1).max(2048),
  basis: z.object({ sessionId: z.string().min(1), eventId: z.string().min(1), eventHash: hash, seq: z.number().int().nonnegative() }).strict(),
  sources: z.array(z.object({ originEventId: z.string().min(1), sourceEventId: z.string().min(1),
    sourceEventHash: hash, payloadSha256: hash, bytes: count }).strict()).min(1).max(256),
  replacedBytes: count, replacementBytes: z.number().int().nonnegative().max(1_000_000).safe(),
  savedBytes: z.number().int().positive().safe(), measurement: z.literal("payload-bytes-not-tokens")
};
/** v2 = automatic: the measurement that fired it and, for a summary, the signed request that wrote it. */
const automaticFields = {
  trigger: z.object({ kind: z.literal("automatic"), promptTokens: count, contextWindowTokens: z.number().int().positive().safe(),
    threshold: z.number().min(0.5).max(0.95), ratio: z.number().nonnegative(), measuredAtEventId: z.string().min(1),
    formula: z.literal(PROMPT_TOKENS_FORMULA) }).strict(),
  summarizer: z.object({ requestHeaderEventId: z.string().min(1), promptVersion: z.number().int().positive().safe(),
    model: z.string().min(1), claimKind: z.literal(SUMMARY_CLAIM_KIND) }).strict().optional()
};
export const surfaceCompactionReceiptSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), ...receiptFields }).strict(),
  z.object({ v: z.literal(2), ...receiptFields, ...automaticFields }).strict()
]);
export type SurfaceCompactionReceipt = z.infer<typeof surfaceCompactionReceiptSchema>;
export type AutomaticCompaction = Pick<Extract<SurfaceCompactionReceipt, { v: 2 }>, "trigger" | "summarizer">;
export type SurfaceCompactionOp = Extract<SurfaceOp, { op: "compact" }>;

export function selectCompactionEntries(entries: readonly SurfaceEntry[], origins: readonly string[], mode: SurfaceCompactionReceipt["mode"]): readonly SurfaceEntry[] {
  if (!Array.isArray(origins) || !origins.length || origins.length > 256 || new Set(origins).size !== origins.length) throw new Error("compaction requires unique ordered origins");
  const start = entries.findIndex(entry => entry.originEventId === origins[0]);
  const selected = start < 0 ? [] : entries.slice(start, start + origins.length);
  if (selected.length !== origins.length || selected.some((entry, index) => entry.originEventId !== origins[index])) {
    throw new Error("compaction origins must name a contiguous live range in this session; missing, reordered or foreign origins refuse");
  }
  if (selected.some(entry => entry.role === "system")) throw new Error("system prompts cannot be compacted through conversation history");
  if (mode === "replace" && (selected.length !== 1 || ["tool_use", "image"].includes(selected[0]!.part.kind))) {
    throw new Error("single-entry compaction cannot rewrite executable tool arguments or image bytes");
  }
  const selectedIds = new Set(origins);
  for (const entry of selected) {
    if (entry.part.kind !== "tool_use" && entry.part.kind !== "tool_result") continue;
    const prefix = `${entry.part.kind}:`;
    if (!entry.slot.startsWith(prefix)) throw new Error("tool surface entry has no unambiguous call identity");
    const id = entry.slot.slice(prefix.length);
    const uses = entries.filter(candidate => candidate.part.kind === "tool_use" && candidate.slot === `tool_use:${id}`);
    const results = entries.filter(candidate => candidate.part.kind === "tool_result" && candidate.slot === `tool_result:${id}`);
    if (uses.length !== 1 || results.length !== 1) throw new Error("compaction requires one completed, unambiguous tool call/result pair");
    if (mode !== "replace" && (!selectedIds.has(uses[0]!.originEventId) || !selectedIds.has(results[0]!.originEventId))) {
      throw new Error("compaction cannot orphan a tool call or tool result; select the complete pair in one range");
    }
  }
  return selected;
}

export function parseCompactionReceipt(raw: unknown): SurfaceCompactionReceipt {
  const parsed = surfaceCompactionReceiptSchema.safeParse(raw);
  if (!parsed.success) throw new Error("compaction requires a supported, complete measurement receipt");
  if (parsed.data.v === 2 && (parsed.data.mode === "summarize") !== (parsed.data.summarizer !== undefined)) {
    throw new Error("an automatic range summary, and only a summary, must name its signed summarizer request");
  }
  return parsed.data;
}

export function compactionReceipt(event: EvidenceEvent): SurfaceCompactionReceipt {
  let raw: unknown;
  try { raw = JSON.parse(event.meta_json).compaction; } catch { throw new Error("compaction has malformed metadata"); }
  return parseCompactionReceipt(raw);
}

const usageSchema = z.object({ inputTokens: count, outputTokens: count, cacheRead: count.nullable(), cacheWrite: count.nullable() }).strict();
/**
 * A v2 receipt's provenance is re-derived from earlier signed rows of the same
 * session, never taken on the receipt's word: its trigger must equal the usage
 * on the `step/end` it cites, and a summary must cite a real `request/header`
 * whose model it names.
 */
export function assertAutomaticProvenance(receipt: SurfaceCompactionReceipt, prior: ReadonlyMap<string, EvidenceEvent>, sessionId: string): void {
  if (receipt.v !== 2) return;
  const { trigger, summarizer } = receipt, measured = prior.get(trigger.measuredAtEventId);
  const usage = measured?.event_type === "step/end" && measured.session_id === sessionId
    ? usageSchema.safeParse((JSON.parse(measured.meta_json) as { usage?: unknown }).usage) : null;
  if (!usage?.success || promptTokensFor(usage.data) !== trigger.promptTokens
    || trigger.ratio !== trigger.promptTokens / trigger.contextWindowTokens || trigger.ratio < trigger.threshold) {
    throw new Error("automatic compaction trigger disagrees with the signed step usage it cites");
  }
  if (summarizer === undefined) return;
  const header = prior.get(summarizer.requestHeaderEventId);
  if (header?.event_type !== "request/header" || header.session_id !== sessionId
    || (JSON.parse(header.meta_json) as { model?: unknown }).model !== summarizer.model) {
    throw new Error("automatic summary does not cite its own signed summarizer request");
  }
}

export function applySurfaceCompaction(entries: readonly SurfaceEntry[], event: EvidenceEvent, envelope: SessionEnvelope): readonly SurfaceEntry[] {
  const op = envelope.surface;
  if (op.op !== "compact" || event.event_type !== "loop/compact") throw new Error("invalid compaction event type");
  const receipt = compactionReceipt(event);
  if (receipt.basis.sessionId !== event.session_id || envelope.sessionId !== event.session_id
    || receipt.basis.seq !== envelope.seq - 1 || receipt.basis.eventHash !== envelope.prevSessionEventHash) throw new Error("compaction basis does not match its session head");
  const selected = selectCompactionEntries(entries, op.origins, receipt.mode);
  if (receipt.sources.length !== selected.length || receipt.sources.some((ref, index) => {
    const entry = selected[index]!;
    return ref.originEventId !== entry.originEventId || ref.sourceEventId !== entry.sourceEventId
      || ref.sourceEventHash !== entry.sourceEventHash || ref.payloadSha256 !== entry.part.sha256;
  })) throw new Error("compaction source commitment disagrees with the live surface");
  const total = receipt.sources.reduce((sum, ref) => sum + ref.bytes, 0);
  if (!Number.isSafeInteger(total) || total !== receipt.replacedBytes || receipt.savedBytes !== total - receipt.replacementBytes
    || receipt.replacementBytes >= total) throw new Error("compaction byte accounting does not show a measured reduction");
  if (receipt.mode === "drop" ? op.replacement !== null || receipt.replacementBytes !== 0 : op.replacement === null) throw new Error("compaction replacement disagrees with its mode");
  if (op.replacement !== null) {
    if (op.replacement.part.sha256 !== event.payload_sha256) throw new Error("compaction part must reference its own signed payload");
    if (receipt.mode === "replace" && (op.replacement.role !== selected[0]!.role || op.replacement.part.kind !== selected[0]!.part.kind)) throw new Error("replacement must preserve the entry role and kind");
    if (receipt.mode === "summarize" && (op.replacement.part.kind !== "text" || !["user", "assistant"].includes(op.replacement.role))) throw new Error("range summary must be explicit conversation text");
  }
  const start = entries.findIndex(entry => entry.originEventId === op.origins[0]);
  const replacement: SurfaceEntry[] = op.replacement === null ? [] : [{ ...selected[0]!, role: op.replacement.role,
    part: op.replacement.part, sourceEventId: event.id, sourceEventHash: event.event_hash }];
  return [...entries.slice(0, start), ...replacement, ...entries.slice(start + selected.length)];
}
