import { runProcess, type RunningProcess } from "../exec/runProcess.js";
import type { ProcessOutcome } from "../exec/processTypes.js";
import type { SandboxPolicy } from "../sandbox/sandboxTypes.js";
import { prepareNativePtyLaunch } from "./nativePtySandbox.js";
import { assertTerminalDimensions, type TerminalBackend, type TerminalExit } from "./terminalTypes.js";
import { TerminalOutput } from "./terminalOutput.js";

export interface NativePtyTerminalOptions {
  readonly cwd: string;
  readonly policy: SandboxPolicy;
  readonly cols?: number;
  readonly rows?: number;
}

interface PendingControl {
  readonly bytes: number;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Low-level confined transport. Product callers use NativeTerminalHost so
 * approved bash calls cannot accidentally become unrestricted interactive
 * sessions. There is deliberately no selectable unconfined/pipe fallback.
 */
export function openNativePtyTerminal(options: NativePtyTerminalOptions): TerminalBackend {
  const cols = options.cols ?? 80;
  const rows = options.rows ?? 24;
  assertTerminalDimensions(cols, rows);
  const policy = Object.freeze({ ...options.policy, writableRoots: Object.freeze([...options.policy.writableRoots]),
    scrubValues: Object.freeze([...(options.policy.scrubValues ?? [])]) });
  const dataListeners = new Set<(text: string) => void>();
  const exitListeners = new Set<(code: number | null) => void>();
  const output = new TerminalOutput(text => {
    for (const listener of [...dataListeners]) {
      try { listener(text); } catch { /* An observer cannot break the transport. */ }
    }
  }, policy.scrubValues);
  const launch = prepareNativePtyLaunch(options.cwd, policy, cols, rows);
  let running: RunningProcess | undefined;
  let started = false;
  let finalExit: TerminalExit | undefined;
  let stopReason: "cancel" | "dispose" | null = null;
  let protocolError: string | undefined;
  let wire = "";
  let sequence = 0;
  let pendingBytes = 0;
  let shellExit: { code: number | null; signal: number | null; outputComplete: boolean } | undefined;
  const pending = new Map<number, PendingControl>();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => undefined);
  let resolveDone!: (exit: TerminalExit) => void;
  const done = new Promise<TerminalExit>(resolve => { resolveDone = resolve; });
  const deadline = Date.now() + policy.timeoutMs;

