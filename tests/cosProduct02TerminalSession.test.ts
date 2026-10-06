import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalSession } from "../src/terminal/terminalSession.js";
import { TerminalOutput } from "../src/terminal/terminalOutput.js";
import type { TerminalBackend, TerminalExit, TerminalSessionOptions } from "../src/terminal/terminalTypes.js";

// Authored regressions. These mocks establish no OS/PTY/sandbox qualification.
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function fixture(options: TerminalSessionOptions = {}, kind: TerminalBackend["kind"] = "pty") {
  const data = new Set<(text: string) => void>();
  const exits = new Set<(code: number | null) => void>();
  const writes: string[] = [];
  const write = vi.fn((text: string): void => { writes.push(text); });
  const resize = vi.fn((_cols: number, _rows: number): void => undefined);
  const dispose = vi.fn();
  const cancel = vi.fn();
  let resolveDone!: (exit: TerminalExit) => void;
  const done = new Promise<TerminalExit>(resolve => { resolveDone = resolve; });
  let closed = false;
  const backend: TerminalBackend = {
    kind, write, done, dispose, cancel,
    ...(kind === "pty" ? { resize } : {}),
    onData(listener) { data.add(listener); return () => { data.delete(listener); }; },
    onExit(listener) { exits.add(listener); return () => { exits.delete(listener); }; }
  };
  const session = new TerminalSession(backend, { timeoutMs: 100, idleSilenceMs: 10_000, pollIntervalMs: 1, ...options });
  const exit = (code: number | null = 0, reason: TerminalExit["reason"] = "exit"): void => {
    if (closed) return;
    closed = true;
    for (const listener of [...exits]) listener(code);
    resolveDone({ code, signal: null, reason, treeExitProven: false });
  };
  cleanups.push(() => { session.dispose(); exit(null, "dispose"); });
  return { session, write, writes, resize, dispose, cancel, exit,
    emit(text: string): void { for (const listener of [...data]) listener(text); },
    nonce(): string {
      const value = /'(AMC[0-9a-f]+)'/.exec(writes.at(-1) ?? "")?.[1];
      if (!value) throw new Error("No sentinel was submitted.");
      return value;
    }
  };
}

