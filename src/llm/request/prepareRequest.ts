/**
 * The send path: the only way to obtain bytes for a model (plan P3.1).
 *
 * `SessionService.recordRequestHeader` already guaranteed that bytes cannot
 * reach a model without a signed row committing to their digest. This adds the
 * other half — that the bytes are RECONSTRUCTABLE from that row — by making the
 * request a pure function of things the log already holds:
 *
 *   1. the tool schema is committed as a `request/tools` payload FIRST, so the
 *      header's digest has a durable referent before it is written;
 *   2. the messages are assembled by `resolveRequestSources` from the session's
 *      committed rows, not from anything the caller is holding — a message that
 *      is not in the log cannot be sent, because there is no parameter for one;
 *   3. the bytes come from a named, versioned encoder, and the name and version
 *      are recorded in the header.
 *
 * The result is that `deriveRecordedRequest` can run the same three steps later
 * with nothing but the log. It is worth being explicit that (2) is a design
 * CONSTRAINT and not a convenience: `PrepareRequestSpec` has no `messages`
 * field, so "the model saw something that was never logged" is not expressible
 * through this seam rather than merely discouraged.
 *
 * Credentials appear nowhere here. The encoder produces a request BODY; the API
 * key is a transport header the adapter attaches, resolved per request through
 * `ctx.amcCredentials` (P3.0). Keeping it out of the body is what keeps it out
 * of the signed row, which would otherwise be a durable record of the secret.
 */
import type { PreparedRequest, SessionService } from "../../session/sessionService.js";
import { RequestEncodingError } from "./requestSpec.js";
import type { EncodableRequest, ToolSchema } from "./requestSpec.js";
import { canonicalToolSchemaBytes } from "./requestSpec.js";
import { DEFAULT_REQUEST_ENCODERS } from "./deriveRequest.js";
import type { RequestEncoderRegistry } from "./requestEncoder.js";
import { resolveRequestSources } from "./requestSources.js";

export interface PrepareRequestSpec {
  readonly model: string;
  readonly providerId: string;
  /** Which encoder turns this request into bytes. Recorded in the header. */
  readonly encoderId: string;
  readonly encoderVersion: number;
  /** Provider parameters (max_tokens, temperature, …), verbatim. */
  readonly params: Record<string, unknown>;
  /** The `system/prompt` event whose payload is this request's system text. */
  readonly systemPromptEventId: string;
  /** Tools to offer the model, or null. Committed before the header is written. */
  readonly tools: readonly ToolSchema[] | null;
  readonly encoders?: RequestEncoderRegistry;
  /** Send-time admission only; never changes historical byte derivation. */
  readonly assertRequest?: (request: EncodableRequest) => void;
}

/**
 * Thrown when a request cannot be prepared from what the session holds.
 *
 * Separate from {@link RequestEncodingError} so a caller can tell "the log does
 * not support this request" from "this request has no encoding".
 */
export class RequestPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestPreparationError";
  }
}

/**
 * Commit the tool schema, assemble from the log, encode, and record the header.
 *
 * Returns the `PreparedRequest` minted by `recordRequestHeader` — so the caller
 * still cannot hold transmittable bytes without the signed row, and now also
 * cannot hold bytes that the log fails to explain.
 */
export function prepareRequest(session: SessionService, spec: PrepareRequestSpec): PreparedRequest {
  const encoders = spec.encoders ?? DEFAULT_REQUEST_ENCODERS;
  const encoder = encoders.get(spec.encoderId, spec.encoderVersion);
  if (encoder === null) {
    throw new RequestPreparationError(
      `no request encoder ${spec.encoderId}@${spec.encoderVersion} is registered (have: ${encoders.list().join(", ") || "none"})`
    );
  }

  // The tool schema is committed BEFORE the header, so the header's digest names
  // a row that already exists. The reverse order would leave a window in which a
  // crash produced a header committing to bytes nothing stored.
  const toolSchema =
    spec.tools === null ? null : session.recordToolSchema(canonicalToolSchemaBytes(spec.tools));

  // Read AFTER the tools row so the cutoff names a row that is already durable.
  const events = session.readEvents();
  const cutoff = events[events.length - 1];
  if (cutoff === undefined) {
    throw new RequestPreparationError("cannot prepare a request for a session with no committed events");
  }

  const resolution = resolveRequestSources({
    workspace: session.workspace,
    events,
    model: spec.model,
    params: spec.params,
    systemPromptEventId: spec.systemPromptEventId,
    toolSchemaEventId: toolSchema?.eventId ?? null,
    toolSchemaSha256: toolSchema?.payloadSha256 ?? null,
    projectionCutoffEventId: cutoff.id
  });
  if (resolution.failure !== null || resolution.request === null) {
    const detail = resolution.failure?.detail ?? "assembly produced no request";
    throw new RequestPreparationError(`cannot assemble the request from this session's log: ${detail}`);
  }
  if (resolution.notes.length > 0) {
    // Refusing here rather than sending: a note means a row's payload no longer
    // hashes to what it committed to, and building a request out of content the
    // log already disagrees with would put unexplainable bytes in front of a
    // model and then sign a header claiming they were derived.
    throw new RequestPreparationError(`refusing to build a request over inconsistent evidence: ${resolution.notes.join("; ")}`);
  }

  spec.assertRequest?.(resolution.request);
  return session.recordRequestHeader({
    model: spec.model,
    providerId: spec.providerId,
    params: spec.params,
    encoderId: encoder.id,
    encoderVersion: encoder.version,
    systemPromptEventId: spec.systemPromptEventId,
    toolSchema,
    projectionCutoffEventId: cutoff.id,
    projectionDigest: resolution.projectionDigest,
    sourceEventIds: resolution.sourceEventIds,
    requestBytes: encoder.encode(resolution.request)
  });
}
