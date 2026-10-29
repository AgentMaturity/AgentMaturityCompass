/** Real CLI/PTY workflow contracts with scripted provider responses. These
 * timings and input counts measure automation, not human usability. */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const driver = fileURLToPath(new URL("./fixtures/nativeInteractiveTasksPty.py", import.meta.url));
const roots: string[] = [];
type MeasurementScope = "scripted-chat-cli-pty" | "scripted-native-run-cli-pty";
const measurements: { task: string; steps: number; elapsedMs: number; scope: MeasurementScope }[] = [];
interface Action { waitFor?: string; send?: string; resize?: [number, number] }
interface TerminalResult { code: number; output: string; steps: number; elapsedMs: number; failure: string | null; parsedJson?: unknown; jsonDiagnosticTail?: string }
const passphrase = "native-interactive-task-fixture-passphrase";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", passphrase);
  vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-interactive-tasks-"))); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  mkdirSync(join(root, "credentials"), { mode: 0o700 });
  writeFileSync(join(root, "credentials", "refs.yaml"), "{}\n", { mode: 0o600 });
  return root;
}
function environment(root: string): NodeJS.ProcessEnv {
  return { ...process.env, AMC_SESSION_STORE: "sqlite", AMC_VAULT_PASSPHRASE: passphrase,
    AMC_AGENT_ID: "default", AMC_HOME: join(root, "home"), NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" };
}
function route(root: string): string[] {
  return ["--provider", "stub", "--tools", "echo", "--max-steps", "2", "--max-tokens", "64", "--no-delegate",
    "--credentials-home", join(root, "credentials"), "--credentials-file", join(root, "credentials", "refs.yaml")];
}
function seedSession(root: string): string {
  const result = spawnSync(process.execPath, [cli, "agent-loop", "run", ...route(root), "--keep-open", "--json", "--", "Seed released session for navigation"],
    { cwd: root, env: environment(root), encoding: "utf8", timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  // This is the actual machine-mode stdout contract, kept separate from PTY output.
  const summary = JSON.parse(result.stdout) as { sessionId: string; driverStatus: string };
  expect(summary.driverStatus).toBe("idle");
  expect(summary.sessionId).toEqual(expect.any(String));
  return summary.sessionId;
}
async function terminal(root: string, args: string[], actions: Action[], options: { term?: string; nativeCommand?: "chat" | "run"; captureJson?: boolean } = {}): Promise<TerminalResult> {
  const env = { ...environment(root), TERM: options.term ?? "dumb" };
  const child = spawn("python3", [driver], { cwd: root, env, stdio: "pipe", shell: false });
  let stdout = "", stderr = "", failure: Error | undefined;
  const timer = setTimeout(() => { failure = new Error("PTY task exceeded 100 seconds"); child.kill("SIGTERM"); }, 100_000);
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (text: string) => { stdout += text; });
  child.stderr.on("data", (text: string) => { stderr += text; });
  child.stdin.end(JSON.stringify({ cwd: root, command: [process.execPath, cli, "agent-loop", options.nativeCommand ?? "chat", ...args],
    env, actions, waitSeconds: 25, captureJson: options.captureJson === true }));
  return new Promise((resolveResult, reject) => {
    child.once("error", error => { failure = error; });
    child.once("close", () => {
      clearTimeout(timer);
      if (failure) { reject(failure); return; }
      let result: TerminalResult;
      try { result = JSON.parse(stdout) as TerminalResult; }
      catch { reject(new Error(`PTY driver did not return JSON: ${stderr}\n${stdout}`)); return; }
      const transcriptDir = resolve("tmp/native-interactive-task-transcripts"); mkdirSync(transcriptDir, { recursive: true });
      writeFileSync(join(transcriptDir, `${Date.now()}-${process.hrtime.bigint()}.txt`), result.output);
      if (result.failure) { reject(new Error(`${result.failure}\n${result.output}\n${stderr}`)); return; }
      resolveResult(result);
    });
  });
}
function measured(task: string, result: TerminalResult, expectedSteps: number, scope: MeasurementScope = "scripted-chat-cli-pty"): void {
  expect(result.steps).toBe(expectedSteps);
  expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  measurements.push({ task, steps: result.steps, elapsedMs: result.elapsedMs, scope });
  const file = resolve("tmp/native-interactive-task-metrics.json"); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, humanUsability: "not-measured", tasks: measurements }, null, 2) + "\n");
  console.log(`WP30 scripted task ${task}: ${result.steps} input actions, ${result.elapsedMs} ms`);
}

