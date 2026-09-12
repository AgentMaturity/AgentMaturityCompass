import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { forwardSignals, terminateTree, treeAlive, usesProcessGroups, waitForTreeExit } from "../exec/processTree.js";
import type { TerminalBackend, TerminalExit } from "./terminalTypes.js";
import { TerminalOutput } from "./terminalOutput.js";

/**
 * A shell over pipes (P4.2).
 *
 * The explicitly selected legacy host-pipe backend: no
 * native PTY dependency. It is NOT an alternative to a required sandbox and
 * must never be selected after a confined launch fails. No TTY means no
 * `resize`, no job control, and no program that insists on a terminal.
 *
 * `resize` is ABSENT rather than a no-op. A pipe cannot resize, and a method
 * that accepted the call and did nothing would let a caller believe it had
 * changed something.
 *
 * Same process-group discipline as the rest of the substrate: detached so the
 * whole tree can be reaped, and signals forwarded so detaching does not
 * silently take Ctrl-C away from the shell.
 */
export interface PipeTerminalOptions {
  readonly shell?: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly graceMs?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly scrubValues?: readonly string[];
}

const DEFAULT_GRACE_MS = 2_000;

export function openPipeTerminal(options: PipeTerminalOptions): TerminalBackend {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  if (!Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 60_000) throw new RangeError("Invalid pipe terminal grace period.");
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 86_400_000)) throw new RangeError("Invalid pipe terminal lifetime.");
  if (options.signal?.aborted) throw new Error("The pipe terminal was cancelled before launch.");
  const dataListeners = new Set<(text: string) => void>();
  const exitListeners = new Set<(code: number | null) => void>();
  const emit = (text: string): void => {
    for (const listener of [...dataListeners]) {
      try { listener(text); } catch { /* Observers cannot stop draining or cleanup. */ }
    }
  };
  const stdout = new TerminalOutput(emit, options.scrubValues);
  const stderr = new TerminalOutput(emit, options.scrubValues);
  const child: ChildProcess = spawn(options.shell ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh"), [], {
    cwd: options.cwd,
    env: { ...options.env },
    detached: usesProcessGroups,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stopForwarding = forwardSignals(child);
  let cancelEscalation: (() => void) | null = null;
  let stopping: "cancel" | "timeout" | "dispose" | null = null;
  let finalExit: TerminalExit | undefined;
  let failed = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => undefined);
  let resolveDone!: (exit: TerminalExit) => void;
  const done = new Promise<TerminalExit>(resolve => { resolveDone = resolve; });
  const stop = (reason: "cancel" | "timeout" | "dispose"): void => {
    if (stopping || finalExit) return;
    stopping = reason;
    cancelEscalation = terminateTree(child, graceMs);
  };
  // stderr is merged into the stream on purpose: a shell transcript that
  // separated them would not be the transcript the operator saw.
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin?.on("error", () => undefined);
  child.once("spawn", resolveReady);
  child.once("error", () => { failed = true; rejectReady(new Error("The pipe terminal could not be started.")); });
  child.once("exit", () => {
    // A descendant retaining stdio can delay close indefinitely. Begin group
    // teardown when the shell exits rather than waiting for those pipes first.
    if (treeAlive(child) !== false && !cancelEscalation) cancelEscalation = terminateTree(child, graceMs);
  });
  const timeout = options.timeoutMs === undefined ? undefined : setTimeout(() => stop("timeout"), options.timeoutMs);
  const abort = (): void => stop("cancel");
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();

  child.once("close", (code, signal) => {
    stdout.end();
    stderr.end();
    stopForwarding();
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    // A parent closing its stdio is not proof that descendants exited. Keep
    // escalation alive until the group has gone or the grace window expires.
    if (treeAlive(child) !== false && !cancelEscalation) cancelEscalation = terminateTree(child, graceMs);
    void waitForTreeExit(child, graceMs + 250).then(proven => {
      cancelEscalation?.();
      finalExit = Object.freeze({ code: failed ? null : code, signal, reason: stopping ?? (failed ? "error" : "exit"),
        treeExitProven: usesProcessGroups && proven, ...(failed ? { error: "The pipe terminal could not be started." } : {}) });
      resolveDone(finalExit);
      for (const listener of [...exitListeners]) {
        try { listener(finalExit.code); } catch { /* Notify every observer. */ }
      }
      exitListeners.clear();
      dataListeners.clear();
    });
  });

  return {
    kind: "pipe",
    pid: child.pid ?? null, ready, done, supportsCommandMarkers: process.platform !== "win32",
    async write(data: string): Promise<void> {
      const stdin = child.stdin;
      if (stopping || finalExit || !stdin || stdin.destroyed || !stdin.writable || stdin.writableEnded) throw new Error("The pipe terminal is closed.");
      if (stdin.writableLength + Buffer.byteLength(data, "utf8") > 262_144) throw new Error("Pipe terminal input is backpressured; await previous writes.");
      await new Promise<void>((resolve, reject) => {
        try { stdin.write(data, error => error ? reject(new Error("The pipe terminal did not accept input.")) : resolve()); }
        catch { reject(new Error("The pipe terminal did not accept input.")); }
      });
    },
    onData(listener): () => void {
      if (finalExit) return () => undefined;
      dataListeners.add(listener);
      return () => { dataListeners.delete(listener); };
    },
    onExit(listener): () => void {
      if (finalExit) { listener(finalExit.code); return () => undefined; }
      exitListeners.add(listener);
      return () => { exitListeners.delete(listener); };
    },
    cancel(): void { stop("cancel"); },
    dispose(): void {
      stop("dispose");
    }
  };
}
