import { spawn } from "node:child_process";
import { OutputCollector } from "./outputCollector.js";
import { forwardSignals, terminateTree, treeAlive, usesProcessGroups, waitForTreeExit } from "./processTree.js";
import type { ProcessOutcome, ProcessSpec, TerminateReason } from "./processTypes.js";

/**
 * One place a process is spawned (P4.2).
 *
 * Everything that used to be per-caller policy is spec'd here: the complete
 * environment, output bounds, scrubbing, the grace window, the timeout, and
 * cancellation. `spawnMonitoredProcess` had none of the last four, and its
 * version probe re-implemented spawning a fifth time with none of the first.
 *
 * How long the tree is given to prove it is gone once the direct child has
 * settled. Short, because this is the tail of a teardown a user is waiting on.
 */
const TREE_EXIT_PROOF_MS = 250;

export interface RunningProcess {
  readonly pid: number | null;
  /** Stop the tree. Idempotent; the first reason recorded is the one kept. */
  terminate(reason: TerminateReason): void;
  /**
   * Write to the child's stdin, resolving once the bytes have been FLUSHED.
   *
   * Asynchronous on purpose. A synchronous "accepted" answer is about the
   * parent's buffer, not the child: writing to a child that has closed its end
   * succeeds locally and fails later with EPIPE. A caller recording what it
   * sent would then produce evidence asserting input the process demonstrably
   * never received. Resolving at the flush callback is the first moment the
   * answer is about delivery.
   */
  write(chunk: Buffer): Promise<boolean>;
  /** Send EOF. A child blocked on stdin never finishes without it. */
  endStdin(): void;
  readonly done: Promise<ProcessOutcome>;
}

export function runProcess(spec: ProcessSpec): RunningProcess {
  const program = spec.argv[0];
  if (program === undefined || program.length === 0) {
    throw new Error("a process spec needs a program at argv[0]");
  }
  if (!Number.isFinite(spec.graceMs) || spec.graceMs <= 0) {
    throw new Error("graceMs must be a positive, finite number of milliseconds");
  }

  const startedAt = Date.now();
  const child = spawn(program, [...spec.argv.slice(1)], {
    cwd: spec.cwd,
    env: { ...spec.env },
    // Measured: this is the ONLY configuration in which killing the group
    // actually reaps a tree. It costs the terminal's foreground group, which
    // `forwardSignals` below buys back.
    detached: usesProcessGroups,
    stdio: [spec.stdin, spec.stdout === "ignore" ? "ignore" : "pipe", spec.stderr === "ignore" ? "ignore" : "pipe", ...(spec.extraFds ?? [])]
  });

  const sink = (stream: "stdout" | "stderr", tee: boolean) => (text: string): void => {
    if (tee) (stream === "stdout" ? process.stdout : process.stderr).write(text);
    spec.onOutput?.(stream, text);
  };
  const stdout = new OutputCollector(spec.maxCaptureBytes, spec.scrubValues, sink("stdout", spec.stdout === "tee"));
  const stderr = new OutputCollector(spec.maxCaptureBytes, spec.scrubValues, sink("stderr", spec.stderr === "tee"));
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

  let terminatedBy: TerminateReason | null = null;
  let cancelEscalation: (() => void) | null = null;
  const stopForwarding = forwardSignals(child);

  const terminate = (reason: TerminateReason): void => {
    if (terminatedBy !== null) return;
    terminatedBy = reason;
    if (treeAlive(child) === false) return;
    cancelEscalation = terminateTree(child, spec.graceMs);
  };

  const timeoutTimer = spec.timeoutMs === undefined
    ? null
    : setTimeout(() => terminate("timeout"), spec.timeoutMs);
  const onAbort = (): void => terminate("cancel");
  spec.signal?.addEventListener("abort", onAbort, { once: true });
  if (spec.signal?.aborted === true) terminate("cancel");

  const done = new Promise<ProcessOutcome>((resolve, reject) => {
    let failed: Error | null = null;
    child.on("error", (error: Error) => {
      failed = error;
    });
    child.on("close", (code, signalName) => {
      void (async (): Promise<void> => {
        stdout.end();
        stderr.end();
        if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        spec.signal?.removeEventListener("abort", onAbort);
        stopForwarding();
        // The direct child settling does not mean the tree settled: a
        // grandchild outlives its parent by default. Give the group a moment
        // to be demonstrably empty before claiming anything about it.
        const proven = await waitForTreeExit(child, TREE_EXIT_PROOF_MS);
        cancelEscalation?.();
        if (failed !== null) {
          reject(failed);
          return;
        }
        resolve({
          exitCode: code,
          signal: signalName,
          terminatedBy,
          treeExitProven: proven,
          stdout: stdout.snapshot(),
          stderr: stderr.snapshot(),
          pid: child.pid ?? null,
          durationMs: Date.now() - startedAt
        });
      })();
    });
  });

  const write = async (chunk: Buffer): Promise<boolean> => {
    const stdin = child.stdin;
    if (!stdin || stdin.destroyed || stdin.writableEnded || !stdin.writable) return false;
    if (child.exitCode !== null || child.signalCode !== null) return false;
    return new Promise<boolean>((resolve) => {
      try {
        // The callback carries EPIPE for a child that has closed its end. A
        // closed pipe is the child's decision, not an error worth throwing at
        // the operator mid-run.
        stdin.write(chunk, (error) => resolve(!error));
      } catch {
        resolve(false);
      }
    });
  };

  const endStdin = (): void => {
    try {
      child.stdin?.end();
    } catch {
      // Already closed.
    }
  };
  // A pipe nobody will ever write to must still be closed, or a child that
  // reads stdin waits forever for an EOF that is not coming.
  child.stdin?.on("error", () => undefined);

  return { pid: child.pid ?? null, terminate, write, endStdin, done };
}
