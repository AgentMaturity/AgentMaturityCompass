import { realpathSync } from "node:fs";
import type { SandboxPolicy } from "../sandbox/sandboxTypes.js";
import { nativePtySupport, type NativePtySupport } from "./nativePtySandbox.js";
import { openNativePtyTerminal } from "./nativePtyTerminal.js";
import { TerminalSession } from "./terminalSession.js";
import { assertTerminalDimensions, type TerminalBackend, type TerminalSessionOptions } from "./terminalTypes.js";

export interface NativeTerminalRequest {
  readonly capability: "interactive-pty";
  readonly workspace: string;
  readonly cols: number;
  readonly rows: number;
  readonly timeoutMs: number;
}

export type NativeTerminalOperation =
  | { readonly kind: "open"; readonly request: NativeTerminalRequest }
  | { readonly kind: "input"; readonly data: string }
  | { readonly kind: "resize"; readonly cols: number; readonly rows: number };

/**
 * In-process host authorization, never reconstructed from a model/API payload.
 * The host must explicitly approve interactive shell authority, not reuse an
 * argv-scoped bash approval. check() must synchronously throw on revocation or
 * denial and is repeated before every input/resize. An AbortSignal terminates
 * an idle/revoked session as well. Sandbox construction is NOT authorization.
 */
export interface NativeTerminalGrant {
  readonly capability: "interactive-pty";
  readonly workspace: string;
  readonly policy: SandboxPolicy & { readonly network: "deny"; readonly signal: AbortSignal };
  readonly check: (operation: NativeTerminalOperation) => void;
}

export interface NativeTerminalHostOptions {
  readonly authorize?: (request: NativeTerminalRequest) => Promise<NativeTerminalGrant | undefined> | NativeTerminalGrant | undefined;
  readonly session?: TerminalSessionOptions;
}

/** Native package surface; no kernel/workspace-only imports. Deny by default. */
export class NativeTerminalHost {
  private readonly sessions = new Set<TerminalSession>();
  private readonly opening = new Set<AbortController>();
  private disposed = false;

  constructor(private readonly options: NativeTerminalHostOptions = {}) {}

  support(): NativePtySupport { return nativePtySupport(); }
  get openCount(): number { return this.sessions.size; }

  async open(options: { readonly workspace: string; readonly cols?: number; readonly rows?: number; readonly timeoutMs?: number }): Promise<TerminalSession> {
    if (this.disposed) throw new Error("The terminal host is disposed.");
    if (!this.options.authorize) throw new Error("Interactive PTY access requires an explicit host authorizer; a bash approval is not an interactive grant.");
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const timeoutMs = options.timeoutMs ?? 300_000;
    assertTerminalDimensions(cols, rows);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86_400_000) throw new RangeError("Invalid terminal lifetime.");
    const request = Object.freeze({ capability: "interactive-pty" as const, workspace: realpathSync(options.workspace), cols, rows, timeoutMs });
    const lifetime = new AbortController();
    this.opening.add(lifetime);
    let detachRevocation: (() => void) | undefined;
    let transferred = false;
    try {
      const grant = await this.options.authorize(request);
      if (this.disposed || lifetime.signal.aborted) throw new Error("The terminal host closed while authorization was pending.");
      if (!grant || grant.capability !== "interactive-pty" || grant.workspace !== request.workspace || !grant.policy ||
          grant.policy.network !== "deny" || !grant.policy.signal || typeof grant.policy.signal.addEventListener !== "function" || typeof grant.check !== "function" ||
          !Number.isSafeInteger(grant.policy.timeoutMs) || grant.policy.timeoutMs <= 0 || grant.policy.timeoutMs > timeoutMs) {
        throw new Error("Interactive terminal authorization was denied or does not match the requested scope/lifetime.");
      }
      const check = grant.check;
      const grantSignal = grant.policy.signal;
      const revoke = (): void => lifetime.abort();
      grantSignal.addEventListener("abort", revoke, { once: true });
      detachRevocation = () => grantSignal.removeEventListener("abort", revoke);
      if (grantSignal.aborted) revoke();
      const policy = Object.freeze({ ...grant.policy, writableRoots: Object.freeze([...grant.policy.writableRoots]),
        scrubValues: Object.freeze([...(grant.policy.scrubValues ?? [])]),
        signal: lifetime.signal });
      const guard = (operation: NativeTerminalOperation): void => {
        if (this.disposed || policy.signal.aborted) throw new Error("Interactive terminal authorization was revoked.");
        const verdict: unknown = check(Object.freeze(operation));
        // check is a synchronous deny-or-throw contract. Accidentally passing
        // an async check must fail closed rather than send bytes before review.
        if (verdict !== undefined) {
          // Consume a mistakenly returned rejected Promise without treating it
          // as authorization or creating an unhandled rejection in the host.
          if (verdict && (typeof verdict === "object" || typeof verdict === "function") && "then" in verdict) {
            void Promise.resolve(verdict).catch(() => undefined);
          }
          throw new Error("Terminal authorization checks must synchronously return void or throw.");
        }
        if (policy.signal.aborted) throw new Error("Interactive terminal authorization was revoked during review.");
      };
      guard({ kind: "open", request });
      const backend = openNativePtyTerminal({ cwd: request.workspace, policy, cols, rows });
      const guarded: TerminalBackend = {
        ...backend,
        write(data): void | Promise<void> { guard({ kind: "input", data }); return backend.write(data); },
        resize(nextCols, nextRows): void | Promise<void> {
          guard({ kind: "resize", cols: nextCols, rows: nextRows });
          return backend.resize!(nextCols, nextRows);
        }
      };
      let session: TerminalSession;
      try { session = new TerminalSession(guarded, this.options.session); }
      catch (error) { backend.dispose(); throw error; }
      this.sessions.add(session);
      void session.done.then(() => { this.sessions.delete(session); detachRevocation?.(); lifetime.abort(); });
      // Transfer lifetime ownership from pending authorization to the session.
      this.opening.delete(lifetime);
      transferred = true;
      return session;
    } finally {
      this.opening.delete(lifetime);
      if (!transferred) { detachRevocation?.(); lifetime.abort(); }
    }
  }

  close(session: TerminalSession): void {
    if (this.sessions.has(session)) session.dispose();
    // Keep it counted until observed closure, not merely a disposal request.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.opening) pending.abort();
    for (const session of this.sessions) session.dispose();
  }
}
