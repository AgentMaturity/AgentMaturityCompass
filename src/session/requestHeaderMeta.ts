/**
 * The wire shape of a `request/header` event's type meta — writer and reader in
 * one place (plan P3.1, VERIFY-3).
 *
 * `SessionService.recordRequestHeader` annotates the object literal it appends
 * with {@link RequestHeaderMeta}, and request derivation
 * (src/llm/request/deriveRequest.ts) narrows a stored row's `meta_json` through
 * {@link parseRequestHeaderMeta}. Both halves therefore move together: adding a
 * field the derivation needs cannot silently skip the writer, and dropping one
 * the writer emits breaks the reader at compile time.
 *
 * KEY ORDER IS LOAD-BEARING and this file does NOT fix it. `sanitizeMetaForHash`
 * re-stringifies meta in insertion order and `canonicalize()` never descends
 * into `meta_json`, so the writer's literal is what pins the hash pre-image; a
 * TypeScript interface constrains which keys exist, never in what order they
 * were written. The reader below deliberately never re-serialises meta and never
 * recomputes `event_hash` from it — it reads fields out. Recomputing the row
 * hash is `verifyLedgerIntegrity`'s job, over the stored string, where order is
 * whatever was actually written.
 */

/**
 * Everything a `request/header` row states about the request it authorised.
 *
 * Every field is either a literal the encoder consumes or a REFERENCE to another
 * signed row. That is the whole design: the header names its inputs, the inputs
 * are durable, and so the transmitted bytes are a function of the log rather
 * than of anything a caller kept in memory.
 */
export interface RequestHeaderMeta {
  readonly model: string;
  readonly providerId: string;
  /**
   * Provider parameters exactly as supplied (temperature, max_tokens, …). Opaque
   * to the session spine; the encoder named below is what turns them into bytes.
   */
  readonly params: Record<string, unknown>;
  /** Identity of the deterministic encoder that produced the transmitted bytes. */
  readonly encoderId: string;
  /** Version of that encoder's wire shape. Bumped whenever its output changes. */
  readonly encoderVersion: number;
  /** `system/prompt` event whose payload is this request's system text. */
  readonly systemPromptEventId: string;
  /**
   * `request/tools` event whose payload is the exact tool-schema bytes, or null
   * when the request carried no tools. Never a digest without a referent: see
   * ./toolSchemaCommitment.ts.
   */
  readonly toolSchemaEventId: string | null;
  /** `payload_sha256` of that row; null exactly when `toolSchemaEventId` is null. */
  readonly toolSchemaSha256: string | null;
  /** Last event included in the projected history this request was built from. */
  readonly projectionCutoffEventId: string;
  /** Digest over that projected history, recomputable from the log at the cutoff. */
  readonly projectionDigest: string;
  /** Ordered ids of every row whose payload went into the request. */
  readonly sourceEventIds: readonly string[];
  /** sha256 of the exact transmitted bytes. The claim derivation checks. */
  readonly requestDigest: string;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrow a stored row's `meta_json` to a header meta, or null when it is not one.
 *
 * Boundary validation, not a cast: a row read back from a log is untrusted input
 * even when this process wrote it, and a derivation that trusted a malformed
 * header would report a byte mismatch (an alarm) for what is really a schema
 * problem. Returning null lets the caller say which it is.
 *
 * The two nullable tool-schema fields are checked TOGETHER: a header naming an
 * event but no digest, or a digest but no event, is exactly the defect this
 * field pair was introduced to remove, so it is rejected here rather than
 * carried forward.
 */
export function parseRequestHeaderMeta(metaJson: string): RequestHeaderMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (!isPlainRecord(parsed)) {
    return null;
  }
  const candidate = parsed;
  const toolSchemaEventId = candidate.toolSchemaEventId;
  const toolSchemaSha256 = candidate.toolSchemaSha256;
  const toolSchemaPaired =
    (toolSchemaEventId === null && toolSchemaSha256 === null) ||
    (typeof toolSchemaEventId === "string" && typeof toolSchemaSha256 === "string");
  if (
    typeof candidate.model !== "string" ||
    typeof candidate.providerId !== "string" ||
    !isPlainRecord(candidate.params) ||
    typeof candidate.encoderId !== "string" ||
    typeof candidate.encoderVersion !== "number" ||
    typeof candidate.systemPromptEventId !== "string" ||
    !toolSchemaPaired ||
    typeof candidate.projectionCutoffEventId !== "string" ||
    typeof candidate.projectionDigest !== "string" ||
    !isStringArray(candidate.sourceEventIds) ||
    typeof candidate.requestDigest !== "string"
  ) {
    return null;
  }
  return {
    model: candidate.model,
    providerId: candidate.providerId,
    params: candidate.params,
    encoderId: candidate.encoderId,
    encoderVersion: candidate.encoderVersion,
    systemPromptEventId: candidate.systemPromptEventId,
    toolSchemaEventId: typeof toolSchemaEventId === "string" ? toolSchemaEventId : null,
    toolSchemaSha256: typeof toolSchemaSha256 === "string" ? toolSchemaSha256 : null,
    projectionCutoffEventId: candidate.projectionCutoffEventId,
    projectionDigest: candidate.projectionDigest,
    sourceEventIds: [...candidate.sourceEventIds],
    requestDigest: candidate.requestDigest
  };
}
