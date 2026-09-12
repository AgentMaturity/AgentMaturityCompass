import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runProcess, type RunningProcess } from "../src/exec/runProcess.js";
import type { ProcessOutcome, ProcessSpec } from "../src/exec/processTypes.js";
import { prepareNativePtyLaunch } from "../src/terminal/nativePtySandbox.js";
import { openNativePtyTerminal } from "../src/terminal/nativePtyTerminal.js";
import type { TerminalBackend } from "../src/terminal/terminalTypes.js";

vi.mock("../src/exec/runProcess.js", () => ({ runProcess: vi.fn() }));
vi.mock("../src/terminal/nativePtySandbox.js", () => ({ prepareNativePtyLaunch: vi.fn() }));

// Protocol/lifecycle simulations only; no process, helper or namespace executes.
let spec: ProcessSpec;
let running: RunningProcess;
let settle: ((outcome: ProcessOutcome) => void) | undefined;
let backend: TerminalBackend | undefined;
let launcherStatus: number | null;
let disposeLaunch: ReturnType<typeof vi.fn<() => void>>;
const outcome = (changes: Partial<ProcessOutcome> = {}): ProcessOutcome => ({
  exitCode: 0, signal: null, terminatedBy: null, treeExitProven: true,
  stdout: { text: "", totalBytes: 0, droppedBytes: 0 }, stderr: { text: "", totalBytes: 0, droppedBytes: 0 },
  pid: 123, durationMs: 1, ...changes
});
beforeEach(() => {
  vi.clearAllMocks();
  backend = undefined;
  settle = undefined;
  launcherStatus = 0;
  disposeLaunch = vi.fn<() => void>();
  vi.mocked(prepareNativePtyLaunch).mockReturnValue({ argv: ["/usr/bin/bwrap"], cwd: "/workspace", env: {}, extraFds: [],
    commandExit: () => launcherStatus, dispose: disposeLaunch });
  vi.mocked(runProcess).mockImplementation(input => {
    spec = input;
    running = { pid: 123, terminate: vi.fn(), write: vi.fn(async (_bytes: Buffer) => true), endStdin: vi.fn(),
      done: new Promise(resolve => { settle = resolve; }) };
    return running;
  });
});
afterEach(async () => {
  backend?.dispose();
  settle?.(outcome({ terminatedBy: "dispose" }));
  if (backend?.done) await backend.done;
});
function open(): TerminalBackend {
  backend = openNativePtyTerminal({ cwd: "/workspace", policy: {
    writableRoots: [], timeoutMs: 30_000, network: "deny", scrubValues: ["secret-value"]
  } });
  return backend;
}
function frame(value: unknown): void { spec.onOutput?.("stdout", JSON.stringify(value) + "\n"); }
function start(): void { frame({ type: "ready", protocol: 1, kind: "pty" }); }
function lastControl(): { id: number; op: string; data?: string; cols?: number; rows?: number } {
  const bytes = vi.mocked(running.write).mock.calls.at(-1)?.[0];
  if (!bytes) throw new Error("No control frame was submitted.");
  return JSON.parse(bytes.toString("utf8"));
}

