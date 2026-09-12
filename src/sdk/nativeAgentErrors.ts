/**
 * Error vocabulary of the native SDK client. Input errors are caller mistakes;
 * protocol errors mean the native runtime broke its own wire contract (and are
 * fatal for the client, see AMCNativeClient); a refusal is the runtime's own
 * signed decision and carries its JSON-RPC code and data unchanged.
 */
export class AMCNativeInputError extends TypeError {
  constructor(message: string) { super(message); this.name = "AMCNativeInputError"; }
}

export class AMCNativeProtocolError extends Error {
  constructor(message: string) { super(message); this.name = "AMCNativeProtocolError"; }
}

export class AMCNativeLimitError extends AMCNativeProtocolError {
  constructor(readonly resource: "turn-events" | "turn-bytes" | "history-events" | "history-bytes" | "write-queue",
    readonly limit: number) {
    super(`native client exceeded its ${resource} limit (${limit}); no updates were silently discarded`);
    this.name = "AMCNativeLimitError";
  }
}

/** A local cancellation is not a server stop reason or a verified outcome. */
export class AMCNativeCancelledError extends AMCNativeProtocolError {
  constructor(message: string) { super(message); this.name = "AMCNativeCancelledError"; }
}

export class AMCNativeProcessError extends AMCNativeProtocolError {
  constructor(message: string, readonly exitCode: number | null, readonly signal: NodeJS.Signals | null) {
    super(message); this.name = "AMCNativeProcessError";
  }
}

export class AMCNativeRefusedError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message); this.name = "AMCNativeRefusedError";
  }
}
