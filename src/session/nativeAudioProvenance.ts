import { decodeNativeAudioInput, materializeNativeAudioParts, NATIVE_AUDIO_INPUT_FORMAT, type NativeAudioPart } from "../attachments/nativeAudioInput.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { readEventPayload } from "./eventPayload.js";
import { readLoopInboxMeta } from "./loopEventMeta.js";
import { extractEnvelope } from "./sessionTypes.js";
import type { SurfaceEntry } from "./surfaceProjection.js";

export class NativeAudioProvenanceError extends Error {
  constructor(readonly reason: "payload-pruned" | "payload-missing" | "evidence-inconsistent", detail: string) {
    super(`Signed audio ${reason}: ${detail}`); this.name = "NativeAudioProvenanceError";
  }
}
function inconsistent(detail: string): never { throw new NativeAudioProvenanceError("evidence-inconsistent", detail); }
function meta(event: EvidenceEvent): Record<string, unknown> {
  try { const value: unknown = JSON.parse(event.meta_json); return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}
function originalBytes(workspace: string, event: EvidenceEvent): Buffer {
  const payload = readEventPayload(workspace, event);
  if (payload.status !== "ok") throw new NativeAudioProvenanceError(payload.status === "pruned" ? "payload-pruned" : "payload-missing", `original payload ${event.id} is ${payload.status}`);
  if (sha256Hex(payload.bytes) !== event.payload_sha256) return inconsistent(`payload ${event.id} contradicts its committed digest`);
  return payload.bytes;
}

/** Validate complete live audio groups before ANY request or ACP replay prefix.
 * Passing entries validates only groups still in the model's derived surface:
 * complete lawful compaction remains possible; partial media/order loss refuses.
 * This is source consistency, not signature authentication. ACP authenticates its
 * entire tail separately; cold request byte derivation is not a ledger receipt.
 */
export function validateNativeAudioProvenance(workspace: string, events: readonly EvidenceEvent[], entries?: readonly SurfaceEntry[]): readonly string[] {
  const byId = new Map(events.map(event => [event.id, event])), indexById = new Map(events.map((event, index) => [event.id, index]));
  const groups = new Map<string, EvidenceEvent[]>();
  for (const event of events) {
    const info = meta(event), envelope = extractEnvelope(event.meta_json), surface = envelope?.surface;
    const sourceId = info.sourceInputEventId, source = typeof sourceId === "string" ? byId.get(sourceId) : undefined;
    const audioSource = source?.event_type === "loop/inbox" && readLoopInboxMeta(source.meta_json)?.payloadFormat === NATIVE_AUDIO_INPUT_FORMAT;
    if (info.sourceInputFormat !== NATIVE_AUDIO_INPUT_FORMAT && !audioSource && !(surface?.op === "append" && surface.part.kind === "audio")) continue;
    if (info.sourceInputFormat !== NATIVE_AUDIO_INPUT_FORMAT || typeof sourceId !== "string" || !sourceId
        || surface?.op !== "append" || surface.role !== "user" || !["text", "image", "audio"].includes(surface.part.kind)) return inconsistent("attachment lost its original audio format, role or source identity");
    const group = groups.get(sourceId) ?? []; group.push(event); groups.set(sourceId, group);
  }
  const dependencies: string[] = [];
  for (const [sourceId, rows] of groups) {
    if (entries !== undefined) {
      const ids = new Set(rows.map(row => row.id));
      const active = entries.map((entry, index) => ({ entry, index })).filter(value => ids.has(value.entry.sourceEventId) || ids.has(value.entry.originEventId));
      if (active.length === 0) continue;
      if (active.length !== rows.length || active.some((value, index) => value.entry.sourceEventId !== rows[index]!.id
          || (index > 0 && value.index !== active[index - 1]!.index + 1))) return inconsistent("audio sequence was partially removed, interleaved, duplicated or reordered");
      for (const { entry } of active) {
        const row = byId.get(entry.sourceEventId)!, surface = extractEnvelope(row.meta_json)!.surface;
        if (surface.op !== "append" || entry.role !== "user" || entry.part.kind !== surface.part.kind
            || entry.part.sha256 !== row.payload_sha256) return inconsistent("audio surface contradicts its original signed row");
      }
    }
    const source = byId.get(sourceId), sourceMeta = source && readLoopInboxMeta(source.meta_json);
    const firstIndex = indexById.get(rows[0]!.id)!;
    const rowIds = new Set(rows.map(row => row.id));
    if (events.slice(firstIndex, indexById.get(rows[rows.length - 1]!.id)! + 1).some(event => {
      const surface = extractEnvelope(event.meta_json)?.surface;
      return surface?.op === "append" && !rowIds.has(event.id);
    })) return inconsistent("original audio content was interleaved with a different projected message");
    if (!source || source.event_type !== "loop/inbox" || sourceMeta?.op !== "insert" || sourceMeta.payloadFormat !== NATIVE_AUDIO_INPUT_FORMAT
        || sourceMeta.messageIds.length !== 1 || sourceMeta.origin === null || indexById.get(sourceId)! >= firstIndex) return inconsistent("no original earlier singleton audio inbox exists");
    const messageId = sourceMeta.messageIds[0]!;
    const prior = events.slice(indexById.get(sourceId)! + 1, firstIndex);
    const removals = prior.filter(event => event.event_type === "loop/inbox" && readLoopInboxMeta(event.meta_json)?.messageIds.includes(messageId));
    const claim = removals[0], claimMeta = claim && readLoopInboxMeta(claim.meta_json);
    if (removals.length !== 1 || claimMeta?.op !== "claim" || claimMeta.target !== sourceMeta.target
        || prior.some(event => event.event_type === "loop/veto" && Array.isArray(meta(event).claimedMessageIds)
          && (meta(event).claimedMessageIds as unknown[]).includes(messageId))) return inconsistent("audio projection has no unique admitted inbox claim or follows an explicit veto");
    let parts: readonly NativeAudioPart[];
    try { parts = materializeNativeAudioParts(decodeNativeAudioInput(originalBytes(workspace, source))); }
    catch (error) { if (error instanceof NativeAudioProvenanceError) throw error; return inconsistent(error instanceof Error ? error.message : "unsupported original bundle"); }
    if (rows.length !== parts.length) return inconsistent("audio projection omitted or added an original content part");
    const firstEnvelope = extractEnvelope(rows[0]!.meta_json)!;
    let imageIndex = 0, audioIndex = 0;
    for (const [index, part] of parts.entries()) {
      const row = rows[index]!, info = meta(row), envelope = extractEnvelope(row.meta_json), surface = envelope?.surface;
      if (row.session_id !== source.session_id || envelope?.sessionId !== source.session_id || envelope.turn !== firstEnvelope.turn
          || envelope.step !== firstEnvelope.step || surface?.op !== "append" || surface.role !== "user" || surface.part.kind !== part.type
          || surface.part.sha256 !== row.payload_sha256 || info.sourceContentIndex !== index
          || info.sourceInputEventId !== sourceId || info.sourceInputFormat !== NATIVE_AUDIO_INPUT_FORMAT) return inconsistent("content row's role/order/source commitment disagrees with its original audio bundle");
      const bytes = originalBytes(workspace, row);
      if (part.type === "text") {
        if (row.event_type !== "user/message" || info.sourceInputIndex !== undefined || !bytes.equals(Buffer.from(part.text, "utf8"))) return inconsistent("original audio-sequence text was rewritten or downgraded");
      } else {
        const media = part.type === "audio" ? part.audio : part.image;
        if (row.event_type !== "user/attachment" || info.filename !== media.filename || info.mimeType !== media.mediaType
            || info.bytes !== media.bytes.length || !bytes.equals(media.bytes)
            || info.sourceInputIndex !== (part.type === "audio" ? audioIndex++ : imageIndex++)) return inconsistent("original binary/MIME/filename/length/media-index changed");
      }
    }
    dependencies.push(source.id, claim!.id);
  }
  return dependencies;
}
