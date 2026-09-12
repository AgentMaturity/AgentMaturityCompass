/**
 * The ACP JSON-RPC envelope (plan P7.1a).
 *
 * WHY NOT `src/wire/wireRpc.ts`, which is the same protocol version over the
 * same framing. Two of its rules are load-bearing there and wrong here:
 *
 *   - It REFUSES NOTIFICATIONS (`wireRpc.ts`: "notifications are not
 *     supported"), on the argument that a call whose outcome the peer cannot
 *     learn is a contradiction on a surface that exists to produce receipts.
 *     ACP is built on notifications in both directions -- `session/cancel`
 *     inbound, `session/update` outbound -- so that argument does not transfer.
 *   - It REQUIRES A `lease` MEMBER on every message. A real ACP client is an
 *     editor speaking stdio; it will never send one and cannot be made to.
 *
 * Importing that module would drag both in, so this file re-states the envelope
 * for a bidirectional peer. `ndjsonFraming.ts` and `wireJson.ts` ARE reused --
 * framing and byte-level content rules are the same problem in both directions.
 *
 * CLASSIFIED BY SHAPE, BEFORE ANYTHING IS READ. Which of the three kinds a
 * message is has to be decided from the members present, because reading it as
 * the wrong kind is how a response gets answered or a notification gets a reply
 * nobody is waiting for. `has(k)` means the key is present, NOT that it is
 * defined: `{"id": undefined}` cannot occur in JSON, but `{"result": null}` is a
 * legitimate response and `"result" in value` is the only test that sees it.
 */

export type AcpId = string | number;

export interface AcpErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export type AcpMessage =
  | { readonly kind: "request"; readonly id: AcpId; readonly method: string; readonly params: unknown }
  | { readonly kind: "notification"; readonly method: string; readonly params: unknown }
  | { readonly kind: "response"; readonly id: AcpId; readonly result: unknown }
  | { readonly kind: "response-error"; readonly id: AcpId; readonly error: AcpErrorObject }
  | { readonly kind: "malformed"; readonly reason: string; readonly id: AcpId | null };

const has = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Ids are echoed exactly; a float or a NaN would not survive correlation. */
function readId(raw: unknown): AcpId | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return raw;
  return null;
}

export function classifyAcpMessage(value: Record<string, unknown>): AcpMessage {
  if (value["jsonrpc"] !== "2.0") {
    return { kind: "malformed", reason: 'jsonrpc is not "2.0"', id: readId(value["id"]) };
  }

  if (has(value, "method")) {
    if (has(value, "result") || has(value, "error")) {
      return { kind: "malformed", reason: "a method cannot also carry a response result or error", id: readId(value["id"]) };
    }
    const method = value["method"];
    if (typeof method !== "string" || method.length === 0) {
      return { kind: "malformed", reason: "method is not a non-empty string", id: readId(value["id"]) };
    }
    const params = has(value, "params") ? value["params"] : undefined;
    // A request is a method WITH an id; a notification is the same without one.
    // The distinction decides whether anything may ever be written back, so it
    // is made here and nowhere else.
    if (!has(value, "id")) return { kind: "notification", method, params };
    const id = readId(value["id"]);
    if (id === null) {
      return { kind: "malformed", reason: "id is neither a string nor a safe integer", id: null };
    }
    return { kind: "request", id, method, params };
  }

  if (has(value, "id")) {
    const id = readId(value["id"]);
    if (id === null) {
      return { kind: "malformed", reason: "id is neither a string nor a safe integer", id: null };
    }
    const hasResult = has(value, "result");
    const hasError = has(value, "error");
    if (hasResult === hasError) {
      return { kind: "malformed", reason: "a response carries exactly one of result or error", id };
    }
    if (hasResult) return { kind: "response", id, result: value["result"] };
    const error = readError(value["error"]);
    return error
      ? { kind: "response-error", id, error }
      : { kind: "malformed", reason: "error is not {code:number, message:string}", id };
  }

  return { kind: "malformed", reason: "neither a method nor an id", id: null };
}

function readError(raw: unknown): AcpErrorObject | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const shape = raw as { code?: unknown; message?: unknown; data?: unknown };
  if (typeof shape.code !== "number" || !Number.isSafeInteger(shape.code)) return null;
  if (typeof shape.message !== "string") return null;
  return shape.data === undefined
    ? { code: shape.code, message: shape.message }
    : { code: shape.code, message: shape.message, data: shape.data };
}

/**
 * Serialise one frame.
 *
 * `JSON.stringify` rather than `canonicalize`: an ACP peer is not digesting what
 * it receives, and key order is not part of the protocol. The signed record of
 * what happened is the ledger, not the wire.
 */
function frame(body: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
}

export function acpResult(id: AcpId, result: unknown): Buffer {
  if (result === undefined || typeof result === "function" || typeof result === "symbol") throw new Error("An ACP handler returned no serializable result.");
  return frame({ jsonrpc: "2.0", id, result });
}

export function acpFailure(id: AcpId, error: AcpErrorObject): Buffer {
  return frame({ jsonrpc: "2.0", id, error });
}

export function acpNotification(method: string, params: unknown): Buffer {
  return frame({ jsonrpc: "2.0", method, params });
}

export function acpRequest(id: AcpId, method: string, params: unknown): Buffer {
  return frame({ jsonrpc: "2.0", id, method, params });
}