describe("P02 confined PTY transport", () => {
  it("uses the composed subprocess substrate without capturing encoded secret output", () => {
    const terminal = open();
    expect(terminal.kind).toBe("pty");
    expect(spec.argv).toEqual(["/usr/bin/bwrap"]);
    expect(spec.stdin).toBe("pipe");
    expect(spec.maxCaptureBytes).toBe(0);
    expect(spec.scrubValues).toEqual([]);
  });

  it("refuses an unavailable confined launcher without trying a second backend", () => {
    vi.mocked(prepareNativePtyLaunch).mockImplementation(() => { throw new Error("Linux Bubblewrap unavailable"); });
    expect(open).toThrow(/unavailable/);
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("streams decoded, redacted Unicode across framed reads", async () => {
    const terminal = open();
    let output = "";
    terminal.onData(text => { output += text; });
    start();
    await terminal.ready;
    const bytes = Buffer.from("🙂secret-value\r\n");
    for (const part of [bytes.subarray(0, 2), bytes.subarray(2, 10), bytes.subarray(10)]) {
      frame({ type: "data", data: part.toString("base64") });
    }
    expect(output).toBe("🙂[amc:redacted]\r\n");
  });

  it("requires helper acknowledgement, not merely a successful pipe write", async () => {
    const terminal = open();
    start();
    await terminal.ready;
    let acknowledged = false;
    const input = Promise.resolve(terminal.write("hello\r")).then(() => { acknowledged = true; });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    const control = lastControl();
    expect(control.op).toBe("input");
    expect(Buffer.from(control.data!, "base64").toString()).toBe("hello\r");
    frame({ type: "ack", id: control.id });
    await input;
    expect(acknowledged).toBe(true);
    const resized = terminal.resize!(101, 37);
    expect(lastControl()).toMatchObject({ op: "resize", cols: 101, rows: 37 });
    frame({ type: "ack", id: lastControl().id });
    await resized;
  });

  it("bounds input and outstanding acknowledgements", async () => {
    const terminal = open();
    start();
    await terminal.ready;
    await expect(terminal.write("x".repeat(16_385))).rejects.toThrow(/16384/);
    const accepted = Array.from({ length: 128 }, () => Promise.resolve(terminal.write("x")).catch(() => undefined));
    await expect(terminal.write("overflow")).rejects.toThrow(/backpressured/);
    terminal.cancel!();
    await Promise.all(accepted);
  });

  it("rejects a pipe-labelled ready frame and malformed/unsolicited control", async () => {
    const terminal = open();
    frame({ type: "ready", protocol: 1, kind: "pipe" });
    await expect(terminal.ready).rejects.toThrow(/invalid/i);
    expect(running.terminate).toHaveBeenCalledWith("dispose");
    settle!(outcome());
    expect(await terminal.done).toMatchObject({ confined: false, code: null, reason: "error" });
  });

  it("does not accept stdout exit claims without the separate matching launcher receipt", async () => {
    const terminal = open();
    start();
    frame({ type: "exit", code: 0, signal: null, outputComplete: true });
    launcherStatus = null;
    settle!(outcome());
    expect(await terminal.done).toMatchObject({ code: null, confined: false, outputComplete: false, reason: "error" });
    expect(disposeLaunch).toHaveBeenCalledTimes(1);
  });

  it("retains lifecycle facts only after a matching complete receipt", async () => {
    const terminal = open();
    start();
    frame({ type: "exit", code: 0, signal: null, outputComplete: true });
    settle!(outcome());
    expect(await terminal.done).toMatchObject({ code: 0, confined: true, outputComplete: true, reason: "exit", treeExitProven: true });
    const late = vi.fn();
    terminal.onExit(late);
    expect(late).toHaveBeenCalledWith(0);
  });

  it("cancels idempotently and reports incomplete cancellation without a fake shell status", async () => {
    const terminal = open();
    const exit = vi.fn();
    terminal.onExit(exit);
    start();
    terminal.cancel!();
    terminal.cancel!();
    terminal.dispose();
    expect(running.terminate).toHaveBeenCalledTimes(1);
    launcherStatus = null;
    settle!(outcome({ exitCode: null, signal: "SIGTERM", terminatedBy: "cancel" }));
    expect(await terminal.done).toMatchObject({ reason: "cancel", code: null, confined: false });
    expect(exit).toHaveBeenCalledTimes(1);
    await expect(terminal.write("late")).rejects.toThrow(/closing|exited/);
  });

  it("makes startup exceptions observable and releases owned launcher resources", async () => {
    vi.mocked(runProcess).mockImplementation(() => { throw new Error("spawn failed"); });
    const terminal = open();
    await expect(terminal.ready).rejects.toThrow(/could not be started/);
    expect(await terminal.done).toMatchObject({ code: null, reason: "error", confined: false });
    expect(disposeLaunch).toHaveBeenCalledTimes(1);
  });
});
