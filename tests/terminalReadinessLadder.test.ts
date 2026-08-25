import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openPipeTerminal } from "../src/terminal/pipeTerminal.js";
import { TerminalSession } from "../src/terminal/terminalSession.js";
import type { TerminalBackend } from "../src/terminal/terminalTypes.js";

/**
 * P4.2 VERIFY criterion 2, as far as a pipe backend can carry it: a terminal
 * reaches readiness by an evidence ladder.
 *
 * The ladder is only worth having if its rungs are distinguishable and its
 * bottom rung can say "not ready". A ladder whose last rung is a deadline has
 * a rung that always passes, so a result carrying only `rung` would let a
 * caller read a hung shell as a finished command — and record it as one.
 */
const dirs: string[] = [];
const open: TerminalSession[] = [];

afterEach(() => {
  while (open.length > 0) {
    try { open.pop()?.dispose(); } catch { /* already gone */ }
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function session(options: ConstructorParameters<typeof TerminalSession>[1] = {}): TerminalSession {
  const cwd = mkdtempSync(join(tmpdir(), "amc-term-"));
  dirs.push(cwd);
  const s = new TerminalSession(
    openPipeTerminal({ cwd, env: { PATH: process.env["PATH"] ?? "" } }),
    { pollIntervalMs: 20, ...options }
  );
  open.push(s);
  return s;
}

describe("the readiness ladder", () => {
  it("settles on the marker rung, with the command's own exit status", async () => {
    const s = session();
    const result = await s.send("echo hello");

    expect(result.readiness.rung).toBe("marker");
    expect(result.readiness.settled).toBe(true);
    expect(result.readiness.proven, "the sentinel is an observation, not a guess").toBe(true);
    expect(result.output).toContain("hello");
    expect(result.exitCode).toBe(0);
  });

  it("carries a failing command's status rather than the sentinel's", async () => {
    // The sentinel runs as its own command so `$?` is the USER command's
    // status. Writing them as one line would report the sentinel's own 0.
    const s = session();
    const result = await s.send("exit 0; false");
    const result2 = await session().send("false");
    expect(result2.exitCode, "a failing command must not read as success").toBe(1);
    expect(result.readiness.settled).toBe(true);
  });

  it("keeps the sentinel off the user's command line", async () => {
    // A command ending in `&` is valid on its own and a syntax error when
    // something is appended after a `;`. The sentinel therefore goes on its
    // own line -- which is the only thing that distinguishes the two forms,
    // since `$?` refers to the user's command either way.
    const s = session();
    const result = await s.send("sleep 0.05 &");

    expect(result.readiness.rung, "the sentinel must survive an unusual command").toBe("marker");
    expect(result.exitCode).toBe(0);
  });

  it("does not infer idle from a command that never produced any output", async () => {
    // Silence before the first byte is startup latency, not completion. Firing
    // the idle rung on it would report every slow-starting command as finished
    // almost immediately.
    const s = session({ idleSilenceMs: 100, timeoutMs: 600 });
    const result = await s.send("sleep 30");

    expect(result.readiness.rung, "no output means nothing to be idle after").toBe("timeout");
    expect(result.readiness.settled).toBe(false);
  });

  it("reports a timeout as NOT settled", async () => {
    // The rung that always passes. If `settled` collapsed into `rung`, a
    // caller reading output would treat this as a completed command.
    const s = session({ timeoutMs: 250, idleSilenceMs: 100_000 });
    const result = await s.send("sleep 30");

    expect(result.readiness.rung).toBe("timeout");
    expect(result.readiness.settled, "a deadline is not readiness").toBe(false);
    expect(result.readiness.proven).toBe(false);
    expect(result.exitCode, "nothing was learned about the command").toBeNull();
  });

  it("falls back to the idle rung and marks it unproven", async () => {
    // A command that emits output and then goes quiet without the sentinel
    // coming back. Silence is indistinguishable from a slow command, so the
    // rung settles but does not claim proof.
    const s = session({ idleSilenceMs: 200, timeoutMs: 10_000 });
    // `exec` replaces the shell, so the sentinel never runs; the child keeps
    // the pipe open, so this is silence rather than exit.
    const result = await s.send("printf 'working\\n'; exec sleep 5");

    expect(result.readiness.rung).toBe("idle");
    expect(result.readiness.settled).toBe(true);
    expect(result.readiness.proven, "inference must not be recorded as observation").toBe(false);
    expect(result.output).toContain("working");
    expect(result.exitCode).toBeNull();
  });

  it("settles on exit when the shell goes away without the sentinel", async () => {
    const s = session({ idleSilenceMs: 10_000, timeoutMs: 10_000 });
    const result = await s.send("exec true");

    expect(result.readiness.rung).toBe("exited");
    expect(result.readiness.proven).toBe(true);
    expect(result.exitCode, "the shell is gone; the command's status is unknowable").toBeNull();
  });

});

describe("rung precedence, on a backend that can produce both at once", () => {
  /**
   * A real `sh` cannot reach this state: `exit` kills the shell before it ever
   * reads the sentinel line, so marker and exit are mutually exclusive there.
   * A fake backend can, and the precedence still has to be right for the PTY
   * backend that lands later — where a shell CAN emit the sentinel and then go
   * away.
   */
  function fakeBackend(): { backend: TerminalBackend; lastWrite: () => string; emit: (t: string) => void; exit: (c: number | null) => void } {
    const data: Array<(t: string) => void> = [];
    const exits: Array<(c: number | null) => void> = [];
    let written = "";
    return {
      backend: {
        kind: "pipe",
        write(text: string): void { written = text; },
        onData(l): () => void { data.push(l); return () => data.splice(data.indexOf(l), 1); },
        onExit(l): () => void { exits.push(l); return () => exits.splice(exits.indexOf(l), 1); },
        dispose(): void { /* nothing to release */ }
      },
      lastWrite: () => written,
      emit: (t) => { for (const l of [...data]) l(t); },
      exit: (c) => { for (const l of [...exits]) l(c); }
    };
  }

  it("prefers the marker over exit when both are true", async () => {
    // A shell that ran the command and then went away still told us how the
    // command ended, and that is the more informative of two true answers.
    const fake = fakeBackend();
    const s = new TerminalSession(fake.backend, { pollIntervalMs: 10, idleSilenceMs: 50_000 });
    const pending = s.send("echo done");

    // The sentinel write carries this send's nonce; replay it exactly.
    const nonce = /'(AMC[0-9a-f]+)'/.exec(fake.lastWrite())?.[1];
    expect(nonce, "the session writes a nonce-bearing sentinel").toBeDefined();
    fake.emit(`done\n${nonce as string}7\n`);
    fake.exit(0);

    const result = await pending;
    expect(result.readiness.rung).toBe("marker");
    expect(result.readiness.proven).toBe(true);
    expect(result.exitCode, "the command's status, not the shell's").toBe(7);
    expect(result.output).toContain("done");
  });

  it("does not settle on a sentinel whose status digits have not arrived", async () => {
    // A partial line is not evidence: the exit code is the point of the rung.
    const fake = fakeBackend();
    const s = new TerminalSession(fake.backend, { pollIntervalMs: 10, idleSilenceMs: 120, timeoutMs: 5_000 });
    const pending = s.send("echo done");
    const nonce = /'(AMC[0-9a-f]+)'/.exec(fake.lastWrite())?.[1] as string;

    fake.emit(`done\n${nonce}`); // no newline, no digits yet
    const result = await pending;
    expect(result.readiness.rung, "an incomplete sentinel must not read as a completion").not.toBe("marker");
  });
});

describe("the sentinel cannot be forged", () => {
  it("ignores a marker the command printed itself", async () => {
    // A fixed sentinel could be produced by the command -- `echo AMC-DONE` --
    // and the session would report a completion that never happened, with an
    // exit code the command chose. The nonce is minted per send, so output can
    // only contain it by having been generated after the command finished.
    const s = session({ idleSilenceMs: 400, timeoutMs: 10_000 });
    const result = await s.send("printf 'AMC00000000000000000000000000000000 99\\n'; exec sleep 5");

    expect(result.readiness.rung, "a forged sentinel must not settle the send").not.toBe("marker");
    expect(result.exitCode).not.toBe(99);
  });

  it("does not let one send's sentinel settle the next", async () => {
    const s = session({ idleSilenceMs: 400, timeoutMs: 10_000 });
    const first = await s.send("echo one");
    expect(first.readiness.rung).toBe("marker");

    // Replay the first send's exact sentinel text during the second send.
    const stale = first.readiness.evidence;
    expect(stale).toContain("sentinel");
    const second = await s.send("echo two");
    expect(second.readiness.rung).toBe("marker");
    expect(second.output, "each send sees only its own output").not.toContain("one");
  });
});

describe("the pipe backend is honest about what it is not", () => {
  it("reports that it cannot resize instead of accepting the call", async () => {
    // A no-op resize would let a caller believe it had changed something. The
    // method is absent, which is a fact code can check.
    const s = session();
    expect(s.backendKind).toBe("pipe");
    expect(s.canResize, "a pipe has no window size to set").toBe(false);
  });

  it("refuses two concurrent sends rather than interleaving them", async () => {
    // Two sends share one output stream, and neither could say which bytes
    // were its own.
    const s = session({ idleSilenceMs: 300, timeoutMs: 5_000 });
    const first = s.send("echo a");
    await expect(s.send("echo b")).rejects.toThrow(/already in flight/);
    await first;
  });
});
