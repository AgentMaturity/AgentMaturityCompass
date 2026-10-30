/**
 * Error vocabulary of the native SDK client. Input errors are caller mistakes;
 * protocol errors mean the native runtime broke its own wire contract (and are
 * fatal for the client, see AMCNativeClient); a refusal is the runtime's own
 * signed decision and carries its JSON-RPC code and data unchanged.
 */
/** @public */ export class AMCNativeInputError extends TypeError {
  constructor(message: string) { super(message); this.name = "AMCNativeInputError"; }
}

/** @public */ export class AMCNativeProtocolError extends Error {
  constructor(message: string) { super(message); this.name = "AMCNativeProtocolError"; }
}

/** @public */ export class AMCNativeLimitError extends AMCNativeProtocolError {
  constructor(readonly resource: "turn-events" | "turn-bytes" | "history-events" | "history-bytes" | "write-queue",
    readonly limit: number) {
    super(`native client exceeded its ${resource} limit (${limit}); no updates were silently discarded`);
    this.name = "AMCNativeLimitError";
  }
}

/** A local cancellation is not a server stop reason or a verified outcome. @public */
export class AMCNativeCancelledError extends AMCNativeProtocolError {
  constructor(message: string) { super(message); this.name = "AMCNativeCancelledError"; }
}

/** @public */ export class AMCNativeProcessError extends AMCNativeProtocolError {
  constructor(message: string, readonly exitCode: number | null, readonly signal: NodeJS.Signals | null) {
    super(message); this.name = "AMCNativeProcessError";
  }
}

/** @public */ export class AMCNativeRefusedError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message); this.name = "AMCNativeRefusedError";
  }
}

const ACP_STARTUP_REFUSED = -32003;

/**
 * `amc acp` refused its own launch configuration before serving any session. `reason` is
 * the runtime's stable code (mcp-config-tampered, mcp-config-unreviewed, mcp-config-duplicate,
 * mcp-config-unpaired, mcp-grant-class-mismatch, mcp-config-invalid, or startup-refused for
 * any other failure); the message is the runtime's fixed, secret-free text. @public
 */
export class AMCNativeStartupRefusedError extends AMCNativeRefusedError {
  constructor(readonly reason: string, message: string) {
    super(ACP_STARTUP_REFUSED, message, { reason }); this.name = "AMCNativeStartupRefusedError";
  }
}

/** @internal The coded reply to `initialize` from a refused runtime, typed; anything else unchanged. */
export function asStartupRefusal(error: unknown): unknown {
  const data = error instanceof AMCNativeRefusedError && error.code === ACP_STARTUP_REFUSED ? error.data : undefined;
  const reason = data !== null && typeof data === "object" ? (data as { reason?: unknown }).reason : undefined;
  return typeof reason === "string" && /^[a-z][a-z-]{0,63}$/.test(reason) ? new AMCNativeStartupRefusedError(reason, (error as Error).message) : error;
}

/** Live retention stopped; awaiting the same turn result can recover committed text. @public */
export class AMCNativeResyncRequiredError extends Error {
  readonly recoverable = true;
  constructor(readonly sessionId: string, readonly resource: "turn-events" | "turn-bytes", readonly limit: number) {
    super(`native update retention reached ${resource} (${limit}); await this turn's result for committed history resynchronization`);
    this.name = "AMCNativeResyncRequiredError";
  }
}
