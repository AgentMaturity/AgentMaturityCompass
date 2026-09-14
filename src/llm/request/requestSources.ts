/**
 * From signed rows to an {@link EncodableRequest} (plan P3.1, VERIFY-3).
 *
 * This is the half of reconstruction that does not involve any provider: given
 * the session's committed events and the references a `request/header` row
 * carries, resolve every byte the request was built from and assemble the
 * encoder's input. The SEND path and the DERIVE path both call it — deliberately.
 * One resolution function means the request that goes out is assembled by
 * exactly the code that will later be asked to rebuild it, so a divergence is
 * impossible rather than merely tested for.
 *
 * What is NOT shared is where the inputs come from. The send path passes the
 * references it is about to record; the derive path passes only what it read out
 * of a signed row, and reads the rows back through the store. That asymmetry is
 * where the guarantee actually lives: derivation is handed a workspace, a
 * session and one event id, and nothing else.
 *
 * PRUNED IS NOT TAMPER. Retention may lawfully unlink the blob behind a row that
 * a request was built from, at which point the bytes genuinely cannot be
 * rebuilt. That outcome is reported as its own failure kind, distinct from a
 * digest mismatch, because conflating a deletion someone was entitled to perform
 * with evidence of alteration turns a compliance feature into a false alarm.
 */
import type { EvidenceEvent } from "../../types.js";
import { readEventPayload } from "../../session/eventPayload.js";
import { foldSurfaceEntries } from "../../session/surfaceProjection.js";
import type { SurfaceEntry } from "../../session/surfaceProjection.js";
import { validateSurfaceCompactions } from "../../session/surfaceCompaction.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { assertNativeImageBytes } from "../../attachments/nativeImageInput.js";
import { assertNativeAudioBytes } from "../../attachments/nativeAudioInput.js";
import { NativeAudioProvenanceError, validateNativeAudioProvenance } from "../../session/nativeAudioProvenance.js";
import { snapshotRecordedGeminiPart, type RecordedGeminiPart } from "../../session/geminiPartMeta.js";
import { resolveSpilledInputPayload } from "../../session/spill/spillInput.js";
import { parseRequestHeaderMeta } from "../../session/requestHeaderMeta.js";
import { bindProviderToolNames } from "./providerToolNames.js";
import { OLLAMA_CALL_KEY_PREFIX, readOllamaCallKey } from "../providers/ollamaToolIdentity.js";
import type { EncodableMessage, EncodablePart, EncodableRequest, ToolSchema } from "./requestSpec.js";

/** Why an assembly could not be completed. Each kind means something different. */
export type RequestSourceFailureKind =
  /** A referenced payload was lawfully deleted by retention. Not an alarm. */
  | "payload-pruned"
  /** A referenced payload is gone with no prune record, or unreadable. An alarm. */
  | "payload-missing"
  /** Readable image bytes or signed image metadata contradict their commitments. */
  | "evidence-inconsistent"
  /** The log does not describe a request this code can assemble at all. */
  | "unreconstructable";

export interface RequestSourceFailure {
  readonly kind: RequestSourceFailureKind;
  readonly detail: string;
}

export interface RequestSourceResolution {
  /** Null exactly when `failure` is set. */
  readonly request: EncodableRequest | null;
  /** Ordered ids of every row the request was assembled from. */
  readonly sourceEventIds: readonly string[];
  /** Digest over the projected history at the cutoff, including its provenance. */
  readonly projectionDigest: string;
  readonly failure: RequestSourceFailure | null;
  /**
   * Facts that do not stop assembly but should not go unmentioned — chiefly a
   * blob whose content no longer hashes to its row's `payload_sha256`. Assembly
   * continues so the caller still gets bytes to compare, and the note says where
   * to look when that comparison fails.
   */
  readonly notes: readonly string[];
}

export interface RequestSourceInput {
  readonly workspace: string;
  /** This session's committed rows, in commit order. */
  readonly events: readonly EvidenceEvent[];
  readonly model: string;
  readonly params: Record<string, unknown>;
  readonly systemPromptEventId: string;
  readonly toolSchemaEventId: string | null;
  readonly toolSchemaSha256: string | null;
  /** Last event included in the projected history. */
  readonly projectionCutoffEventId: string;
}