  const rejectPending = (reason: string): void => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(reason)); }
    pending.clear();
    pendingBytes = 0;
  };
  const fail = (reason: string, termination: "dispose" | "timeout" = "dispose"): void => {
    if (protocolError || finalExit) return;
    protocolError = reason;
    rejectReady(new Error(reason));
    rejectPending(reason);
    running?.terminate(termination);
  };
  const startupTimer = setTimeout(() => fail("The confined PTY did not become ready within its startup deadline.", "timeout"), Math.min(policy.timeoutMs, 10_000));

  const frame = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid PTY frame.");
    const message = value as Record<string, unknown>;
    if (message.type === "ready") {
      if (started || message.protocol !== 1 || message.kind !== "pty") throw new Error("Invalid PTY startup frame.");
      started = true;
      clearTimeout(startupTimer);
      resolveReady();
    } else if (message.type === "data") {
      if (!started || shellExit || typeof message.data !== "string" || !message.data.length || message.data.length > 43_692) throw new Error("Invalid PTY data frame.");
      const bytes = Buffer.from(message.data, "base64");
      if (bytes.toString("base64") !== message.data || bytes.length > 32_768) throw new Error("Invalid PTY output encoding.");
      output.push(bytes);
    } else if (message.type === "ack") {
      const id = message.id;
      if (!Number.isSafeInteger(id) || typeof id !== "number" || !pending.has(id)) throw new Error("Invalid PTY acknowledgement.");
      const item = pending.get(id)!;
      pending.delete(id);
      pendingBytes -= item.bytes;
      clearTimeout(item.timer);
      item.resolve();
    } else if (message.type === "exit") {
      const code = message.code;
      const signal = message.signal;
      if (!started || shellExit || (code !== null && (typeof code !== "number" || !Number.isInteger(code) || code < 0 || code > 255)) ||
          (signal !== null && (typeof signal !== "number" || !Number.isInteger(signal) || signal < 1 || signal > 64)) ||
          (code === null) === (signal === null) || typeof message.outputComplete !== "boolean") throw new Error("Invalid PTY exit frame.");
      shellExit = { code: code as number | null, signal: signal as number | null, outputComplete: message.outputComplete };
    } else throw new Error("The confined PTY helper failed or sent an unknown control frame.");
  };

  const receive = (stream: "stdout" | "stderr", text: string): void => {
    // Launcher diagnostics are not a PTY transcript and never prove setup.
    // The generic failure below intentionally avoids leaking their host paths.
    if (stream !== "stdout" || protocolError) return;
    wire += text;
    try {
      let newline: number;
      while ((newline = wire.indexOf("\n")) >= 0) {
        if (newline > 65_536) throw new Error("Oversized PTY frame.");
        const line = wire.slice(0, newline);
        wire = wire.slice(newline + 1);
        frame(JSON.parse(line) as unknown);
      }
      if (wire.length > 65_536) throw new Error("Oversized PTY frame.");
    } catch { fail("The confined PTY control stream was invalid; no fallback was attempted."); }
  };

  const finish = (outcome?: ProcessOutcome): void => {
    if (finalExit) return;
    clearTimeout(startupTimer);
    output.end();
    const status = launch.commandExit();
    const normalized = shellExit?.code ?? (shellExit?.signal ? 128 + shellExit.signal : null);
    const applied = !!outcome && started && !!shellExit && !protocolError && wire === "" && status !== null && status === outcome.exitCode && status === normalized;
    let error = protocolError ?? (!applied ? "The confined PTY lacks a complete matching launcher-exit receipt; execution/confinement are unconfirmed." :
      !outcome?.treeExitProven ? "Terminal launcher process-group cleanup could not be confirmed." : undefined);
    try { launch.dispose(); } catch { error = "Terminal launcher cleanup failed."; }
    const terminated = outcome?.terminatedBy ?? stopReason;
    finalExit = Object.freeze({ code: applied ? shellExit!.code : null, signal: applied && shellExit!.signal ? String(shellExit!.signal) : null,
      reason: protocolError && terminated === "dispose" && stopReason === null ? "error" : terminated ?? (error ? "error" : "exit"),
      treeExitProven: outcome?.treeExitProven ?? false, confined: applied,
      outputComplete: applied && shellExit!.outputComplete, ...(error ? { error } : {}) });
    if (!started) rejectReady(new Error(error ?? "The terminal closed before startup."));
    rejectPending("The terminal closed before acknowledging the operation.");
    resolveDone(finalExit);
    for (const listener of [...exitListeners]) {
      try { listener(finalExit.code); } catch { /* Deliver lifecycle to every observer. */ }
    }
    exitListeners.clear();
    dataListeners.clear();
  };

  try {
    running = runProcess({ argv: launch.argv, cwd: launch.cwd, env: launch.env, extraFds: launch.extraFds,
      stdin: "pipe", stdout: "capture", stderr: "capture", maxCaptureBytes: 0, scrubValues: [],
      graceMs: 2_000, timeoutMs: policy.timeoutMs, signal: policy.signal, onOutput: receive });
    if (protocolError) running.terminate("dispose");
    void running.done.then(outcome => finish(outcome), () => finish());
  } catch {
    fail("The confined PTY launcher could not be started.");
    finish();
  }

  const control = async (operation: Record<string, unknown>, bytes: number): Promise<void> => {
    if (finalExit || stopReason || protocolError || policy.signal?.aborted) throw new Error("The terminal is closing or has exited.");
    // TerminalSession awaits ready for callers. The raw transport refuses an
    // unbounded queue of startup writes rather than retaining them as promises.
    if (!started) throw new Error("Await terminal.ready before sending input or resize operations.");
    if (finalExit || stopReason || protocolError || policy.signal?.aborted || !running) throw new Error("The terminal is closing or has exited.");
    if (Date.now() >= deadline) { running.terminate("timeout"); throw new Error("The terminal lifetime has expired."); }
    if (pending.size >= 128 || pendingBytes + bytes > 262_144) throw new Error("Terminal input is backpressured; await earlier writes before sending more.");
    const id = ++sequence;
    const acknowledgement = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => fail("The terminal did not acknowledge its input/resize operation."), 5_000);
      pending.set(id, { bytes, resolve, reject, timer });
      pendingBytes += bytes;
    });
    // Attach immediately: closing while write() is still flushing must not
    // create an unhandled rejection of the later acknowledgement promise.
    void acknowledgement.catch(() => undefined);
    const flushed = await running.write(Buffer.from(JSON.stringify({ id, ...operation }) + "\n", "utf8"));
    if (!flushed) fail("The terminal control pipe closed before accepting input.");
    await acknowledgement;
  };
  const stop = (reason: "cancel" | "dispose"): void => {
    if (finalExit || stopReason) return;
    stopReason = reason;
    rejectPending("The terminal was stopped before acknowledging the operation.");
    running?.terminate(reason);
  };
  return {
    kind: "pty", pid: running?.pid ?? null, ready, done, supportsCommandMarkers: true,
    async write(data: string): Promise<void> {
      const bytes = Buffer.from(data, "utf8");
      if (!bytes.length || bytes.length > 16_384) throw new RangeError("PTY input must contain 1–16384 UTF-8 bytes per write.");
      await control({ op: "input", data: bytes.toString("base64") }, bytes.length);
    },
    async resize(nextCols: number, nextRows: number): Promise<void> {
      assertTerminalDimensions(nextCols, nextRows);
      await control({ op: "resize", cols: nextCols, rows: nextRows }, 0);
    },
    onData(listener): () => void {
      if (finalExit) return () => undefined;
      dataListeners.add(listener); return () => { dataListeners.delete(listener); };
    },
    onExit(listener): () => void {
      if (finalExit) { listener(finalExit.code); return () => undefined; }
      exitListeners.add(listener);
      return () => { exitListeners.delete(listener); };
    },
    cancel(): void { stop("cancel"); },
    dispose(): void { stop("dispose"); }
  };
}
