import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { forwardSignals, terminateTree, usesProcessGroups } from "../exec/processTree.js";
import type { TerminalBackend } from "./terminalTypes.js";

/**
 * A shell over pipes (P4.2).
 *
 * The rollback backend the plan names, and the one that always works: no
 * native dependency, so `npm install agent-maturity-compass` cannot fail on a
 * machine without a compiler. What it gives up is real: no TTY, so no
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
}

const DEFAULT_GRACE_MS = 2_000;

export function openPipeTerminal(options: PipeTerminalOptions): TerminalBackend {
  const child: ChildProcess = spawn(options.shell ?? "/bin/sh", [], {
    cwd: options.cwd,
    env: { ...options.env },
    detached: usesProcessGroups,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const dataListeners: Array<(text: string) => void> = [];
  const exitListeners: Array<(code: number | null) => void> = [];
  const stopForwarding = forwardSignals(child);
  let cancelEscalation: (() => void) | null = null;

  const emit = (chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    for (const listener of [...dataListeners]) listener(text);
  };
  // stderr is merged into the stream on purpose: a shell transcript that
  // separated them would not be the transcript the operator saw.
  child.stdout?.on("data", emit);
  child.stderr?.on("data", emit);
  child.stdin?.on("error", () => undefined);

  child.on("close", (code) => {
    stopForwarding();
    cancelEscalation?.();
    for (const listener of [...exitListeners]) listener(code);
  });

  return {
    kind: "pipe",
    write(data: string): void {
      const stdin = child.stdin;
      if (!stdin || stdin.destroyed || !stdin.writable) return;
      try {
        stdin.write(data);
      } catch {
        // The shell closed its end; the exit listener is the caller's signal.
      }
    },
    onData(listener): () => void {
      dataListeners.push(listener);
      return () => {
        const at = dataListeners.indexOf(listener);
        if (at >= 0) dataListeners.splice(at, 1);
      };
    },
    onExit(listener): () => void {
      exitListeners.push(listener);
      return () => {
        const at = exitListeners.indexOf(listener);
        if (at >= 0) exitListeners.splice(at, 1);
      };
    },
    dispose(): void {
      cancelEscalation = terminateTree(child, options.graceMs ?? DEFAULT_GRACE_MS);
    }
  };
}
