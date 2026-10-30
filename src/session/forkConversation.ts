/** A fork snapshots the verified surface; it never replays parent side effects. */
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { readEventPayload } from "./eventPayload.js";
import { historyRefuse } from "./sessionHistoryReader.js";
import type { SessionService, SessionEventRef } from "./sessionService.js";
import { extractEnvelope } from "./sessionTypes.js";
import { foldSurfaceEntries } from "./surfaceProjection.js";
import { DEFAULT_SPILL_POLICY, extractSpillRef } from "./spill/spillTypes.js";
import { OLLAMA_CALL_KEY_PREFIX } from "../llm/providers/ollamaToolIdentity.js";
import { assertNativeImageBytes } from "../attachments/nativeImageInput.js";

function assertForkTurns(rows: readonly EvidenceEvent[]): void {
  let active: number | null = null, last = 0, ended = false;
  for (const row of rows) {
    if (!["turn/start", "turn/end", "turn/seal"].includes(row.event_type)) continue;
    const turn = extractEnvelope(row.meta_json)?.turn;
    const metadata = JSON.parse(row.meta_json) as { turn?: unknown };
    if (!Number.isSafeInteger(turn) || metadata.turn !== turn) historyRefuse("TAMPERED", "Parent turn boundary identities disagree.");
    if (row.event_type === "turn/start") {
      if (active !== null || turn !== last + 1) historyRefuse("TAMPERED", "Parent turn starts overlap or are not sequential.");
      active = turn!; ended = false;
    } else if (row.event_type === "turn/end") {
      if (active !== turn || ended) historyRefuse("TAMPERED", "Parent turn ending has no unique active turn.");
      ended = true;
    } else {
      if (active !== turn || !ended) historyRefuse("UNSEALED", "Parent turn seal has no completed turn ending.");
      last = turn!; active = null;
    }
  }
}

export function selectForkPrefix(rows: readonly EvidenceEvent[], forkTurn?: number): { rows: readonly EvidenceEvent[]; forkTurn: number } {
  if (forkTurn !== undefined && (!Number.isSafeInteger(forkTurn) || forkTurn < 0)) {
    historyRefuse("INVALID_INPUT", "Fork turn must be a nonnegative safe integer.");
  }
  const starts = rows.filter(row => row.event_type === "turn/start");
  const latest = starts.at(-1);
  const turn = forkTurn ?? (latest ? extractEnvelope(latest.meta_json)!.turn : 0);
  if (turn === 0) {
    const first = rows.findIndex(row => row.event_type === "turn/start");
    return { rows: first < 0 ? rows : rows.slice(0, first), forkTurn: 0 };
  }
  const matchingStarts = starts.filter(row => extractEnvelope(row.meta_json)!.turn === turn);
  const seals = rows.filter(row => row.event_type === "turn/seal" && extractEnvelope(row.meta_json)!.turn === turn);
  if (matchingStarts.length !== 1 || seals.length !== 1 || rows.indexOf(seals[0]!) <= rows.indexOf(matchingStarts[0]!)) {
    historyRefuse("UNSEALED", "Fork turn must identify one complete sealed parent turn; recover the parent explicitly or select an earlier sealed turn.");
  }
  const prefix = forkTurn === undefined ? rows : rows.slice(0, rows.indexOf(seals[0]!) + 1);
  assertForkTurns(prefix);
  return { rows: prefix, forkTurn: turn! };
}

interface ForkPart {
  readonly source: EvidenceEvent;
  readonly copy: (session: SessionService) => SessionEventRef;
}

/** Preflight every byte and supported dependency BEFORE a child or writer exists.
 * Inbox/media groups, provider-specific replay and retained-output migration need
 * their own provenance contracts. Refuse them rather than copy dangling refs.
 */
