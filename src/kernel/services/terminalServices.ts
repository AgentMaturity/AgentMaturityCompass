/**
 * Interactive terminals as a composed service (P4.2).
 *
 * `ctx.amcTerminal` opens shell sessions and owns their disposal. A plugin
 * that declares `inject: ["amcTerminal"]` stays PENDING until a host has
 * composed one, because a shell nobody can enumerate is a shell nobody can
 * close — and unlike a tool call, a terminal outlives the turn that opened it.
 *
 * TWO EXPLICIT PATHS. open() preserves the legacy trusted-host pipe seam.
 * openInteractive() uses the authorization-gated Linux Bubblewrap PTY host,
 * never the injectable pipe factory. Missing prerequisites/permission are
 * refusals, not a reason to open an unconfined shell instead.
 *
 * WHAT DISPOSAL DOES. Terminates every session it opened. A shell left running
 * after its fiber is gone is unreachable — and because the substrate detaches
 * for tree-kill, it does not even die with the terminal.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import { openPipeTerminal, type PipeTerminalOptions } from "../../terminal/pipeTerminal.js";
import { TerminalSession } from "../../terminal/terminalSession.js";
import { NativeTerminalHost, type NativeTerminalHostOptions } from "../../terminal/nativeTerminal.js";
import type { NativePtySupport } from "../../terminal/nativePtySandbox.js";
import type { TerminalBackend, TerminalSessionOptions } from "../../terminal/terminalTypes.js";

export const TERMINAL_SEAM = defineSeam("amcTerminal");

export interface TerminalServiceConfig {
  /**
   * How a backend is opened. Defaults to pipes.
   *
   * Legacy trusted-host extension point only. It cannot override the native
   * interactive launcher or acquire the native bash sandbox binding.
   */
  readonly openBackend?: (options: PipeTerminalOptions) => TerminalBackend;
  readonly session?: TerminalSessionOptions;
  /** Explicit interactive authorization; absent means PTY access is denied. */
  readonly native?: NativeTerminalHostOptions;
}

export class TerminalSeamService extends AmcSeam {
  private readonly sessions = new Set<TerminalSession>();
  private readonly native: NativeTerminalHost;
  private terminalDisposed = false;

  constructor(ctx: Context, private readonly config: TerminalServiceConfig = {}) {
    super(ctx, TERMINAL_SEAM.name);
    this.native = new NativeTerminalHost({ ...config.native, session: config.native?.session ?? config.session });
    this.track(() => () => this.closeAll());
  }

  /** Legacy host pipes, not a governed native agent-shell permission grant. */
  open(options: PipeTerminalOptions): TerminalSession {
    if (this.terminalDisposed) throw new Error("The terminal service is disposed.");
    const backend = (this.config.openBackend ?? openPipeTerminal)(options);
    let session: TerminalSession;
    try { session = new TerminalSession(backend, this.config.session ?? {}); }
    catch (error) { backend.dispose(); throw error; }
    this.sessions.add(session);
    void session.done.then(() => this.sessions.delete(session));
    return session;
  }

  /** The native path never consults openBackend or falls back to host pipes. */
  openInteractive(options: Parameters<NativeTerminalHost["open"]>[0]): Promise<TerminalSession> {
    return this.native.open(options);
  }

  nativeSupport(): NativePtySupport { return this.native.support(); }

  close(session: TerminalSession): void {
    if (this.sessions.has(session)) session.dispose();
    else this.native.close(session);
  }

  get openCount(): number {
    return this.sessions.size + this.native.openCount;
  }

  private closeAll(): void {
    this.terminalDisposed = true;
    this.native.dispose();
    for (const session of [...this.sessions]) this.close(session);
  }
}

export const terminalServices = {
  name: "amc-terminal-services",
  apply(ctx: Context, config: TerminalServiceConfig = {}): void {
    ctx.plugin(TerminalSeamService, config);
  }
};
