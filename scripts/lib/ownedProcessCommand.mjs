import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Run one owned POSIX process group with bounded output and terminal cleanup. */
export async function runOwnedCommand(executable, args, {
  cwd, env, input, signal, timeoutMs = 60_000, terminateGraceMs = 250,
  closeWaitMs = 2_000, maxOutputBytes = 4 * 1024 * 1024
} = {}) {
  assert.notEqual(process.platform, "win32", "owned command groups require a POSIX host");
  for (const value of [timeoutMs, terminateGraceMs, closeWaitMs, maxOutputBytes]) assert.ok(Number.isSafeInteger(value) && value > 0);
  signal?.throwIfAborted();
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let closed = false, code = null, exitSignal = null, spawnError, stopReason, stdout = "", stderr = "", outputBytes = 0;
  let resolveTerminal, resolveStop;
  const terminal = new Promise(resolve => { resolveTerminal = resolve; });
  const stopRequested = new Promise(resolve => { resolveStop = resolve; });
  const stop = reason => { stopReason ??= reason; resolveStop(); };
  const abort = () => stop("aborted");
  child.once("error", error => { spawnError = String(error); stop("spawn-error"); });
  child.once("exit", (value, valueSignal) => { code = value; exitSignal = valueSignal; });
  child.once("close", (value, valueSignal) => { closed = true; code = value; exitSignal = valueSignal; resolveTerminal(); });
  child.stdin.on("error", () => {}); child.stdin.end(input);
  for (const [stream, append] of [[child.stdout, value => { stdout += value; }], [child.stderr, value => { stderr += value; }]]) {
    stream.on("data", bytes => {
      outputBytes += bytes.length;
      if (outputBytes <= maxOutputBytes) append(bytes.toString());
      else stop("output-limit");
    });
  }
  // A negative PID is used only for the detached group created by this spawn.
  // Never accept a process-group ID from a fixture, file, or inherited process.
  const groupAlive = () => {
    if (!child.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if (error.code === "ESRCH") return false; throw error; }
  };
  const killGroup = value => {
    if (!child.pid) return;
    try { process.kill(-child.pid, value); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const settleUntil = async (condition, duration) => {
    const deadline = Date.now() + duration;
    while (!condition() && Date.now() < deadline) await wait(Math.min(20, Math.max(1, deadline - Date.now())));
  };
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let cleanupError;
  try {
    await Promise.race([terminal, stopRequested]);
    clearTimeout(timer);
    if (groupAlive()) {
      stopReason ??= "leftover-descendants";
      killGroup("SIGTERM");
      await settleUntil(() => !groupAlive(), terminateGraceMs);
      if (groupAlive()) killGroup("SIGKILL");
    }
    // Descendants may keep pipes open after the direct child exits. Group death
    // AND pipe closure are observed, but neither can extend this terminal wait.
    await settleUntil(() => closed && !groupAlive(), closeWaitMs);
    if (!closed || groupAlive()) cleanupError = "Owned command group or inherited pipes did not close within the cleanup deadline.";
  } catch (error) { cleanupError = String(error); }
  finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
    if (!closed) {
      // Closing our local pipe ends prevents an uncooperative descendant from
      // keeping this runner alive after the bounded cleanup has failed.
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
    }
  }
  return { code, signal: exitSignal, stdout, stderr, stopReason, spawnError, cleanupError, closed, processGroupId: child.pid ?? null };
}