describe.skipIf(process.platform === "win32")("WP30 measured native interactive tasks", () => {
  test("discover a command with help and Tab, resize, and cancel at the prompt", async () => {
    const root = workspace();
    const result = await terminal(root, route(root), [
      { waitFor: "you> ", send: "/help\r" },
      { waitFor: "/resume" },
      // Node readline treats a tab inside a pasted chunk as literal input.
      // Wait for echo/completion between key writes to model keyboard input.
      { waitFor: "you> ", send: "/fo" },
      { waitFor: "/fo", send: "\t" },
      { waitFor: "rk", send: "\r" },
      { waitFor: "Run a task or resume a session before forking\\.", resize: [38, 12] },
      { waitFor: "you> ", send: "\u0003" }
    ], { term: "xterm-256color" });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("Tab completes");
    expect(result.output).toContain("/fork");
    expect(result.output).not.toContain("Running stub/");
    measured("discover-fork-keyboard-resize", result, 6);
  }, 110_000);

  test("run a task, inspect recorded evidence, and read the explicit validation state", async () => {
    const root = workspace();
    const result = await terminal(root, route(root), [
      { waitFor: "you> ", send: "WP30 measured recording task\r" },
      { waitFor: "Recorded reply:" },
      { waitFor: "you> ", send: "/inspect\r" },
      { waitFor: "Event spine" },
      { waitFor: "you> ", send: "/exit\r" }
    ]);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("Public task validation: not-requested.");
    expect(result.output).toContain("WP30 measured recording task");
    const sessionId = /Known session reference: ([A-Za-z0-9._-]+)\. A resume attempt/.exec(result.output)?.[1];
    expect(sessionId, result.output).toBeDefined();
    const events = readNativeSessionEvents(root, sessionId!);
    expect(events.some(row => row.event_type === "turn/seal"), result.output).toBe(true);
    expect(events.at(-1)?.event_type, result.output).toBe("session/release");
    measured("run-inspect-validation-state", result, 3);
  }, 110_000);

  test("find and inspect a released session, then explicitly resume without copying its ID", async () => {
    const root = workspace(), sessionId = seedSession(root);
    const result = await terminal(root, route(root), [
      { waitFor: "you> ", send: "/resume\r" },
      { waitFor: "Session number to inspect \\(blank cancels\\): ", send: "1\r" },
      { waitFor: "Type resume to select this session \\(blank cancels\\): ", send: "resume\r" },
      { waitFor: "you> ", send: "WP30 explicit resumed task\r" },
      { waitFor: "Recorded reply:" },
      { waitFor: "you> ", send: "/exit\r" }
    ]);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain(`Session selected: ${sessionId}.`);
    expect(result.output).toContain("Event spine");
    const events = readNativeSessionEvents(root, sessionId);
    expect(events.filter(row => row.event_type === "session/resume")).toHaveLength(1);
    expect(events.filter(row => row.event_type === "turn/start")).toHaveLength(2);
    measured("find-inspect-resume-without-id-copy", result, 5);
  }, 110_000);

  test("cancel session selection without acquiring its writer or changing its native history", async () => {
    const root = workspace(), sessionId = seedSession(root);
    const before = readNativeSessionEvents(root, sessionId).map(row => row.event_hash);
    const result = await terminal(root, route(root), [
      { waitFor: "you> ", send: "/resume\r" },
      { waitFor: "Session number to inspect \\(blank cancels\\): ", send: "\r" },
      { waitFor: "Session selection cancelled; no writer acquired\\." },
      { waitFor: "you> ", send: "/exit\r" }
    ]);
    expect(result.code, result.output).toBe(0);
    expect(readNativeSessionEvents(root, sessionId).map(row => row.event_hash)).toEqual(before);
    measured("cancel-session-selection", result, 3);
  }, 110_000);

  test("interrupt the native run child boundary with Ctrl-C and retain its signed cancellation without retry", async () => {
    const root = workspace();
    // Chat intentionally has no fault-injection delay flag. Exercise the same
    // public run boundary it spawns, using the existing delayed stub rather than
    // a network server or a replacement runtime. This is native-run PTY proof,
    // not a claim that an active chat preview was exercised.
    const result = await terminal(root, [...route(root), "--think-ms", "10000", "--keep-open", "--stream", "--json",
      "--", "WP30 cancel this delayed native task"], [
      { waitFor: "step 1\\.1 [^\\n]*model", send: "\u0003" },
      { waitFor: "turn 1 ended: cancelled" }
    ], { nativeCommand: "run", captureJson: true });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("cancelling the turn (cause: user)");
    // The PTY combines stdout and stderr; the driver returns the exact JSON
    // frame and preserves its trailing diagnostic text separately. Strict
    // machine stdout parsing is covered independently by seedSession.
    expect(result.parsedJson, result.output).toEqual(expect.any(Object));
    expect(result.jsonDiagnosticTail).toEqual(expect.any(String));
    expect(result.output.endsWith(result.jsonDiagnosticTail!)).toBe(true);
    const summary = result.parsedJson as {
      sessionId: string; driverStatus: string; unsignedRows: number;
      endings: { reason: string; cancelCause: string; interrupted: boolean }[];
    };
    expect(summary.driverStatus).toBe("idle");
    expect(summary.unsignedRows).toBe(0);
    expect(summary.endings).toEqual([expect.objectContaining({ reason: "cancelled", cancelCause: "user", interrupted: false })]);
    const events = readNativeSessionEvents(root, summary.sessionId);
    expect(events.filter(row => row.event_type === "loop/cancel")).toHaveLength(1);
    expect(events.filter(row => row.event_type === "request/header")).toHaveLength(1);
    expect(events.filter(row => row.event_type === "loop/retry")).toHaveLength(0);
    expect(events.filter(row => row.event_type === "turn/end").map(row => JSON.parse(row.meta_json).reason)).toEqual(["cancelled"]);
    expect(events.at(-1)?.event_type).toBe("session/release");
    measured("interrupt-native-run-no-retry", result, 1, "scripted-native-run-cli-pty");
  }, 110_000);
});
