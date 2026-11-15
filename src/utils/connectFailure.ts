/**
 * Error codes that mean the connection to the far end never opened, so not one byte of a request reached it:
 * nothing listening (ECONNREFUSED), no such host (ENOTFOUND, EAI_AGAIN), no route (EHOSTUNREACH, ENETUNREACH).
 * A reset, a timeout or a TLS failure is not on this list: the far end may have read part of the request.
 */
const NEVER_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

function ownCode(value: unknown): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, "code");
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * The code when `error` (or its cause chain, as fetch wraps it) says the connection never opened, else undefined.
 * An AggregateError (Node tries each address of a host) counts only when every attempt never connected.
 */
export function connectFailureCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || error === null || typeof error !== "object") return undefined;
  const code = ownCode(error);
  if (error instanceof AggregateError && error.errors.length > 0) {
    const codes = error.errors.map(inner => connectFailureCode(inner, depth + 1));
    return codes.every(value => value !== undefined) ? codes[0] : undefined;
  }
  if (typeof code === "string" && NEVER_CONNECTED.has(code)) return code;
  return connectFailureCode((error as { cause?: unknown }).cause, depth + 1);
}
