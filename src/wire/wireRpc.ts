import { canonicalize } from "../utils/json.js";

/**
 * The JSON-RPC 2.0 envelope this wire accepts, and the replies it writes
 * (plan P7.1a).
 *
 * STRICT, AND FAIL LOUDLY. Every rule here refuses rather than repairs. dsh's
 * transport drops a message it cannot understand, which leaves the caller
 * waiting forever for a reply that will never come -- a hang is the worst
 * failure to debug because nothing anywhere reports it. A refusal that names an
 * error code is strictly kinder than silence, and costs a peer nothing it did
 * not already spend.
 *
 * Unknown top-level members are REFUSED rather than ignored, for the reason
 * `.strict()` exists elsewhere in this repo: a member a peer believes it set and
 * a server silently drops is a request that does not do what it plainly says.
 *
 * WHERE THE CREDENTIAL LIVES. JSON-RPC has no headers, so the lease travels as
 * its own top-level member. That is an AMC extension to the envelope and is
 * deliberate: putting it in `params` would make it a method argument -- something
 * a handler could forget to check -- whereas here it is part of the frame every
 * message must present, and is verified before any method is looked up. It is
 * per MESSAGE, not per connection, because a connection is not a credential.
 *
 * NOTIFICATIONS ARE NOT SUPPORTED. A JSON-RPC notification (a call with no `id`)
 * is a request whose outcome the peer cannot learn. On a surface whose whole
 * purpose is producing signed, checkable acceptances, an unanswerable call is a
 * contradiction: the reply IS the receipt. A message without an id is refused.
 */

/** Codes from the JSON-RPC 2.0 spec, plus one implementation-defined. */
export const WIRE_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** In the -32000..-32099 range the spec reserves for the implementation. */
  unauthorized: -32001
} as const;

export type WireErrorCode = (typeof WIRE_ERROR)[keyof typeof WIRE_ERROR];

/** An id is echoed back exactly as received, so its JSON type is preserved. */
export type WireId = string | number;

export interface WireRequest {
  readonly id: WireId;
  readonly method: string;
  readonly params: Record<string, unknown>;
  /** The lease token presented with THIS message. Never trusted until verified. */
  readonly lease: string;
}

export type ParsedWireRequest =
  | { readonly ok: true; readonly request: WireRequest }
  | {
      readonly ok: false;
      readonly code: WireErrorCode;
      /** Says what was wrong with the frame. Never quotes it. */
      readonly message: string;
      /** Null when the frame was too malformed to carry a usable id. */
      readonly id: WireId | null;
    };

const ENVELOPE_MEMBERS = new Set(["jsonrpc", "id", "method", "params", "lease"]);

/**
 * Read one already-validated JSON object as a request.
 *
 * The value has been through ./wireJson.ts, so it is a plain object with no
 * duplicate or reserved keys and a digest that describes it. What is left to
 * decide is whether it is a REQUEST.
 */
export function parseWireRequest(value: Record<string, unknown>): ParsedWireRequest {
  // The id is recovered first so that a reply can be addressed even when the
  // rest of the frame is rejected. A peer that cannot match a refusal to the
  // call that caused it is barely better off than one that got silence.
  const rawId = value["id"];
  const id: WireId | null =
    typeof rawId === "string" || (typeof rawId === "number" && Number.isFinite(rawId))
      ? rawId
      : null;

  if (value["jsonrpc"] !== "2.0") {
    return { ok: false, code: WIRE_ERROR.invalidRequest, message: "jsonrpc must be \"2.0\"", id };
  }
  for (const member of Object.keys(value)) {
    if (!ENVELOPE_MEMBERS.has(member)) {
      return {
        ok: false,
        code: WIRE_ERROR.invalidRequest,
        // The member name is a peer-chosen string, so it is reported by count
        // rather than quoted back into a reply and a log.
        message: "request has a member this wire does not define",
        id
      };
    }
  }
  if (id === null) {
    // Covers a missing id, a null id, and a non-finite number. `null` is called
    // out because dsh's correlation map loses it entirely, so a peer sending one
    // would wait forever.
    return {
      ok: false,
      code: WIRE_ERROR.invalidRequest,
      message: "id must be a string or a finite number; notifications are not supported",
      id: null
    };
  }
  if (typeof value["method"] !== "string" || value["method"].length === 0) {
    return { ok: false, code: WIRE_ERROR.invalidRequest, message: "method must be a non-empty string", id };
  }
  if (typeof value["lease"] !== "string" || value["lease"].length === 0) {
    return { ok: false, code: WIRE_ERROR.unauthorized, message: "message presented no lease", id };
  }

  const rawParams = value["params"];
  if (rawParams !== undefined && (rawParams === null || typeof rawParams !== "object" || Array.isArray(rawParams))) {
    // By-position params are refused with by-name accepted: a positional call
    // means the meaning of an argument is its index, which no signed record
    // should have to reconstruct.
    return { ok: false, code: WIRE_ERROR.invalidParams, message: "params must be an object", id };
  }

  return {
    ok: true,
    request: {
      id,
      method: value["method"],
      params: (rawParams as Record<string, unknown> | undefined) ?? {},
      lease: value["lease"]
    }
  };
}

/**
 * One reply, as the bytes to write.
 *
 * Serialised with `canonicalize` so the same reply is always the same bytes --
 * which matters because a peer may digest what it received. Newline-terminated
 * because that is the frame.
 */
export function serializeWireReply(
  reply:
    | { readonly id: WireId; readonly result: unknown }
    | { readonly id: WireId | null; readonly error: { readonly code: WireErrorCode; readonly message: string } }
): Buffer {
  const body = "error" in reply
    ? { jsonrpc: "2.0", id: reply.id, error: reply.error }
    : { jsonrpc: "2.0", id: reply.id, result: reply.result };
  return Buffer.from(`${canonicalize(body)}\n`, "utf8");
}
