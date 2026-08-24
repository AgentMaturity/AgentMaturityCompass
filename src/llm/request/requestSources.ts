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
import { join } from "node:path";
import type { EvidenceEvent } from "../../types.js";
import { foldSurfaceEntries } from "../../session/surfaceProjection.js";
import type { SurfaceEntry } from "../../session/surfaceProjection.js";
import { loadBlobPlaintext } from "../../storage/blobs/blobStore.js";
import { pathExists } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { EncodableMessage, EncodablePart, EncodableRequest, ToolSchema } from "./requestSpec.js";

const EMPTY_PAYLOAD_SHA256 = sha256Hex(Buffer.alloc(0));

/** Why an assembly could not be completed. Each kind means something different. */
export type RequestSourceFailureKind =
  /** A referenced payload was lawfully deleted by retention. Not an alarm. */
  | "payload-pruned"
  /** A referenced payload is gone with no prune record, or unreadable. An alarm. */
  | "payload-missing"
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

type PayloadRead =
  | { readonly status: "ok"; readonly bytes: Buffer }
  | { readonly status: "pruned" }
  | { readonly status: "missing"; readonly detail: string };

/**
 * The bytes of one row's payload.
 *
 * Mirrors the precedence `verifyLedgerIntegrity` uses (`payload_pruned` first,
 * then the canonical path, then the live path) so that a row this function calls
 * pruned is the same row the verifier calls pruned. Two components disagreeing
 * about which rows still have bytes would be worse than either being wrong.
 */
function readPayload(workspace: string, event: EvidenceEvent): PayloadRead {
  if (event.payload_pruned === 1) {
    return { status: "pruned" };
  }
  if (event.payload_inline !== null && event.payload_inline !== undefined) {
    return { status: "ok", bytes: Buffer.from(event.payload_inline, "utf8") };
  }
  const payloadPath = event.payload_path ?? event.canonical_payload_path ?? null;
  if (payloadPath === null) {
    if (event.payload_sha256 === EMPTY_PAYLOAD_SHA256) {
      return { status: "ok", bytes: Buffer.alloc(0) };
    }
    return { status: "missing", detail: `event ${event.id} names no payload but commits to ${event.payload_sha256}` };
  }
  if (!pathExists(join(workspace, payloadPath))) {
    return { status: "missing", detail: `blob for event ${event.id} is gone (${payloadPath}) with no prune record` };
  }
  try {
    return { status: "ok", bytes: loadBlobPlaintext(workspace, payloadPath).bytes };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "missing", detail: `blob for event ${event.id} could not be read: ${reason}` };
  }
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
function toPart(entry: SurfaceEntry, event: EvidenceEvent, text: string): EncodablePart | { readonly error: string } {
  const meta = metaOf(event);
  switch (entry.part.kind) {
    case "text":
      return { kind: "text", text };
    case "thinking":
      return { kind: "thinking", text };
    case "image":
      return { kind: "image", sha256: entry.part.sha256 };
    case "tool_use": {
      const toolCallId = stringField(meta, "toolCallId");
      const toolName = stringField(meta, "toolName");
      if (toolCallId === null || toolName === null) {
        return { error: `event ${event.id} contributes a tool_use part but records no toolCallId/toolName` };
      }
      return { kind: "tool_use", toolCallId, toolName, argumentsJson: text };
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
    const read = readPayload(input.workspace, event);
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

  const entries = foldSurfaceEntries(input.events.slice(0, cutoffIndex + 1));
  const parts: { role: SurfaceEntry["role"]; part: EncodablePart }[] = [];
  for (const entry of entries) {
    if (entry.role === "system") {
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
    const part = toPart(entry, row, bytes.toString("utf8"));
    if ("error" in part) {
      return failure("unreconstructable", part.error, notes);
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
