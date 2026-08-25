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
    stdio: ["ignore", spec.stdout === "ignore" ? "ignore" : "pipe", spec.stderr === "ignore" ? "ignore" : "pipe"]
  });

  const stdout = new OutputCollector(
    spec.maxCaptureBytes,
    spec.scrubValues,
    spec.stdout === "tee" ? (text) => process.stdout.write(text) : undefined
  );
  const stderr = new OutputCollector(
    spec.maxCaptureBytes,
    spec.scrubValues,
    spec.stderr === "tee" ? (text) => process.stderr.write(text) : undefined
  );
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

  return { pid: child.pid ?? null, terminate, done };
}
