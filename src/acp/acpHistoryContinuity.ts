import type { AgentSession } from "../agent/agentSession.js";
import { decodeNativeOrderedInput, materializeNativeInputParts, NATIVE_ORDERED_INPUT_FORMAT, type NativeInputPart } from "../attachments/nativeOrderedInput.js";
import { readEventPayload } from "../session/eventPayload.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import { openHistoryReader } from "../session/sessionHistoryReader.js";
import { resolveSpilledInboxPayload, resolveSpilledInputPayload } from "../session/spill/spillInput.js";
import type { SessionLineage } from "../session/sessionApiTypes.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { ACP_MAX_SESSION_ROWS, validateAcpCommittedTail } from "./acpCommittedUpdates.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { acpSupportsImageInput, assertAcpRouteContent, type AcpPromptBlock, type AcpPromptRoute } from "./acpPromptInput.js";
import { projectSessionUpdates } from "./acpProjection.js";
import { acpSupportsAudioInput } from "./acpAudioInput.js";

/** Authenticate and preflight the ENTIRE replay before the server sends any prefix.
 * This is not a cold-verifier result, and missing bytes are never replaced by labels.
 */
export function prepareAcpHistory(options: {
  readonly workspace: string;
  readonly session: Pick<AgentSession, "sessionId" | "promptParts" | "promptAudioParts">;
  readonly rows: readonly EvidenceEvent[];
  readonly route?: AcpPromptRoute;
  readonly orderedImageInput: boolean;
  readonly audioInput: boolean;
}) {
  const { workspace, session, rows } = options;
  if (rows.length === 0 || rows[0]?.event_type !== "session/open") refuse("native-session-opening-missing");
  const head = validateAcpCommittedTail(workspace, session.sessionId, rows, 0, null);
  validateAcpOrderedHistory(workspace, rows);
  const history = projectSessionUpdates(workspace, rows, 0, { includeUser: true });
  if (history.unsigned > 0) refuse("unsigned-history");
  const content = history.updates.flatMap(update => {
    const block = update.content as AcpPromptBlock | undefined;
    return block?.type === "image" || block?.type === "audio" ? [block] : [];
  });
  if (!acpSupportsImageInput(options.route) && content.some(block => block.type === "image")) {
    throw new AcpFailure(ACP_ERROR.invalidParams,
      "The selected native protocol cannot continue signed image history; select its original image-capable route. No fallback was used.");
  }
  assertAcpRouteContent(options.route, content);
  if ((!options.audioInput || !acpSupportsAudioInput(options.route) || !session.promptAudioParts) && content.some(block => block.type === "audio")) {
    throw new AcpFailure(ACP_ERROR.invalidParams,
      "This native route cannot continue original signed audio history; select its exact audio-capable route. No replay prefix or fallback was sent.");
  }
  if ((!options.orderedImageInput || !session.promptParts) && rows.some(row => meta(row).sourceInputFormat === NATIVE_ORDERED_INPUT_FORMAT)) {
    throw new AcpFailure(ACP_ERROR.invalidParams, "This native session cannot continue the original ordered image contract. No replay prefix or reordering was sent.");
  }
  return { head, updates: history.updates };
}

/** Require the child's signed opening to identify an authenticated parent prefix.
 * The parent's writer is never taken over or modified, and a later parent append
 * does not rewrite the exact prefix from which this fork was created.
 */
export function assertAcpForkLineage(workspace: string, parentSessionId: string, child: AgentSession,
  rows: readonly EvidenceEvent[], agentId: string): { readonly parent: SessionLineage; readonly rows: readonly EvidenceEvent[] } {
  validateAcpCommittedTail(workspace, child.sessionId, rows, 0, null);
  const opening = rows[0];
  const value = opening && meta(opening);
  const raw = value?.parentSession as Partial<SessionLineage> | undefined;
  if (child.sessionId === parentSessionId || !child.sessionId || opening?.event_type !== "session/open" || value?.agentId !== agentId
      || !raw || raw.sessionId !== parentSessionId || typeof raw.finalEventHash !== "string" || !/^[a-f0-9]{64}$/.test(raw.finalEventHash)
      || !Number.isSafeInteger(raw.seq) || raw.seq! < 0 || raw.seq! >= ACP_MAX_SESSION_ROWS) refuse("fork-lineage-missing-or-incompatible");
  const parent: SessionLineage = { sessionId: parentSessionId, finalEventHash: raw.finalEventHash, seq: raw.seq! };
  const reader = openHistoryReader(workspace);
  try {
    if (!reader.store.readSessionRecord(parentSessionId)) refuse("fork-parent-missing");
    const source = reader.store.readSessionEvents(parentSessionId).slice(0, parent.seq + 1);
    if (source.length !== parent.seq + 1 || validateAcpCommittedTail(workspace, parentSessionId, source, 0, null) !== parent.finalEventHash) {
      refuse("fork-parent-head-changed");
    }
    reader.assertUnchanged();
    return { parent, rows: source };
  } finally { reader.store.close(); }
}

/** Ordered v2 replay binds every projected part back to its original inbox and
 * admitted claim. Row signatures alone cannot establish the meaning of the order.
 */
