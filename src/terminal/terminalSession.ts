import { randomUUID } from "node:crypto";
import type {
  ReadinessRung,
  TerminalBackend,
  TerminalReadiness,
  TerminalSendResult,
  TerminalSessionOptions
} from "./terminalTypes.js";

/**
 * One shell session, and the readiness ladder (P4.2).
 *
 * THE SENTINEL IS PER SEND, AND THAT IS A SECURITY PROPERTY, NOT TIDINESS.
 * After the command, the session writes a line printing a nonce and `$?`. A
 * fixed sentinel could be produced by the command itself — `echo AMC-DONE` —
 * and the session would report a completion that never happened, with an exit
 * code the command chose. The nonce is fresh per send, so output can only
 * contain it by having been generated after the command finished.
 *
 * WHY THE LADDER HAS FOUR RUNGS AND ONLY TWO PROVE ANYTHING. `exited` and
 * `marker` observe completion. `idle` infers it from silence, which a slow
 * command is indistinguishable from. `timeout` observes nothing at all and
 * settles nothing — it is reported with `settled: false` so a caller cannot
 * read a hung shell as a finished command.
 */

const DEFAULTS = {
  idleSilenceMs: 2_000,
  timeoutMs: 30_000,
  pollIntervalMs: 50
} as const;

interface PendingSend {
  readonly nonce: string;
  readonly startedAt: number;
  buffer: string;
  lastOutputAt: number;
  sawOutput: boolean;
}

function readiness(
  rung: ReadinessRung,
  evidence: string,
  elapsedMs: number
): TerminalReadiness {
  return {
    rung,
    settled: rung !== "timeout",
    // Silence is not proof: a command that pauses between writes looks
    // identical to one that has finished.
    proven: rung === "exited" || rung === "marker",
    evidence,
    elapsedMs
  };
}

export class TerminalSession {
  private readonly options: Required<TerminalSessionOptions>;
  private readonly detach: Array<() => void> = [];
  private pending: PendingSend | null = null;
  private exited: { code: number | null } | null = null;
  private busy = false;

  constructor(private readonly backend: TerminalBackend, options: TerminalSessionOptions = {}) {
    this.options = {
      idleSilenceMs: options.idleSilenceMs ?? DEFAULTS.idleSilenceMs,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULTS.pollIntervalMs
    };
    this.detach.push(backend.onData((text) => {
      if (!this.pending) return;
      this.pending.buffer += text;
      this.pending.lastOutputAt = Date.now();
      this.pending.sawOutput = true;
    }));
    this.detach.push(backend.onExit((code) => {
      this.exited = { code };
    }));
  }

  /** Whether this backend can be resized. A pipe cannot; it does not pretend. */
  get canResize(): boolean {
    return typeof this.backend.resize === "function";
  }

  get backendKind(): TerminalBackend["kind"] {
    return this.backend.kind;
  }

  /**
   * Send one command and wait for readiness.
   *
   * One send at a time: two concurrent sends would interleave their output in
   * a single stream, and neither could say which bytes were its own.
   */
  async send(command: string): Promise<TerminalSendResult> {
    if (this.busy) throw new Error("a send is already in flight on this terminal");
    if (this.exited !== null) {
      return {
        readiness: readiness("exited", "the shell had already exited", 0),
        output: "",
        exitCode: this.exited.code
      };
    }
    this.busy = true;
    const nonce = `AMC${randomUUID().replace(/-/g, "")}`;
    const startedAt = Date.now();
    this.pending = { nonce, startedAt, buffer: "", lastOutputAt: startedAt, sawOutput: false };

    // A separate LINE, not a separate command joined by `;`.
    //
    // Not for the exit status -- `$?` refers to the user's command either way,
    // because it is expanded after that command has run. It is so the sentinel
    // never becomes part of the user's command TEXT: `sleep 1 &` joined with
    // `; printf ...` is a syntax error, and so is anything ending in a pipe or
    // a trailing backslash. On its own line the shell parses it independently.
    this.backend.write(`${command}\n`);
    this.backend.write(`printf '%s%d\\n' '${nonce}' "$?"\n`);

    try {
      return await this.awaitReadiness();
    } finally {
      this.pending = null;
      this.busy = false;
    }
  }

  private async awaitReadiness(): Promise<TerminalSendResult> {
    for (;;) {
      const settled = this.evaluate();
      if (settled) return settled;
      await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs));
    }
  }

  /** One pass down the ladder. Returns null when no rung has anything to say. */
  private evaluate(): TerminalSendResult | null {
    const pending = this.pending;
    if (!pending) return null;
    const elapsed = Date.now() - pending.startedAt;

    // Rung: marker. Checked BEFORE exit, because a shell that ran the command
    // and then exited still told us how the command ended, and that is the
    // more informative of two true answers.
    const marked = this.matchNonce(pending);
    if (marked) {
      return {
        readiness: readiness("marker", `this send's sentinel returned with status ${marked.exitCode}`, elapsed),
        output: marked.output,
        exitCode: marked.exitCode
      };
    }

    // Rung: exited. The shell is gone and never produced the sentinel, so the
    // command's own status is unknowable.
    if (this.exited !== null) {
      return {
        readiness: readiness("exited", "the shell exited before the sentinel returned", elapsed),
        output: pending.buffer,
        exitCode: null
      };
    }

    // Rung: idle. Inference, and reported as such.
    const idleFor = Date.now() - pending.lastOutputAt;
    if (pending.sawOutput && idleFor >= this.options.idleSilenceMs) {
      return {
        readiness: readiness("idle", `no output for ${idleFor}ms; completion inferred, not observed`, elapsed),
        output: pending.buffer,
        exitCode: null
      };
    }

    // Rung: timeout. Settles nothing.
    if (elapsed >= this.options.timeoutMs) {
      return {
        readiness: readiness("timeout", `no readiness established within ${this.options.timeoutMs}ms`, elapsed),
        output: pending.buffer,
        exitCode: null
      };
    }

    return null;
  }

  /**
   * Find this send's own sentinel line.
   *
   * Matched against the nonce minted for THIS send, so a command that printed
   * a previous send's sentinel — or invented one — cannot settle this one.
   */
  private matchNonce(pending: PendingSend): { output: string; exitCode: number } | null {
    const at = pending.buffer.indexOf(pending.nonce);
    if (at < 0) return null;
    const rest = pending.buffer.slice(at + pending.nonce.length);
    const newline = rest.indexOf("\n");
    if (newline < 0) return null; // the status digits may still be arriving
    const status = Number.parseInt(rest.slice(0, newline), 10);
    if (!Number.isInteger(status)) return null;
    return { output: pending.buffer.slice(0, at), exitCode: status };
  }

  dispose(): void {
    for (const off of this.detach.splice(0)) off();
    this.backend.dispose();
  }
}
