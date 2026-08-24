/**
 * What a request IS, before any provider gets an opinion about it (plan P3.1).
 *
 * An {@link EncodableRequest} is the complete, provider-neutral input to a
 * {@link import("./requestEncoder.js").RequestEncoder}. Its defining property is
 * that EVERY field can be rebuilt from signed session rows: the system text is a
 * `system/prompt` payload, each message part is some row's payload plus that
 * row's meta, the tool schema is a `request/tools` payload, and the model and
 * params are literals in the `request/header` row itself. That is what makes
 * "reconstruct the transmitted bytes from the log" a function rather than an
 * aspiration — there is no field here that only a live process could supply.
 *
 * The parts are spelled in AMC's own `SurfaceKind` vocabulary rather than any
 * provider's, for the same reason `StreamChunk` is (see ../streamChunk.ts):
 * a mapping table between two vocabularies is a place to get one kind wrong in
 * a row nobody can rewrite.
 */
import { canonicalize } from "../../utils/json.js";

/**
 * One tool as the model is shown it.
 *
 * `parameters` is a JSON Schema object. It is carried as data, never as a
 * pre-serialised string, so that {@link canonicalToolSchemaBytes} is the single
 * place a schema becomes bytes.
 */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * The exact bytes a `request/tools` row stores for a tool list.
 *
 * Canonical JSON — keys sorted at every depth, array order preserved. Sorting
 * kills a whole class of reconstruction failure: the schema comes back from the
 * log through `JSON.parse`, and a plain re-`stringify` would then depend on
 * object key order, which is a property of how the value was built rather than
 * of what it means. Array order is NOT sorted because tool order is visible to
 * the model and is therefore part of the request.
 *
 * Idempotent: `canonicalToolSchemaBytes` of a parsed canonical encoding is the
 * same encoding, which is what lets derivation verify the stored bytes are
 * canonical instead of assuming it.
 */
export function canonicalToolSchemaBytes(tools: readonly ToolSchema[]): Buffer {
  return Buffer.from(canonicalize(tools), "utf8");
}

/** A part of a message, carrying everything an encoder needs to emit it. */
export type EncodablePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "thinking"; readonly text: string }
  | {
      readonly kind: "tool_use";
      readonly toolCallId: string;
      readonly toolName: string;
      /** Raw JSON string exactly as the model produced it. */
      readonly argumentsJson: string;
    }
  | {
      readonly kind: "tool_result";
      readonly toolCallId: string;
      readonly isError: boolean;
      /** What the model is shown — the spill policy's output when one applied. */
      readonly text: string;
    }
  | {
      readonly kind: "image";
      /** Digest of the image bytes; the bytes themselves live in the blob store. */
      readonly sha256: string;
    };

/**
 * Consecutive same-role parts, as the surface projection grouped them.
 *
 * `role` is the SURFACE role (system / user / assistant / tool). Collapsing that
 * onto a provider's smaller role set is the encoder's job and is part of the
 * wire shape it is versioned on.
 */
export interface EncodableMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly parts: readonly EncodablePart[];
}

/** The complete input to an encoder. */
export interface EncodableRequest {
  readonly model: string;
  /** Provider parameters verbatim from the header row. */
  readonly params: Record<string, unknown>;
  /** System text, or null when the request carried none. */
  readonly system: string | null;
  /** Parsed tool schema, or null when the request carried no tools. */
  readonly tools: readonly ToolSchema[] | null;
  readonly messages: readonly EncodableMessage[];
}

/**
 * Thrown when a request cannot be turned into bytes at all.
 *
 * Distinct from a mismatch: a mismatch says the log and the bytes disagree,
 * while this says the encoder was handed something it has no defined encoding
 * for. Failing loudly is the only safe answer — an encoder that guessed would
 * produce bytes that no longer reconstruct.
 */
export class RequestEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestEncodingError";
  }
}
