/**
 * Reading a reply, with the same suspicion the server reads a request
 * (plan P7.1a).
 *
 * THE ENVELOPE ONLY. What a `result` contains is per-method and is decoded from
 * the shared declaration in ./wireCodecs.ts; this file decides whether the thing
 * that arrived is a reply at all. The two were briefly one module, which put a
 * hand-written reader for every field beside the envelope rules and gave the
 * client its own private idea of each method's shape.
 *
 * The server refuses a request whose `jsonrpc` is missing, or which carries a
 * member the protocol does not define. A client that accepted those in the other
 * direction would leave the two halves speaking different languages with only
 * one of them checking.
 */

/** Members a reply may carry. Anything else is a different protocol. */
const REPLY_MEMBERS = new Set(["jsonrpc", "id", "result", "error"]);

export interface WireReplyError {
  readonly code: number;
  readonly message: string;
}

export type WireReply =
  | { readonly kind: "result"; readonly id: number; readonly result: Record<string, unknown> }
  | { readonly kind: "error"; readonly id: number; readonly error: WireReplyError }
  /**
   * A fault the server could not address to any request -- it answers framing
   * and parse failures with a null id, because a record it could not delimit has
   * no id to quote back. Legitimate, and carrying the server's diagnostic, so it
   * is a distinct shape rather than an unknown-id violation. Treating it as one
   * discarded exactly the message that explains what went wrong.
   */
  | { readonly kind: "stream-fault"; readonly error: WireReplyError }
  /** The reply is not one this protocol defines. */
  | { readonly kind: "malformed"; readonly reason: string };

export function readWireReply(value: Record<string, unknown>): WireReply {
  if (value["jsonrpc"] !== "2.0") {
    return { kind: "malformed", reason: 'reply jsonrpc is not "2.0"' };
  }
  for (const member of Object.keys(value)) {
    if (!REPLY_MEMBERS.has(member)) {
      // Not quoted back: the member name is chosen by the far end.
      return { kind: "malformed", reason: "reply carries a member this protocol does not define" };
    }
  }

  const hasResult = "result" in value;
  const hasError = "error" in value;
  if (hasResult === hasError) {
    // Both, or neither. JSON-RPC 2.0 requires exactly one, and a reply carrying
    // both is ambiguous about whether the call succeeded.
    return { kind: "malformed", reason: "reply must carry exactly one of result or error" };
  }

  const rawId = value["id"];
  const id = typeof rawId === "number" && Number.isSafeInteger(rawId) ? rawId : null;
  if (rawId !== null && id === null) {
    return { kind: "malformed", reason: "reply id is neither a safe integer nor null" };
  }

  if (hasError) {
    // `error: null` reaches here. It used to be read as an error object and
    // dereferenced, which threw a TypeError out of the socket's data handler --
    // crashing the process and leaving the caller waiting forever.
    const error = readError(value["error"]);
    if (!error) return { kind: "malformed", reason: "reply error is not {code:number, message:string}" };
    return id === null ? { kind: "stream-fault", error } : { kind: "error", id, error };
  }

  if (id === null) {
    return { kind: "malformed", reason: "a reply with a null id must carry an error" };
  }
  const result = value["result"];
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { kind: "malformed", reason: "reply result is not an object" };
  }
  return { kind: "result", id, result: result as Record<string, unknown> };
}

function readError(raw: unknown): WireReplyError | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const shape = raw as { code?: unknown; message?: unknown };
  if (typeof shape.code !== "number" || !Number.isSafeInteger(shape.code)) return null;
  if (typeof shape.message !== "string") return null;
  return { code: shape.code, message: shape.message };
}
