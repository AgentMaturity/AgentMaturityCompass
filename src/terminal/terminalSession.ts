import { randomUUID } from "node:crypto";
import { assertTerminalDimensions } from "./terminalTypes.js";
import type {
  ReadinessRung,
  TerminalBackend,
  TerminalExit,
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
 * code the command chose. A fresh nonce prevents accidental/stale matches.
 * This is readiness evidence, NOT an authentication boundary against a shell
 * that can inspect its own input. PTY echo must never itself count as a marker.
 *
 * ONLY TWO RUNGS PROVE COMPLETION. `exited` and
 * `marker` observe completion. `idle` infers it from silence, which a slow
 * command is indistinguishable from. `timeout` observes nothing at all and
 * settles nothing — it is reported with `settled: false` so a caller cannot
 * read a hung shell as a finished command. `cancelled` records a stop request,
 * not an observed exit; the separate done promise reports actual closure.
 */

const DEFAULTS = {
  idleSilenceMs: 2_000,
  timeoutMs: 30_000,
  pollIntervalMs: 50,
  maxOutputBytes: 1_048_576
} as const;

interface PendingSend {
  readonly nonce: string;
  readonly startedAt: number;
  buffer: string;
  lastOutputAt: number;
  sawOutput: boolean;
  droppedBytes: number;
}

function readiness(
  rung: ReadinessRung,
  evidence: string,
  elapsedMs: number
): TerminalReadiness {
  return {
    rung,
    settled: rung !== "timeout" && rung !== "cancelled",
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
  /** Idle/timeout do not authorize a second command to interleave with this one. */
  private unresolved: PendingSend | null = null;
  private exited: { code: number | null } | null = null;
  private busy = false;
  private started: boolean;
  private stopped: "cancel" | "dispose" | null = null;
  private readonly dataListeners = new Set<(text: string) => void>();
  private readonly exitListeners = new Set<(code: number | null) => void>();
  private finalExit: TerminalExit | null = null;
  private resolveDone!: (exit: TerminalExit) => void;
  readonly done: Promise<TerminalExit>;
  readonly ready: Promise<void>;

  constructor(private readonly backend: TerminalBackend, options: TerminalSessionOptions = {}) {
    this.options = {
      idleSilenceMs: options.idleSilenceMs ?? DEFAULTS.idleSilenceMs,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULTS.maxOutputBytes
    };
    for (const [name, value] of Object.entries(this.options)) {
      if (!Number.isSafeInteger(value) || value <= 0 || value > 16_777_216) throw new RangeError(`Invalid terminal ${name}.`);
    }
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
    this.started = backend.ready === undefined;
    this.ready = backend.ready ?? Promise.resolve();
    // Consumers may observe startup through done instead; do not create an
    // unhandled rejection merely because they chose that lifecycle surface.
    void this.ready.catch(() => undefined);
    void this.ready.then(() => { this.started = true; }, () => undefined);
    this.detach.push(backend.onData((text) => {
      const pending = this.pending ?? this.unresolved;
      if (pending) {
        const bytes = Buffer.from(pending.buffer + text, "utf8");
        let offset = Math.max(0, bytes.length - this.options.maxOutputBytes);
        while (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80) offset++;
        pending.droppedBytes += offset;
        pending.buffer = bytes.subarray(offset).toString("utf8");
        pending.lastOutputAt = Date.now();
        pending.sawOutput = true;
        if (this.unresolved === pending && this.matchNonce(pending)) this.unresolved = null;
      }
      for (const listener of [...this.dataListeners]) {
        try { listener(text); } catch { /* An observer cannot break process cleanup. */ }
      }
    }));
    const offExit = backend.onExit((code) => {
      this.exited = { code };
      if (!backend.done) this.finish({ code, signal: null, reason: this.stopped ?? "exit", treeExitProven: false });
    });
    if (this.finalExit) offExit();
    else this.detach.push(offExit);
    if (backend.done) void backend.done.then((exit) => this.finish(exit), () => this.finish({
      code: null, signal: null, reason: "error", treeExitProven: false, error: "Terminal lifecycle failed."
    }));
  }

  private finish(exit: TerminalExit): void {
    if (this.finalExit) return;
    this.finalExit = Object.freeze({ ...exit });
    this.exited = { code: exit.code };
    this.unresolved = null;
    for (const off of this.detach.splice(0)) {
      try { off(); } catch { /* One faulty observer must not strand done or the remaining subscriptions. */ }
    }
    this.resolveDone(this.finalExit);
    for (const listener of [...this.exitListeners]) {
      try { listener(exit.code); } catch { /* Preserve remaining subscribers and cleanup. */ }
    }
    this.exitListeners.clear();
    this.dataListeners.clear();
  }

  get state(): "starting" | "open" | "closing" | "exited" {
    return this.exited ? "exited" : this.stopped ? "closing" : this.started ? "open" : "starting";
  }

  get pid(): number | null { return this.backend.pid ?? null; }

  /** Live transcript, including prompts, control sequences and shell echo. */
  onData(listener: (text: string) => void): () => void {
    if (this.finalExit) return () => undefined;
    this.dataListeners.add(listener);
    return () => { this.dataListeners.delete(listener); };
  }

  onExit(listener: (code: number | null) => void): () => void {
    if (this.finalExit) { listener(this.finalExit.code); return () => undefined; }
    this.exitListeners.add(listener);
    return () => { this.exitListeners.delete(listener); };
  }

  /** Raw input for prompts/full-screen programs; no newline or sentinel added. */
  async write(data: string): Promise<void> {
    this.assertOpen();
    await this.ready;
    this.assertOpen();
    await this.backend.write(data);
  }

  async resize(cols: number, rows: number): Promise<void> {
    assertTerminalDimensions(cols, rows);
    this.assertOpen();
    if (!this.backend.resize) throw new Error("This terminal is a pipe and cannot resize.");
    await this.ready;
    this.assertOpen();
    await this.backend.resize(cols, rows);
  }

  private assertOpen(): void {
    if (this.stopped || this.exited) throw new Error("The terminal is closing or has exited.");
  }

  cancel(): void {
    if (this.stopped || this.exited) return;
    this.stopped = "cancel";
    if (this.backend.cancel) this.backend.cancel();
    else this.backend.dispose();
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
  async send(command: string, options: { readonly signal?: AbortSignal } = {}): Promise<TerminalSendResult> {
    if (this.busy) throw new Error("a send is already in flight on this terminal");
    if (this.unresolved && !this.exited && !this.stopped) throw new Error("The previous command has no completion marker; use raw write() to continue it or cancel the terminal.");
    if (this.backend.supportsCommandMarkers === false) throw new Error("This shell does not support POSIX command markers; use raw write().");
    if (options.signal?.aborted) this.cancel();
    if (this.stopped) return { readiness: readiness("cancelled", "terminal stop requested; exit is not yet proven", 0), output: "", exitCode: null };
    if (this.exited !== null) {
      return {
        readiness: readiness("exited", "the shell had already exited", 0),
        output: "",
        exitCode: null
      };
    }
    this.busy = true;
    const nonce = `AMC${randomUUID().replace(/-/g, "")}`;
    const startedAt = Date.now();
    this.pending = { nonce, startedAt, buffer: "", lastOutputAt: startedAt, sawOutput: false, droppedBytes: 0 };
    const abort = (): void => this.cancel();
    options.signal?.addEventListener("abort", abort, { once: true });
    let commandSubmitted = false;

    // A separate LINE, not a separate command joined by `;`.
    //
    // Not for the exit status -- `$?` refers to the user's command either way,
    // because it is expanded after that command has run. It is so the sentinel
    // never becomes part of the user's command TEXT: `sleep 1 &` joined with
    // `; printf ...` is a syntax error, and so is anything ending in a pipe or
    // a trailing backslash. On its own line the shell parses it independently.
    try {
      if (this.backend.ready) await this.ready;
      if (!this.stopped) {
        const commandWrite = this.backend.write(`${command}\n`);
        commandSubmitted = true;
        // Queue both lines in order, before a fast command can close the shell.
        // Attach immediately in case the second permission/write call throws.
        if (commandWrite) void commandWrite.catch(() => undefined);
        const markerWrite = this.backend.write(`printf '%s%d\\n' '${nonce}' "$?"\n`);
        await Promise.all([commandWrite, markerWrite]);
      }
      const result = await this.awaitReadiness();
      if (result.readiness.rung === "idle" || result.readiness.rung === "timeout") this.unresolved = this.pending;
      return { ...result, droppedBytes: this.pending?.droppedBytes ?? 0 };
    } catch (error) {
      if (this.stopped) return {
        readiness: readiness("cancelled", "terminal stop requested; observe done for process closure", Date.now() - startedAt),
        output: this.pending?.buffer ?? "", exitCode: null, droppedBytes: this.pending?.droppedBytes ?? 0
      };
      if (this.exited) return {
        readiness: readiness("exited", "the shell closed before acknowledging the sentinel", Date.now() - startedAt),
        output: this.pending?.buffer ?? "", exitCode: null, droppedBytes: this.pending?.droppedBytes ?? 0
      };
      // An error after input submission is not permission to replay that input.
      if (commandSubmitted) this.unresolved = this.pending && !this.matchNonce(this.pending) ? this.pending : null;
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
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

    if (this.stopped) return {
      readiness: readiness("cancelled", "terminal stop requested; observe done for process closure", elapsed),
      output: pending.buffer, exitCode: null
    };

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
    // Search every occurrence: a PTY echoes the printf input BEFORE it emits
    // the marker. parseInt would also incorrectly accept `7garbage` as status 7.
    const pattern = new RegExp(`${pending.nonce}(0|[1-9][0-9]{0,2})\\r?\\n`, "g");
    for (const match of pending.buffer.matchAll(pattern)) {
      const status = Number(match[1]);
      if (status <= 255) return { output: pending.buffer.slice(0, match.index), exitCode: status };
    }
    return null;
  }

  dispose(): void {
    if (this.stopped || this.exited) return;
    this.stopped = "dispose";
    // Keep observing exit until the backend actually closes. Detaching first
    // stranded in-flight sends and hid whether disposal reaped the process.
    this.backend.dispose();
  }
}
