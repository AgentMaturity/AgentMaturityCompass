import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nativePtySupport } from "../src/terminal/nativePtySandbox.js";
import { openNativePtyTerminal } from "../src/terminal/nativePtyTerminal.js";
import { openPipeTerminal } from "../src/terminal/pipeTerminal.js";
import { TerminalSession } from "../src/terminal/terminalSession.js";

/**
 * UNEXECUTED integration regressions. The explicit flag is for the coordinator
 * to enable only at the full implementation boundary. A skipped suite is not a
 * pass or platform receipt. Missing prerequisites FAIL once execution is opted
 * in; there is no skip-on-launch-error and no alternate terminal backend.
 * Direct transport fixtures do not establish a host approval/policy binding.
 */
const enabled = process.platform === "linux" && process.env["AMC_P02_RUN_LINUX_PTY"] === "1";
const roots: string[] = [];
const sessions: TerminalSession[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    session.dispose();
    await session.done;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const support = nativePtySupport();
  expect(support.prerequisitesAvailable, support.reason).toBe(true);
  expect(support.executionVerified).toBe(false);
  const root = mkdtempSync(join(tmpdir(), "amc-p02-pty-it-"));
  roots.push(root);
  mkdirSync(join(root, "allowed"));
  mkdirSync(join(root, ".amc"));
  writeFileSync(join(root, ".amc", "protected"), "P02 authority fixture\n");
  const session = new TerminalSession(openNativePtyTerminal({ cwd: root, cols: 80, rows: 24,
    policy: { writableRoots: [join(root, "allowed")], network: "deny", timeoutMs: 12_000 }
  }), { pollIntervalMs: 5, idleSilenceMs: 2_000, timeoutMs: 5_000 });
  sessions.push(session);
  let transcript = "";
  session.onData(text => { transcript += text; });
  await session.ready;
  return { session, root, output: () => transcript };
}

async function waitForText(output: () => string, text: string): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (!output().includes(text)) {
    if (Date.now() >= deadline) throw new Error(`Expected terminal output did not arrive: ${JSON.stringify(text)}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe.runIf(enabled)("P02 opt-in Linux real PTY integration", () => {
  it("allocates actual tty stdio and a controlling terminal with resize", async () => {
    const { session } = await fixture();
    expect(session.backendKind).toBe("pty");
    const tty = await session.send("test -t 0 && test -t 1 && test -t 2 && test -c /dev/tty");
    expect(tty.readiness.rung).toBe("marker");
    expect(tty.exitCode).toBe(0);
    await session.resize(101, 37);
    const size = await session.send("stty size < /dev/tty");
    expect(size.exitCode).toBe(0);
    expect(size.output).toMatch(/37\s+101/);
    await session.write("exit\n");
    expect(await session.done).toMatchObject({ code: 0, confined: true, reason: "exit" });
  }, 15_000);

  it("delivers raw prompt input and interrupts a foreground program without closing the shell", async () => {
    const { session, output } = await fixture();
    await session.write("read value; printf '\\nVALUE:%s\\n' \"$value\"\n");
    await session.write("answer\r");
    await waitForText(output, "\r\nVALUE:answer\r\n");
    await session.write("printf '\\nP02_RUNNING\\n'; sleep 30\n");
    await waitForText(output, "\r\nP02_RUNNING\r\n");
    await session.write("\x03");
    const alive = await session.send("printf '\\nP02_ALIVE\\n'");
    expect(alive.readiness.rung).toBe("marker");
    expect(alive.exitCode).toBe(0);
    expect(alive.output).toContain("P02_ALIVE");
  }, 15_000);

  it("retains write-root, authority-mask and socket-denial boundaries", async () => {
    const { session, root } = await fixture();
    expect((await session.send("touch allowed/permitted")).exitCode).toBe(0);
    expect(existsSync(join(root, "allowed", "permitted"))).toBe(true);
    const denied = await session.send("touch forbidden 2>/dev/null");
    expect(denied.readiness.rung).toBe("marker");
    expect(denied.exitCode).not.toBe(0);
    expect(existsSync(join(root, "forbidden"))).toBe(false);
    expect((await session.send("cat .amc/protected 2>/dev/null")).exitCode).not.toBe(0);
    const socket = await session.send("/usr/bin/python3 -I -S -c 'import socket; socket.socket()' 2>&1");
    expect(socket.readiness.rung).toBe("marker");
    expect(socket.exitCode).not.toBe(0);
    expect(socket.output).toContain("PermissionError: [Errno 1]");
  }, 15_000);

  it("settles cancellation of a live namespace without manufacturing a command-exit receipt", async () => {
    const { session, output } = await fixture();
    await session.write("printf '\\nP02_CANCEL_READY\\n'; sleep 30 & wait\n");
    await waitForText(output, "\r\nP02_CANCEL_READY\r\n");
    session.cancel();
    const exit = await session.done;
    expect(exit.reason).toBe("cancel");
    expect(session.state).toBe("exited");
    // Confinement/cleanup are independent fields. Cancellation is not proof
    // of a complete launcher receipt or of the command's natural exit status.
    if (!exit.confined) expect(exit.code).toBeNull();
    await expect(session.write("late")).rejects.toThrow(/closing|exited/);
  }, 15_000);

  it("reports legacy pipe spawn failure instead of emitting an unhandled child error", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-p02-pipe-it-"));
    roots.push(root);
    const pipe = openPipeTerminal({ cwd: root, shell: join(root, "nonexistent-shell"), env: {}, graceMs: 20 });
    await expect(pipe.ready).rejects.toThrow(/could not be started/);
    expect(await pipe.done).toMatchObject({ code: null, reason: "error" });
    expect(pipe.kind).toBe("pipe");
    expect(pipe.resize).toBeUndefined();
  }, 5_000);
});

describe("P02 explicit native platform support", () => {
  it.runIf(process.platform !== "linux")("refuses native PTY support outside Linux rather than relabelling a pipe", () => {
    expect(nativePtySupport()).toMatchObject({ platform: process.platform, prerequisitesAvailable: false, executionVerified: false });
  });
});
