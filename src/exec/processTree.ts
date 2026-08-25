import type { ChildProcess } from "node:child_process";

/**
 * Process-group termination (P4.2).
 *
 * Every rule here was measured on this platform rather than read, because the
 * combinations behave differently from how the flag names suggest:
 *
 *   detached  target  leaf survived
 *   false     pid     YES   -- the leaf is orphaned, not killed
 *   true      pid     YES   -- same
 *   false     group   YES   -- ESRCH: the kill fails and NOTHING dies
 *   true      group   no    -- the only combination that reaps the tree
 *
 * The third row is the trap. A group kill without `detached: true` throws
 * ESRCH, and code that catches and ignores it looks like it terminated a tree
 * while killing nothing at all.
 *
 * `detached: true` costs something, and the cost has to be paid back
 * explicitly: it puts the child in its OWN process group, so it leaves the
 * terminal's foreground group and stops receiving Ctrl-C. Measured: an
 * un-forwarded SIGINT never reaches a detached child, and a forwarded one
 * does. Anything folding an interactive command onto this substrate must
 * forward — see `forwardSignals`.
 */

/** POSIX gets its own group; Windows has no equivalent and uses taskkill. */
export const usesProcessGroups = process.platform !== "win32";

/**
 * Signal a whole tree, falling back to the direct child.
 *
 * The fallback is not defensive noise: when the child was not detached, the
 * negative-pid form throws ESRCH and kills nothing, so without it a caller
 * would silently terminate nothing at all.
 */
export function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (usesProcessGroups) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall through: no group (not detached), or it is already gone.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // Already reaped. Termination is idempotent by design.
  }
}

/**
 * Whether anything in the group is still alive.
 *
 * `kill(-pgid, 0)` answers "is anyone left", never "who". There is no
 * pure-Node way to enumerate a process group's members on macOS, so this
 * returns a three-valued answer rather than a confident boolean: `undefined`
 * means the question could not be settled, and callers must not read that as
 * "gone".
 */
export function treeAlive(child: ChildProcess): boolean | undefined {
  const pid = child.pid;
  if (pid === undefined) return false;
  if (!usesProcessGroups) {
    return child.exitCode === null && child.signalCode === null;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "ESRCH") return false;
    // EPERM means it exists and is not ours to signal, which is still alive.
    if (code === "EPERM") return true;
    return undefined;
  }
}

/**
 * SIGTERM, then SIGKILL after `graceMs`.
 *
 * SIGCONT rides along with SIGTERM. A process stopped by SIGTSTP or SIGTTIN
 * never runs its handler, so it would sit out the entire grace window and then
 * die by SIGKILL — recorded as though it had deliberately ignored SIGTERM.
 * Continuing it first makes the grace period mean what it says.
 *
 * Returns a disposer that cancels the pending escalation.
 */
export function terminateTree(child: ChildProcess, graceMs: number): () => void {
  signalTree(child, "SIGCONT");
  signalTree(child, "SIGTERM");
  const timer = setTimeout(() => {
    if (treeAlive(child) !== false) signalTree(child, "SIGKILL");
  }, graceMs);
  // Deliberately NOT unref'd: a promised SIGKILL that never fires because the
  // parent exited first leaves exactly the orphan the escalation exists to
  // prevent.
  return () => clearTimeout(timer);
}

/**
 * Forward the parent's interactive signals to the child's group.
 *
 * Detaching for tree-kill takes the child out of the terminal's foreground
 * group; this puts back what that removed. Returns a disposer.
 */
export function forwardSignals(child: ChildProcess): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map((signal) => {
    const handler = (): void => signalTree(child, signal);
    process.on(signal, handler);
    return { signal, handler };
  });
  return () => {
    for (const { signal, handler } of handlers) process.off(signal, handler);
  };
}

/**
 * Poll until the tree is demonstrably gone, or the deadline passes.
 *
 * Resolves TRUE only on a positive observation of absence. A deadline that
 * expires, or a probe that could not settle the question, resolves false —
 * "not proven", which is not the same claim as "survivors exist".
 */
export async function waitForTreeExit(child: ChildProcess, deadlineMs: number): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    if (treeAlive(child) === false) return true;
    if (Date.now() >= until) return false;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
