/**
 * Is THIS process OS-confined?
 *
 * Distinct from "does this machine have a sandbox backend", which is what
 * `SandboxRunner.select()` answers, and the two were conflated. Code Mode's
 * guard needs this one: it runs model-written source through `new Function` in a
 * worker thread, and a worker thread is not a security boundary in Node — it
 * shares the process's filesystem, environment and ability to spawn. Only an OS
 * confinement around the process itself stops a script that ignores the tools
 * binding.
 *
 * ALWAYS FALSE TODAY, and deliberately a function rather than a constant so
 * there is one place to change when confinement is actually wired.
 *
 * The reason it is false is structural, not an oversight to patch over:
 *
 *   - Nothing re-execs AMC under a sandbox profile. Grepping `sandbox-exec`
 *     across src/, bin/ and scripts/ outside `seatbeltBackend.ts` returns a
 *     single comment.
 *   - `SandboxRunner.run(command, cwd, policy)` confines a SUBPROCESS. A worker
 *     thread is not a subprocess, so that API cannot confine the code Code Mode
 *     runs however it is called.
 *
 * Wiring it therefore means one of two real changes: re-exec the host process
 * under a profile and set a marker this function can read, or move Code Mode's
 * execution out of the worker thread and into a sandboxed child. Either is a
 * deliberate piece of work; neither is a boolean.
 */
export function processIsConfined(): boolean {
  return false;
}

/** Why {@link processIsConfined} says no, for a message an operator can act on. */
export function processConfinementReason(): string {
  return "AMC does not re-exec itself under an OS sandbox profile, and a worker thread "
    + "cannot be confined by a subprocess sandbox";
}