describe("P02 terminal session input, streaming and lifecycle", () => {
  it("streams a prompt without a send and writes raw input without decoration", async () => {
    const f = fixture();
    const stream: string[] = [];
    const off = f.session.onData(text => stream.push(text));
    f.emit("Password: ");
    expect(stream.join("")).toBe("Password: ");
    await f.session.write("answer\r");
    expect(f.writes).toEqual(["answer\r"]);
    off();
    f.emit("not subscribed");
    expect(stream).toHaveLength(1);
  });

  it("forwards a real resize capability and refuses pipes/invalid dimensions", async () => {
    const f = fixture();
    await f.session.resize(120, 43);
    expect(f.resize).toHaveBeenCalledWith(120, 43);
    await expect(f.session.resize(0, 43)).rejects.toThrow(/dimensions/i);
    expect(f.resize).toHaveBeenCalledTimes(1);
    const pipe = fixture({}, "pipe");
    expect(pipe.session.canResize).toBe(false);
    await expect(pipe.session.resize(80, 24)).rejects.toThrow(/pipe/i);
  });

  it("ignores echoed/malformed marker occurrences and accepts strict CRLF status", async () => {
    const f = fixture();
    const pending = f.session.send("printf answer");
    const nonce = f.nonce();
    f.emit(`${f.writes.at(-1)}\r\n${nonce}7garbage\r\n${nonce}999\r\nanswer\r\n${nonce}7\r\n`);
    const result = await pending;
    expect(result.readiness.rung).toBe("marker");
    expect(result.exitCode).toBe(7);
    expect(result.output).toContain("answer");
  });

  it("does not accept a partial status line or silently interleave after timeout", async () => {
    const f = fixture({ timeoutMs: 15 });
    const first = f.session.send("work");
    const old = f.nonce();
    f.emit(old);
    expect((await first).readiness).toMatchObject({ rung: "timeout", settled: false, proven: false });
    await expect(f.session.send("next")).rejects.toThrow(/previous command/);
    f.emit("0\r\n");
    const next = f.session.send("next");
    f.emit(`next\r\n${f.nonce()}0\r\n`);
    expect((await next).exitCode).toBe(0);
  });

  it("keeps cancellation separate from observed process exit and is idempotent", async () => {
    const f = fixture();
    let observedExit = false;
    void f.session.done.then(() => { observedExit = true; });
    const pending = f.session.send("sleep 30");
    f.session.cancel();
    f.session.cancel();
    f.session.dispose();
    expect((await pending).readiness).toMatchObject({ rung: "cancelled", settled: false, proven: false });
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.dispose).not.toHaveBeenCalled();
    expect(observedExit).toBe(false);
    expect(f.session.state).toBe("closing");
    f.exit(null, "cancel");
    expect(await f.session.done).toMatchObject({ reason: "cancel", treeExitProven: false });
    expect(f.session.state).toBe("exited");
    await expect(f.session.write("late")).rejects.toThrow(/closing|exited/);
  });

  it("does not submit any bytes for an already-aborted send", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    expect((await f.session.send("forbidden", { signal: controller.signal })).readiness.rung).toBe("cancelled");
    expect(f.writes).toEqual([]);
  });

  it("releases the busy latch when the first synchronous write throws", async () => {
    const f = fixture();
    f.write.mockImplementationOnce(() => { throw new Error("refused before input"); });
    await expect(f.session.send("first")).rejects.toThrow(/refused/);
    const pending = f.session.send("second");
    f.emit(`${f.nonce()}0\n`);
    expect((await pending).exitCode).toBe(0);
  });

  it("reports exited, not an error, when the command closes the shell before the sentinel is accepted", async () => {
    const f = fixture();
    // `exit 0; false` closes the shell: the command line is accepted, the sentinel line
    // fails with EPIPE, and the backend reports the exit only after that write error.
    f.write
      .mockImplementationOnce(async (text: string) => { f.writes.push(text); })
      .mockImplementationOnce(async () => { throw new Error("The pipe terminal did not accept input."); });
    const pending = f.session.send("exit 0; false");
    setTimeout(() => f.exit(0), 5);
    const result = await pending;
    expect(result.readiness.rung).toBe("exited");
    expect(result.exitCode).toBeNull();
  });

  it("bounds the retained transcript without dropping live output or splitting Unicode", async () => {
    const f = fixture({ maxOutputBytes: 64 });
    let live = "";
    f.session.onData(text => { live += text; });
    const pending = f.session.send("produce output");
    const full = `${"🙂".repeat(200)}\r\n${f.nonce()}0\r\n`;
    f.emit(full);
    const result = await pending;
    expect(live).toBe(full);
    expect(result.readiness.rung).toBe("marker");
    expect(result.droppedBytes).toBeGreaterThan(0);
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(64);
    expect(result.output).not.toContain("�");
  });

  it("replays final exit to late listeners but does not invent a new command status", async () => {
    const f = fixture();
    f.exit(7);
    await f.session.done;
    const listener = vi.fn();
    f.session.onExit(listener);
    expect(listener).toHaveBeenCalledWith(7);
    expect((await f.session.send("never ran")).exitCode).toBeNull();
    expect(f.writes).toEqual([]);
  });
});

describe("P02 terminal output decoder", () => {
  it("redacts a secret across reads without withholding an unrelated prompt", () => {
    let text = "";
    const output = new TerminalOutput(chunk => { text += chunk; }, ["secret-value"]);
    output.push(Buffer.from("Password: "));
    expect(text).toBe("Password: ");
    output.push(Buffer.from("secret-"));
    expect(text).toBe("Password: ");
    output.push(Buffer.from("value\r\n"));
    const emoji = Buffer.from("🙂");
    output.push(emoji.subarray(0, 1));
    output.push(emoji.subarray(1, 3));
    output.push(emoji.subarray(3));
    output.end();
    output.end();
    expect(text).toBe("Password: [amc:redacted]\r\n🙂");
  });

  it("flushes a non-secret final prefix and refuses excessive scrub state", () => {
    let text = "";
    const output = new TerminalOutput(chunk => { text += chunk; }, ["abcdef"]);
    output.push(Buffer.from("prompt: ab"));
    output.end();
    expect(text).toBe("prompt: ab");
    expect(() => new TerminalOutput(() => undefined, ["x".repeat(8193)])).toThrow(/budget/);
  });
});