function failure(kind: RequestSourceFailureKind, detail: string, notes: readonly string[]): RequestSourceResolution {
  return { request: null, sourceEventIds: [], projectionDigest: "", failure: { kind, detail }, notes };
}

function metaOf(event: EvidenceEvent): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(event.meta_json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringField(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" ? value : null;
}

/**
 * Digest over the projected history at the cutoff.
 *
 * Commits to the ORDER, the roles, the part kinds, the payload digests AND the
 * provenance of every entry. Payload digests alone would let two different rows
 * with identical bytes swap places unnoticed; including `sourceEventId` makes
 * the digest a statement about which rows composed the history, which is what a
 * later reader wants to check.
 */
function digestProjection(entries: readonly SurfaceEntry[]): string {
  return sha256Hex(
    canonicalize(
      entries.map((entry) => ({
        role: entry.role,
        kind: entry.part.kind,
        sha256: entry.part.sha256,
        sourceEventId: entry.sourceEventId
      }))
    )
  );
}

/** One surface entry as an encodable part, using its own row's meta for ids. */
function toPart(entry: SurfaceEntry, event: EvidenceEvent, bytes: Buffer): EncodablePart | { readonly error: string } {
  const meta = metaOf(event);
  // Binary images never pass through a UTF-8 round trip.
  const text = entry.part.kind === "image" || entry.part.kind === "audio" ? "" : bytes.toString("utf8");
  let gemini: RecordedGeminiPart | undefined;
  if (meta.gemini !== undefined) {
    if (entry.role !== "assistant" || !["assistant/block", "tool/call"].includes(event.event_type)) return { error: "Gemini replay has no original assistant source" };
    try {
      const providerName = meta.providerName as { wireName?: unknown } | undefined;
      gemini = snapshotRecordedGeminiPart(meta.gemini as RecordedGeminiPart, entry.part.kind, bytes,
        entry.part.kind === "tool_use" ? { id: String(meta.toolCallId ?? ""), wireName: String(providerName?.wireName ?? meta.toolName ?? "") } : undefined);
    } catch (error) { return { error: error instanceof Error ? error.message : "invalid Gemini replay" }; }
  }
  switch (entry.part.kind) {
    case "text":
      return { kind: "text", text, ...(gemini === undefined ? {} : { gemini }) };
    case "thinking":
      return { kind: "thinking", text, ...(gemini === undefined ? {} : { gemini }) };
    case "image": {
      if (event.event_type !== "user/attachment" || entry.role !== "user") return { error: `image ${event.id} is not a signed user attachment` };
      if (!Number.isSafeInteger(meta.bytes) || meta.bytes !== bytes.length) return { error: `image ${event.id} byte length disagrees with its signed metadata` };
      try { assertNativeImageBytes(bytes, meta.mimeType); }
      catch (error) { return { error: `image ${event.id}: ${error instanceof Error ? error.message : "invalid signed media type"}` }; }
      return { kind: "image", sha256: sha256Hex(bytes), mediaType: meta.mimeType, bytes: Buffer.from(bytes) };
    }
    case "audio": {
      if (event.event_type !== "user/attachment" || entry.role !== "user" || meta.bytes !== bytes.length) return { error: `audio ${event.id} is not its original signed user binary` };
      try { assertNativeAudioBytes(bytes, meta.mimeType); }
      catch (error) { return { error: `audio ${event.id}: ${error instanceof Error ? error.message : "invalid signed MIME"}` }; }
      return { kind: "audio", sha256: sha256Hex(bytes), mediaType: meta.mimeType, bytes: Buffer.from(bytes) };
    }
    case "tool_use": {
      const toolCallId = stringField(meta, "toolCallId");
      const toolName = stringField(meta, "toolName");
      if (toolCallId === null || toolName === null) {
        return { error: `event ${event.id} contributes a tool_use part but records no toolCallId/toolName` };
      }
      return { kind: "tool_use", toolCallId, toolName, argumentsJson: text, ...(gemini === undefined ? {} : { gemini }) };
    }
    case "tool_result": {
      const toolCallId = stringField(meta, "toolCallId");
      if (toolCallId === null) {
        return { error: `event ${event.id} contributes a tool_result part but records no toolCallId` };
      }
      // `isError` is derived from the recorded outcome rather than stored twice:
      // a second field could disagree with the outcome the row already commits to.
      return { kind: "tool_result", toolCallId, isError: stringField(meta, "outcome") !== "OK", text };
    }
  }
}

/** Group consecutive same-role parts, exactly as the surface projection's view does. */
function groupParts(
  parts: readonly { role: SurfaceEntry["role"]; part: EncodablePart }[]
): readonly EncodableMessage[] {
  return parts.reduce<readonly EncodableMessage[]>((messages, entry) => {
    const last = messages[messages.length - 1];
    if (last !== undefined && last.role === entry.role) {
      return [...messages.slice(0, -1), { role: last.role, parts: [...last.parts, entry.part] }];
    }
    return [...messages, { role: entry.role, parts: [entry.part] }];
  }, []);
}

/**
 * Assemble the encoder's input from the log.
 *
 * `system` role entries stay in the projection and out of `sourceEventIds`: the
 * header names the one `system/prompt` row that supplied the request's system
 * text, and counting every system entry ever appended would describe a request
 * nobody sent.
 */
export function resolveRequestSources(input: RequestSourceInput): RequestSourceResolution {
  const notes: string[] = [];
  const byId = new Map(input.events.map((event) => [event.id, event] as const));

  const cutoffIndex = input.events.findIndex((event) => event.id === input.projectionCutoffEventId);
  if (cutoffIndex === -1) {
    return failure("unreconstructable", `projection cutoff event ${input.projectionCutoffEventId} is not in this session`, notes);
  }

  const systemRow = byId.get(input.systemPromptEventId);
  if (systemRow === undefined) {
    return failure("unreconstructable", `system prompt event ${input.systemPromptEventId} is not in this session`, notes);
  }
  if (systemRow.event_type !== "system/prompt") {
    return failure(
      "unreconstructable",
      `request/header names ${input.systemPromptEventId} as its system prompt, but that row is a ${systemRow.event_type}`,
      notes
    );
  }

  const sourceEventIds: string[] = [input.systemPromptEventId];

  const readInto = (event: EvidenceEvent): Buffer | RequestSourceResolution => {
    const read = readEventPayload(input.workspace, event);
    if (read.status === "pruned") {
      return failure("payload-pruned", `payload of event ${event.id} (${event.event_type}) was pruned by retention`, notes);
    }
    if (read.status === "missing") {
      return failure("payload-missing", read.detail, notes);
    }
    if (sha256Hex(read.bytes) !== event.payload_sha256) {
      notes.push(`payload of event ${event.id} does not hash to its committed payload_sha256`);
    }
    return read.bytes;
  };

  const systemBytes = readInto(systemRow);
  if (!Buffer.isBuffer(systemBytes)) {
    return systemBytes;
  }

  let tools: readonly ToolSchema[] | null = null;
  if (input.toolSchemaEventId !== null) {
    const toolRow = byId.get(input.toolSchemaEventId);
    if (toolRow === undefined) {
      return failure("unreconstructable", `tool schema event ${input.toolSchemaEventId} is not in this session`, notes);
    }
    if (toolRow.event_type !== "request/tools") {
      return failure(
        "unreconstructable",
        `request/header names ${input.toolSchemaEventId} as its tool schema, but that row is a ${toolRow.event_type}`,
        notes
      );
    }
    const toolBytes = readInto(toolRow);
    if (!Buffer.isBuffer(toolBytes)) {
      return toolBytes;
    }
    if (input.toolSchemaSha256 !== null && toolRow.payload_sha256 !== input.toolSchemaSha256) {
      notes.push(
        `tool schema digest in the header (${input.toolSchemaSha256}) is not event ${toolRow.id}'s payload (${toolRow.payload_sha256})`
      );
    }
    const parsed = parseToolSchemas(toolBytes);
    if (parsed === null) {
      return failure("unreconstructable", `tool schema event ${toolRow.id} does not hold a canonical tool list`, notes);
    }
    tools = parsed;
    sourceEventIds.push(input.toolSchemaEventId);
  }

  const prefix = input.events.slice(0, cutoffIndex + 1);
  let entries: readonly SurfaceEntry[];
  try {
    validateSurfaceCompactions(input.workspace, prefix);
    entries = foldSurfaceEntries(prefix);
  } catch (error) {
    return failure("unreconstructable", `invalid surface compaction: ${error instanceof Error ? error.message : "unsupported history"}`, notes);
  }
  const parts: { role: SurfaceEntry["role"]; part: EncodablePart }[] = [];
  try {
    for (const id of validateNativeAudioProvenance(input.workspace, prefix, entries)) {
      if (!sourceEventIds.includes(id)) sourceEventIds.push(id);
    }
  } catch (error) {
    return failure(error instanceof NativeAudioProvenanceError ? error.reason : "evidence-inconsistent",
      error instanceof Error ? error.message : "invalid original audio provenance", notes);
  }
  for (const entry of entries) {
    if (entry.role === "system") {
      if (entry.part.kind === "image" || entry.part.kind === "audio") return failure("evidence-inconsistent", "Binary input cannot be projected into the system role", notes);
      continue;
    }
    const row = byId.get(entry.sourceEventId);
    if (row === undefined) {
      return failure("unreconstructable", `surface entry names event ${entry.sourceEventId}, which is not in this session`, notes);
    }
    const bytes = readInto(row);
    if (!Buffer.isBuffer(bytes)) {
      return bytes;
    }
    if ((entry.part.kind === "image" || entry.part.kind === "audio") && (sha256Hex(bytes) !== row.payload_sha256 || entry.part.sha256 !== row.payload_sha256)) {
      return failure("evidence-inconsistent", `${entry.part.kind} ${row.id} bytes or surface digest do not match the committed payload_sha256; refusing tampered binary input`, notes);
    }
    // An attachment above the per-event cap stores a descriptor as its payload and its original bytes in the
    // spill store (src/session/spill/spillInput.ts). Resolve them against the row's signed reference, require
    // the signed commitment row that preceded the object, and only then let them become a part.
    let content = bytes;
    if (row.event_type === "user/attachment") {
      const spilled = resolveSpilledInputPayload({ workspace: input.workspace, event: row, payload: bytes, events: prefix });
      if (spilled.status === "ok") {
        content = spilled.bytes;
        if (spilled.commitmentEventId !== null && !sourceEventIds.includes(spilled.commitmentEventId)) sourceEventIds.push(spilled.commitmentEventId);
      } else if (spilled.status !== "not-spilled") {
        return failure(spilled.status === "missing" || spilled.status === "key-unavailable" ? "payload-missing" : "evidence-inconsistent",
          `spilled ${entry.part.kind} ${row.id}: ${spilled.detail}`, notes);
      }
    }
    const part = toPart(entry, row, content);
    if ("error" in part) {
      return failure(entry.part.kind === "image" || entry.part.kind === "audio" ? "evidence-inconsistent" : "unreconstructable", part.error, notes);
    }
    if ("gemini" in part && part.gemini !== undefined) {
      const original = byId.get(part.gemini.headerEventId), header = original && parseRequestHeaderMeta(original.meta_json);
      if (!original || original.event_type !== "request/header" || !header || header.encoderId !== "gemini-generate-content" || ![1, 2].includes(header.encoderVersion)
          || header.model !== input.model || input.events.indexOf(original) >= input.events.indexOf(row)
          || sha256Hex(bytes) !== row.payload_sha256 || entry.part.sha256 !== row.payload_sha256) {
        return failure("evidence-inconsistent", "Gemini replay does not resolve to its original earlier request, model and payload", notes);
      }
      if (!sourceEventIds.includes(original.id)) sourceEventIds.push(original.id);
      if (part.kind === "tool_use") {
        const offeredRow = header.toolSchemaEventId === null ? undefined : byId.get(header.toolSchemaEventId);
        if (!offeredRow || offeredRow.event_type !== "request/tools" || offeredRow.payload_sha256 !== header.toolSchemaSha256
            || input.events.indexOf(offeredRow) >= input.events.indexOf(original)) return failure("evidence-inconsistent", "Gemini call has no original offered schema commitment", notes);
        const offeredBytes = readInto(offeredRow); if (!Buffer.isBuffer(offeredBytes)) return offeredBytes;
        const offered = parseToolSchemas(offeredBytes), providerName = metaOf(row).providerName as Record<string, unknown> | undefined;
        if (!offered || sha256Hex(offeredBytes) !== offeredRow.payload_sha256 || !providerName || providerName.version !== 1
            || providerName.headerEventId !== original.id || providerName.encoderId !== header.encoderId || providerName.encoderVersion !== header.encoderVersion
            || typeof providerName.wireName !== "string" || bindProviderToolNames(offered).get(providerName.wireName) !== part.toolName) {
          return failure("evidence-inconsistent", "Gemini historical call was not bound to that request's exact offered canonical function", notes);
        }
        if (!sourceEventIds.includes(offeredRow.id)) sourceEventIds.push(offeredRow.id);
      }
    }
    // A labelled native Ollama key is a join representation, not authority by
    // itself. Resolve its exact prior header/schema/name binding on SEND and
    // cold DERIVE, just as the original Gemini protocol retains its own proof.
    if (part.kind === "tool_use") {
      const providerName = metaOf(row).providerName as Record<string, unknown> | undefined;
      if (part.toolCallId.startsWith(OLLAMA_CALL_KEY_PREFIX) || providerName?.encoderId === "ollama-chat") {
        try { readOllamaCallKey(part.toolCallId); }
        catch { return failure("evidence-inconsistent", "Ollama tool replay lost its original native call key", notes); }
        const original = typeof providerName?.headerEventId === "string" ? byId.get(providerName.headerEventId) : undefined;
        const header = original && parseRequestHeaderMeta(original.meta_json);
        if (!original || original.event_type !== "request/header" || !header || header.encoderId !== "ollama-chat" || header.encoderVersion !== 1
            || header.model !== input.model || input.events.indexOf(original) >= input.events.indexOf(row)
            || row.event_type !== "tool/call" || entry.role !== "assistant" || sha256Hex(bytes) !== row.payload_sha256 || entry.part.sha256 !== row.payload_sha256
            || providerName?.version !== 1 || providerName.encoderId !== header.encoderId || providerName.encoderVersion !== header.encoderVersion) {
          return failure("evidence-inconsistent", "Ollama replay does not resolve to its original earlier request, model and signed payload", notes);
        }
        const offeredRow = header.toolSchemaEventId === null ? undefined : byId.get(header.toolSchemaEventId);
        if (!offeredRow || offeredRow.event_type !== "request/tools" || offeredRow.payload_sha256 !== header.toolSchemaSha256
            || input.events.indexOf(offeredRow) >= input.events.indexOf(original)) {
          return failure("evidence-inconsistent", "Ollama call lacks its original offered schema commitment", notes);
        }
        const offeredBytes = readInto(offeredRow); if (!Buffer.isBuffer(offeredBytes)) return offeredBytes;
        const offered = parseToolSchemas(offeredBytes);
        if (!offered || sha256Hex(offeredBytes) !== offeredRow.payload_sha256 || typeof providerName.wireName !== "string"
            || bindProviderToolNames(offered).get(providerName.wireName) !== part.toolName) {
          return failure("evidence-inconsistent", "Ollama historical call was not bound to that request's exact offered function", notes);
        }
        if (!sourceEventIds.includes(original.id)) sourceEventIds.push(original.id);
        if (!sourceEventIds.includes(offeredRow.id)) sourceEventIds.push(offeredRow.id);
      }
    }
    parts.push({ role: entry.role, part });
    sourceEventIds.push(entry.sourceEventId);
  }

  return {
    request: {
      model: input.model,
      params: input.params,
      system: systemBytes.toString("utf8"),
      tools,
      messages: groupParts(parts)
    },
    sourceEventIds,
    projectionDigest: digestProjection(entries),
    failure: null,
    notes
  };
}

/**
 * Parse `request/tools` bytes back into tool schemas, refusing anything that is
 * not the canonical encoding those bytes are supposed to be.
 *
 * The re-canonicalisation check is the point: it proves the stored bytes are the
 * ones `canonicalToolSchemaBytes` would produce, so an encoder that re-emits the
 * parsed value cannot drift from what the row committed to.
 */
function parseToolSchemas(bytes: Buffer): readonly ToolSchema[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const tools: ToolSchema[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.description !== "string" ||
      typeof candidate.parameters !== "object" ||
      candidate.parameters === null ||
      Array.isArray(candidate.parameters)
    ) {
      return null;
    }
    tools.push({
      name: candidate.name,
      description: candidate.description,
      parameters: candidate.parameters as Record<string, unknown>
    });
  }
  if (canonicalize(tools) !== bytes.toString("utf8")) {
    return null;
  }
  return tools;
}
