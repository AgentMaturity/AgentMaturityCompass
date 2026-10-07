/** Origin addressing recovered from sweet-merkle; measurements come from authenticated payloads. */
import type { EvidenceEvent } from "../types.js";
import { getPublicKeyHistory, getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { sha256Hex } from "../utils/hash.js";
import { readEventPayload } from "./eventPayload.js";
import { foldSurfaceEntries, surfaceProjection, type SurfaceEntry } from "./surfaceProjection.js";
import { extractEnvelope, SESSION_GENESIS, type SurfaceRole } from "./sessionTypes.js";
import { assertAutomaticProvenance, compactionReceipt, parseCompactionReceipt, selectCompactionEntries,
  type AutomaticCompaction, type SurfaceCompactionOp, type SurfaceCompactionReceipt } from "./surfaceCompactionValidation.js";
export type { AutomaticCompaction };

export interface LiveSurfaceEntry {
  readonly originEventId: string; readonly sourceEventId: string; readonly sourceEventHash: string;
  readonly slot: string; readonly role: SurfaceRole; readonly kind: SurfaceEntry["part"]["kind"]; readonly sha256: string;
}
export function describeLiveEntries(events: readonly EvidenceEvent[]): readonly LiveSurfaceEntry[] {
  return foldSurfaceEntries(events).map(entry => ({ originEventId: entry.originEventId, sourceEventId: entry.sourceEventId,
    sourceEventHash: entry.sourceEventHash, slot: entry.slot, role: entry.role, kind: entry.part.kind, sha256: entry.part.sha256 }));
}
export function describeMeasuredLiveEntries(workspace: string, events: readonly EvidenceEvent[]): readonly (LiveSurfaceEntry & { readonly bytes: number | null })[] {
  authenticateSession(workspace, events); validateSurfaceCompactions(workspace, events);
  const byId = new Map(events.map(row => [row.id, row]));
  return describeLiveEntries(events).map(entry => {
    const source = byId.get(entry.sourceEventId);
    if (!source || source.payload_sha256 !== entry.sha256) throw new Error("compaction surface has an unavailable source commitment");
    return { ...entry, bytes: authenticatedBytes(workspace, source, true)?.byteLength ?? null };
  });
}
function meta(row: EvidenceEvent): Record<string, unknown> { return JSON.parse(row.meta_json) as Record<string, unknown>; }
function hasOriginCompaction(row: EvidenceEvent): boolean {
  try { const raw = meta(row); return (row.event_type === "loop/compact" && raw.compaction !== undefined)
    || (raw.amcSession as { surface?: { op?: string } })?.surface?.op === "compact"; }
  catch { return false; }
}
function authenticatedBytes(workspace: string, row: EvidenceEvent, allowPruned = false): Buffer | null {
  const payload = readEventPayload(workspace, row);
  if (payload.status === "pruned" && allowPruned) return null;
  if (payload.status !== "ok") throw new Error(`compaction source ${row.id} has ${payload.status} payload; measured savings are unavailable`);
  if (sha256Hex(payload.bytes) !== row.payload_sha256) throw new Error(`compaction source ${row.id} payload digest mismatch`);
  return payload.bytes;
}
/** Authenticate this session slice without pretending its global chain starts at GENESIS. */
function authenticateSession(workspace: string, events: readonly EvidenceEvent[]): void {
  const keys = getPublicKeyHistory(workspace, "monitor");
  const expected = process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"];
  if (expected && sha256Hex(Buffer.from(getPublicKeyPem(workspace, "monitor"))) !== expected) throw new Error("compaction monitor trust root mismatch");
  let previous = SESSION_GENESIS, seq = 0; const ids = new Set<string>(), sessionId = events[0]?.session_id;
  for (const row of events) {
    const envelope = extractEnvelope(row.meta_json);
    if (!envelope || row.session_id !== sessionId || envelope.sessionId !== sessionId || envelope.seq !== seq++
      || envelope.prevSessionEventHash !== previous || ids.has(row.id)) throw new Error("compaction requires an intact single-session signed prefix");
    const metadata = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
      eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path,
      payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
    if (sha256Hex(`${row.prev_event_hash}${metadata}${row.payload_sha256}`) !== row.event_hash || !verifyHexDigestAny(row.event_hash, row.writer_sig, keys)) {
      throw new Error(`compaction source ${row.id} hash or signature is invalid`);
    }
    ids.add(row.id); previous = row.event_hash;
  }
}

/** Reused by request reconstruction and both ledger backends. No workspace writes. */
export function validateSurfaceCompactions(workspace: string, events: readonly EvidenceEvent[]): void {
  const sessions = new Set(events.filter(hasOriginCompaction).map(row => row.session_id));
  if (!sessions.size) return;
  const states = new Map<string, readonly SurfaceEntry[]>(), prior = new Map<string, EvidenceEvent>(), rows = new Map<string, EvidenceEvent>();
  for (const row of events) {
    if (!sessions.has(row.session_id)) continue;
    const envelope = extractEnvelope(row.meta_json), state = states.get(row.session_id) ?? [];
    if (hasOriginCompaction(row)) {
      if (!envelope || envelope.surface.op !== "compact") throw new Error(`compaction ${row.id} has an unsupported surface operation`);
      const receipt = compactionReceipt(row), previous = prior.get(row.session_id);
      if (!previous || receipt.basis.eventId !== previous.id || receipt.basis.eventHash !== previous.event_hash) throw new Error("compaction basis does not name the preceding session event");
      assertAutomaticProvenance(receipt, rows, row.session_id);
      const legacyCounts = meta(row);
      if (legacyCounts.replacedBytes !== receipt.replacedBytes || legacyCounts.replacementBytes !== receipt.replacementBytes) throw new Error("compaction compatibility counts disagree with measured receipt");
      const replacement = authenticatedBytes(workspace, row, true);
      if (replacement !== null && replacement.byteLength !== receipt.replacementBytes) throw new Error("compaction replacement byte count mismatch");
      for (const source of receipt.sources) {
        const original = rows.get(source.sourceEventId);
        if (!original || original.session_id !== row.session_id) throw new Error("compaction references a future or foreign source event");
        const bytes = authenticatedBytes(workspace, original, true);
        if (bytes !== null && bytes.byteLength !== source.bytes) throw new Error("compaction replaced byte count mismatch");
      }
      if (receipt.mode === "replace" && envelope.surface.replacement?.part.kind === "tool_result") {
        const origin = rows.get(receipt.sources[0]!.originEventId);
        if (!origin || meta(origin).toolCallId !== meta(row).toolCallId || meta(origin).outcome !== meta(row).outcome) throw new Error("compaction changed tool result identity or outcome");
      }
    }
    states.set(row.session_id, surfaceProjection.apply(state, row));
    if (envelope) prior.set(row.session_id, row);
    rows.set(row.id, row);
  }
}

export function prepareSurfaceCompaction(workspace: string, events: readonly EvidenceEvent[], params: {
  readonly origins: readonly string[]; readonly mode: SurfaceCompactionReceipt["mode"];
  readonly replacement?: string; readonly summaryRole?: "user" | "assistant"; readonly reason: string;
  /** Present only for automatic compaction; selects receipt v2. Savings are still measured here, never supplied. */
  readonly automatic?: AutomaticCompaction | undefined;
}): { readonly surface: SurfaceCompactionOp; readonly payload: Buffer; readonly typeMeta: Record<string, unknown> } {
  if (typeof params.reason !== "string" || !params.reason.trim() || params.reason.length > 2048) throw new Error("compaction requires a bounded reason");
  if (params.summaryRole !== undefined && params.summaryRole !== "user" && params.summaryRole !== "assistant") throw new Error("compaction summary role must be user or assistant");
  authenticateSession(workspace, events); validateSurfaceCompactions(workspace, events);
  const head = events.at(-1), envelope = head ? extractEnvelope(head.meta_json) : null;
  if (!head || !envelope) throw new Error("compaction requires an existing session head");
  const entries = foldSurfaceEntries(events), selected = selectCompactionEntries(entries, params.origins, params.mode);
  const byId = new Map(events.map(row => [row.id, row]));
  const sources = selected.map(entry => {
    const source = byId.get(entry.sourceEventId);
    if (!source || source.payload_sha256 !== entry.part.sha256) throw new Error("compaction source is missing or disagrees with surface bytes");
    return { originEventId: entry.originEventId, sourceEventId: source.id, sourceEventHash: source.event_hash,
      payloadSha256: source.payload_sha256, bytes: authenticatedBytes(workspace, source)!.byteLength };
  });
  if (params.mode !== "drop" && (typeof params.replacement !== "string" || !params.replacement.trim())) throw new Error("compaction replacement must contain explicit summary text");
  if (params.mode !== "drop" && Buffer.byteLength(params.replacement!, "utf8") > 1_000_000) throw new Error("compaction summary exceeds its byte limit");
  const payload = Buffer.from(params.mode === "drop" ? "" : params.replacement!, "utf8");
  const replacedBytes = sources.reduce((sum, source) => sum + source.bytes, 0);
  if (!Number.isSafeInteger(replacedBytes) || payload.byteLength >= replacedBytes || payload.byteLength > 1_000_000) {
    throw new Error(`compaction replacement must be smaller than the ${replacedBytes} measured current payload bytes`);
  }
  const measured = { mode: params.mode, reason: params.reason,
    basis: { sessionId: head.session_id, eventId: head.id, eventHash: head.event_hash, seq: envelope.seq }, sources,
    replacedBytes, replacementBytes: payload.byteLength, savedBytes: replacedBytes - payload.byteLength, measurement: "payload-bytes-not-tokens" };
  const automatic = params.automatic;
  const receipt: SurfaceCompactionReceipt = parseCompactionReceipt(automatic === undefined ? { v: 1, ...measured } : { v: 2, ...measured,
    trigger: automatic.trigger, ...(automatic.summarizer === undefined ? {} : { summarizer: automatic.summarizer }) });
  assertAutomaticProvenance(receipt, byId, head.session_id);
  const first = selected[0]!;
  const surface: SurfaceCompactionOp = { op: "compact", origins: [...params.origins], replacement: params.mode === "drop" ? null : {
    role: params.mode === "replace" ? first.role : params.summaryRole ?? (first.role === "user" ? "user" : "assistant"),
    part: { kind: params.mode === "replace" ? first.part.kind : "text", sha256: sha256Hex(payload) } } };
  const identity = params.mode === "replace" && first.part.kind === "tool_result" ? meta(byId.get(first.originEventId)!) : {};
  if (params.mode === "replace" && first.part.kind === "tool_result" && (identity.toolCallId !== first.slot.slice("tool_result:".length)
    || !["OK", "ERROR", "DENIED", "CANCELLED", "TOOL_OUTCOME_UNKNOWN"].includes(String(identity.outcome)))) throw new Error("compaction requires the original tool result identity and outcome");
  return { surface, payload, typeMeta: { compaction: receipt,
    replacedBytes, replacementBytes: payload.byteLength,
    ...(first.part.kind === "tool_result" && params.mode === "replace" ? { toolCallId: identity.toolCallId, outcome: identity.outcome } : {}) } };
}
