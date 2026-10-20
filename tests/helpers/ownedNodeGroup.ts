// Proposed destination: tests/helpers/ownedNodeGroup.ts. POSIX-owned Node children only, never a shell or ambient process group.
import { spawn } from "node:child_process";

export interface OwnedNodeResult {
  code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: Error;
}

/** A private new process group contains this child and any synchronous HTTP/provider grandchildren it creates. */
export function spawnOwnedNode(args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  if (process.platform === "win32") throw new Error("the owned Node process-group fixture requires POSIX");
  const child = spawn(process.execPath, [...args], { ...options, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", error: Error | undefined, closeSeen = false;
  // Always drain both pipes; a loud failed child must not block before it can close.
  child.stdout.on("data", bytes => { stdout = (stdout + String(bytes)).slice(-262_144); });
  child.stderr.on("data", bytes => { stderr = (stderr + String(bytes)).slice(-262_144); });
  child.once("error", failure => { error = failure; });
  const closed = new Promise<OwnedNodeResult>(done => child.once("close", (code, signal) => {
    closeSeen = true; done({ code, signal, stdout, stderr, ...(error === undefined ? {} : { error }) });
  }));
  const groupAlive = () => {
    if (child.pid === undefined) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code === "ESRCH") return false; throw new Error("owned child process-group status unavailable"); }
  };
  const signal = (value: "SIGTERM" | "SIGKILL") => {
    if (child.pid === undefined) return;
    try { process.kill(-child.pid, value); }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("owned child process-group signal failed"); }
  };
  const waitStopped = async (milliseconds: number) => {
    const end = performance.now() + milliseconds;
    do {
      if (closeSeen && !groupAlive()) return true;
      await new Promise<void>(done => setTimeout(done, 20));
    } while (performance.now() < end);
    return closeSeen && !groupAlive();
  };
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => stopping ??= (async () => {
    // Do not return merely because the direct child exited: its synchronous bridge may still be in the group.
    signal("SIGTERM");
    if (await waitStopped(1_000)) return;
    signal("SIGKILL");
    if (!await waitStopped(2_000)) throw new Error("owned child or descendant did not close after bounded SIGTERM/SIGKILL");
  })();
  const wait = async (timeoutMs = 15_000): Promise<OwnedNodeResult> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([closed, new Promise<undefined>(done => { timer = setTimeout(() => done(undefined), timeoutMs); })]);
      if (result === undefined) throw new Error("owned Node child exceeded its completion deadline");
      if (result.error !== undefined) throw new Error("owned Node child failed to spawn");
      return result;
    } finally { clearTimeout(timer); await stop(); }
  };
  return { child, closed, wait, stop };
}