export function validateAcpOrderedHistory(workspace: string, events: readonly EvidenceEvent[]): void {
  const byId = new Map(events.map(event => [event.id, event]));
  const positions = new Map(events.map((event, index) => [event.id, index]));
  const groups = new Map<string, EvidenceEvent[]>();
  for (const event of events) {
    const info = meta(event), sourceId = info.sourceInputEventId;
    const source = typeof sourceId === "string" ? byId.get(sourceId) : undefined;
    const orderedSource = source?.event_type === "loop/inbox" && readLoopInboxMeta(source.meta_json)?.payloadFormat === NATIVE_ORDERED_INPUT_FORMAT;
    if (info.sourceInputFormat !== NATIVE_ORDERED_INPUT_FORMAT && !orderedSource) continue;
    const surface = extractEnvelope(event.meta_json)?.surface;
    if (info.sourceInputFormat !== NATIVE_ORDERED_INPUT_FORMAT || typeof sourceId !== "string" || !sourceId
        || surface?.op !== "append" || surface.role !== "user" || !["text", "image"].includes(surface.part.kind)) refuse("ordered-source-inconsistent");
    const group = groups.get(sourceId) ?? [];
    group.push(event); groups.set(sourceId, group);
  }
  for (const [sourceId, rows] of groups) {
    const source = byId.get(sourceId), sourceMeta = source && readLoopInboxMeta(source.meta_json);
    const first = positions.get(rows[0]!.id)!, last = positions.get(rows[rows.length - 1]!.id)!;
    if (!source || source.event_type !== "loop/inbox" || sourceMeta?.op !== "insert" || sourceMeta.payloadFormat !== NATIVE_ORDERED_INPUT_FORMAT
        || sourceMeta.messageIds.length !== 1 || sourceMeta.origin === null || positions.get(sourceId)! >= first) refuse("ordered-inbox-missing");
    const messageId = sourceMeta.messageIds[0]!;
    const prior = events.slice(positions.get(sourceId)! + 1, first);
    const removals = prior.filter(event => event.event_type === "loop/inbox" && readLoopInboxMeta(event.meta_json)?.messageIds.includes(messageId));
    const claim = removals[0] && readLoopInboxMeta(removals[0].meta_json);
    if (removals.length !== 1 || claim?.op !== "claim" || claim.target !== sourceMeta.target
        || prior.some(event => event.event_type === "loop/veto" && Array.isArray(meta(event).claimedMessageIds)
          && (meta(event).claimedMessageIds as unknown[]).includes(messageId))) refuse("ordered-claim-missing-or-vetoed");
    const ids = new Set(rows.map(row => row.id));
    if (events.slice(first, last + 1).some(event => extractEnvelope(event.meta_json)?.surface.op === "append" && !ids.has(event.id))) {
      refuse("ordered-history-interleaved");
    }
    let parts: readonly NativeInputPart[];
    try { parts = materializeNativeInputParts(decodeNativeOrderedInput(originalBytes(workspace, events, source))); }
    catch (error) { if (error instanceof AcpFailure) throw error; return refuse("ordered-original-bundle-inconsistent"); }
    if (parts.length !== rows.length) refuse("ordered-content-omitted-or-duplicated");
    const firstEnvelope = extractEnvelope(rows[0]!.meta_json)!;
    let imageIndex = 0;
    for (const [index, part] of parts.entries()) {
      const row = rows[index]!, info = meta(row), envelope = extractEnvelope(row.meta_json), surface = envelope?.surface;
      if (row.session_id !== source.session_id || envelope?.sessionId !== source.session_id || envelope.turn !== firstEnvelope.turn
          || envelope.step !== firstEnvelope.step || surface?.op !== "append" || surface.role !== "user" || surface.part.kind !== part.type
          || surface.part.sha256 !== row.payload_sha256 || info.sourceInputEventId !== sourceId
          || info.sourceInputFormat !== NATIVE_ORDERED_INPUT_FORMAT || info.sourceContentIndex !== index) refuse("ordered-content-order-inconsistent");
      const bytes = originalBytes(workspace, events, row);
      if (part.type === "text") {
        if (row.event_type !== "user/message" || info.sourceInputIndex !== undefined || !bytes.equals(Buffer.from(part.text, "utf8"))) refuse("ordered-text-rewritten");
      } else if (row.event_type !== "user/attachment" || info.sourceInputIndex !== imageIndex++ || info.filename !== part.image.filename
          || info.mimeType !== part.image.mediaType || info.bytes !== part.image.bytes.length || !bytes.equals(part.image.bytes)) refuse("ordered-image-rewritten");
    }
  }
}

/** A row's ORIGINAL bytes: its payload, or the retained object its signed spill commitment names — never the descriptor. */
function originalBytes(workspace: string, events: readonly EvidenceEvent[], row: EvidenceEvent): Buffer {
  const payload = readEventPayload(workspace, row);
  if (payload.status !== "ok") refuse(`payload-${payload.status}`);
  if (sha256Hex(payload.bytes) !== row.payload_sha256) refuse("payload-digest-inconsistent");
  const spilled = row.event_type === "loop/inbox"
    ? resolveSpilledInboxPayload({ workspace, event: row, messageId: readLoopInboxMeta(row.meta_json)?.messageIds[0] ?? "", payload: payload.bytes, events })
    : resolveSpilledInputPayload({ workspace, event: row, payload: payload.bytes, events });
  if (spilled.status === "not-spilled") return payload.bytes;
  if (spilled.status !== "ok") refuse(spilled.status === "missing" || spilled.status === "key-unavailable" ? "payload-missing" : "evidence-inconsistent");
  return spilled.bytes;
}
function meta(row: EvidenceEvent): Record<string, unknown> {
  try { const value: unknown = JSON.parse(row.meta_json); return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}
function refuse(reason: string): never {
  throw new AcpFailure(ACP_ERROR.internal, "Signed native history cannot be faithfully continued; no replay prefix was emitted.", { reason });
}