export function prepareForkConversation(workspace: string, rows: readonly EvidenceEvent[]): readonly ForkPart[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  const pending = new Set<string>(), completed = new Set<string>();
  const parts = foldSurfaceEntries(rows).map((entry, index): ForkPart => {
    const source = byId.get(entry.sourceEventId);
    if (!source || source.event_hash !== entry.sourceEventHash || source.payload_sha256 !== entry.part.sha256) {
      return historyRefuse("TAMPERED", "Fork surface has inconsistent source provenance.");
    }
    const meta = JSON.parse(source.meta_json) as Record<string, unknown>;
    const providerName = meta.providerName as { encoderId?: unknown } | undefined;
    if (extractSpillRef(source.meta_json) !== null || meta.spilled != null || meta.gemini !== undefined
        || meta.sourceInputEventId !== undefined || meta.sourceInputFormat !== undefined || entry.part.kind === "audio"
        || providerName?.encoderId === "ollama-chat" || providerName?.encoderId === "gemini-generate-content"
        || (typeof meta.toolCallId === "string" && meta.toolCallId.startsWith(OLLAMA_CALL_KEY_PREFIX))) {
      return historyRefuse("UNSUPPORTED_FORMAT", "Fork cannot yet copy retained, ordered media or provider-specific replay provenance; no child was created.");
    }
    const payload = readEventPayload(workspace, source);
    if (payload.status !== "ok" || sha256Hex(payload.bytes) !== source.payload_sha256) {
      return historyRefuse("TAMPERED", "Fork conversation payload is unavailable or does not match its signed digest.");
    }
    const content = Buffer.from(payload.bytes);
    let copy: ForkPart["copy"];
    if (entry.role === "system" && entry.part.kind === "text") {
      const text = content.toString("utf8");
      if (!Buffer.from(text).equals(content)) return historyRefuse("TAMPERED", "Fork system text is not valid UTF-8.");
      copy = session => session.recordSystemPrompt(text);
    } else if (entry.role === "user" && source.event_type === "user/attachment" && ["text", "image"].includes(entry.part.kind)) {
      if (typeof meta.filename !== "string" || typeof meta.mimeType !== "string" || meta.bytes !== content.length) {
        return historyRefuse("TAMPERED", "Fork attachment metadata does not match its signed content.");
      }
      const filename = meta.filename, mimeType = meta.mimeType, kind = entry.part.kind as "text" | "image";
      if (kind === "image") assertNativeImageBytes(content, mimeType);
      copy = session => session.recordUserAttachment({ filename, mimeType, kind, content });
    } else if (entry.role === "user" && entry.part.kind === "text") {
      // Keep the byte round trip exact: malformed UTF-8 is not a user message.
      const text = content.toString("utf8");
      if (!Buffer.from(text).equals(content)) return historyRefuse("TAMPERED", "Fork user text is not valid UTF-8.");
      copy = session => session.recordUserMessage(text);
    } else if (entry.role === "assistant" && ["text", "thinking"].includes(entry.part.kind)) {
      const blockKind = entry.part.kind, blockIndex = Number.isSafeInteger(meta.blockIndex) ? meta.blockIndex as number : index;
      const stopReason = typeof meta.stopReason === "string" ? meta.stopReason : null;
      copy = session => session.recordAssistantBlock({ blockKind, blockIndex, stopReason, content });
    } else if (entry.role === "assistant" && entry.part.kind === "tool_use" && source.event_type === "tool/call") {
      const { toolCallId, toolName, dispatch, parentToken } = meta;
      if (typeof toolCallId !== "string" || !toolCallId || typeof toolName !== "string" || !toolName
          || (dispatch !== "native" && dispatch !== "code") || (parentToken !== null && typeof parentToken !== "string")
          || pending.has(toolCallId) || completed.has(toolCallId)) return historyRefuse("TAMPERED", "Fork tool call is malformed or ambiguous.");
      pending.add(toolCallId);
      copy = session => session.recordToolCall({ toolCallId, toolName, dispatch, parentToken, args: content });
    } else if (entry.role === "tool" && entry.part.kind === "tool_result" && source.event_type === "tool/result") {
      const { toolCallId, outcome, exitCode, timedOut, denied } = meta;
      if (content.length > DEFAULT_SPILL_POLICY.maxInlineBytes || outcome === "TOOL_OUTCOME_UNKNOWN") {
        return historyRefuse("UNSUPPORTED_FORMAT", "Fork requires inline settled tool results; retained output and unknown side effects need explicit reconciliation.");
      }
      if (typeof toolCallId !== "string" || !pending.delete(toolCallId) || typeof outcome !== "string"
          || !["OK", "ERROR", "DENIED", "CANCELLED", "TOOL_OUTCOME_UNKNOWN"].includes(outcome)
          || (exitCode !== null && !Number.isSafeInteger(exitCode)) || typeof timedOut !== "boolean" || typeof denied !== "boolean") {
        return historyRefuse("TAMPERED", "Fork tool result is malformed or has no unique preceding call.");
      }
      completed.add(toolCallId);
      copy = session => session.recordToolResult({ toolCallId, outcome: outcome as "OK" | "ERROR" | "DENIED" | "CANCELLED" | "TOOL_OUTCOME_UNKNOWN",
        exitCode: exitCode as number | null, timedOut, denied, content });
    } else {
      return historyRefuse("UNSUPPORTED_FORMAT", "Fork conversation contains an unsupported role, kind or source event; no child was created.");
    }
    return { source, copy };
  });
  if (pending.size) historyRefuse("UNSEALED", "Fork conversation has unresolved tool calls; reconcile the parent explicitly.");
  return parts;
}

export function copyForkConversation(session: SessionService, parts: readonly ForkPart[]): void {
  for (const part of parts) {
    const copied = part.copy(session);
    if (copied.payloadSha256 !== part.source.payload_sha256) {
      historyRefuse("UNSUPPORTED_FORMAT", "Current input or redaction policy changed inherited bytes; the partial child was not admitted.");
    }
    const forkSource = { sessionId: part.source.session_id, eventId: part.source.id, eventHash: part.source.event_hash,
      turn: extractEnvelope(part.source.meta_json)!.turn };
    session.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify({ copiedEventId: copied.eventId, forkSource }),
      meta: { copiedEventId: copied.eventId, forkSource } });
  }
}
