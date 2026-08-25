/**
 * Interactive terminals as a composed service (P4.2).
 *
 * `ctx.amcTerminal` opens shell sessions and owns their disposal. A plugin
 * that declares `inject: ["amcTerminal"]` stays PENDING until a host has
 * composed one, because a shell nobody can enumerate is a shell nobody can
 * close — and unlike a tool call, a terminal outlives the turn that opened it.
 *
 * WHY THE BACKEND IS A PARAMETER. The pipe backend ships today and always
 * works: no native dependency, so installing AMC cannot fail on a machine
 * without a compiler. A PTY backend can be composed in later without this
 * service changing, which is the whole reason the seam takes a factory rather
 * than opening the shell itself.
 *
 * WHAT DISPOSAL DOES. Terminates every session it opened. A shell left running
 * after its fiber is gone is unreachable — and because the substrate detaches
 * for tree-kill, it does not even die with the terminal.
 *
 * This module lives under src/kernel/ because it imports workspace packages
 * the published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "@amc/core";
import type { Context } from "@amc/cordis";
import { openPipeTerminal, type PipeTerminalOptions } from "../../terminal/pipeTerminal.js";
import { TerminalSession } from "../../terminal/terminalSession.js";
import type { TerminalBackend, TerminalSessionOptions } from "../../terminal/terminalTypes.js";

export const TERMINAL_SEAM = defineSeam("amcTerminal");

export interface TerminalServiceConfig {
  /**
   * How a backend is opened. Defaults to pipes.
   *
   * The extension point for a PTY backend, which is a packaging decision
   * rather than a code one: node-pty is native, and AMC publishes a CLI whose
   * install must not require build tools.
   */
  readonly openBackend?: (options: PipeTerminalOptions) => TerminalBackend;
  readonly session?: TerminalSessionOptions;
}

export class TerminalSeamService extends AmcSeam {
  private readonly sessions = new Set<TerminalSession>();

  constructor(ctx: Context, private readonly config: TerminalServiceConfig = {}) {
    super(ctx, TERMINAL_SEAM.name);
    this.track(() => () => this.closeAll());
  }

  /** Open a shell. The caller closes it, or disposal does. */
  open(options: PipeTerminalOptions): TerminalSession {
    const backend = (this.config.openBackend ?? openPipeTerminal)(options);
    const session = new TerminalSession(backend, this.config.session ?? {});
    this.sessions.add(session);
    return session;
  }

  close(session: TerminalSession): void {
    if (!this.sessions.delete(session)) return;
    session.dispose();
  }

  get openCount(): number {
    return this.sessions.size;
  }

  private closeAll(): void {
    for (const session of [...this.sessions]) this.close(session);
  }
}

export const terminalServices = {
  name: "amc-terminal-services",
  apply(ctx: Context, config: TerminalServiceConfig = {}): void {
    ctx.plugin(TerminalSeamService, config);
  }
};
