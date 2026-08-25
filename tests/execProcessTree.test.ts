import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProcess } from "../src/exec/runProcess.js";
import type { ProcessSpec } from "../src/exec/processTypes.js";

/**
 * P4.2 VERIFY criterion 1: a subprocess tree is fully killed on cancel.
 *
 * These spawn real processes, because the property is about operating-system
 * behaviour and a mocked child would prove nothing. The combinations were
 * measured before the code was written:
 *
 *   detached  target  leaf survived
 *   false     pid     YES
 *   true      pid     YES
 *   false     group   YES   (ESRCH -- the kill fails and nothing dies)
 *   true      group   no
 *
 * so a test that only asserted "terminate() resolved" would have passed
 * against three implementations that leak the tree.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workdir(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-exec-"));
  dirs.push(dir);
  return dir;
}

const spec = (overrides: Partial<ProcessSpec> & Pick<ProcessSpec, "argv" | "cwd">): ProcessSpec => ({
  env: {},
  stdout: "capture",
  stderr: "capture",
  maxCaptureBytes: 64_000,
  scrubValues: [],
  graceMs: 200,
  ...overrides
});

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

/** Poll rather than probe once: reaping is asynchronous on both platforms. */
async function goneWithin(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    if (!alive(pid)) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function readPidWithin(path: string, ms: number): Promise<number | null> {
  const until = Date.now() + ms;
  for (;;) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8").trim();
      if (raw.length > 0) return Number(raw);
    }
    if (Date.now() >= until) return null;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("terminating a process tree", () => {
  it("kills a GRANDCHILD, not just the process it spawned", async () => {
    const dir = workdir();
    const leafPid = join(dir, "leaf.pid");
    const script = join(dir, "tree.sh");
    // The middle shell backgrounds a leaf and waits. `:` at the end stops the
    // shell exec-ing away, which would collapse the tree to one process and
    // make this test pass without testing anything.
    writeFileSync(script, `sleep 30 &\necho $! > ${leafPid}\nwait\n:\n`);

    const running = runProcess(spec({ argv: ["/bin/sh", script], cwd: dir }));
    const leaf = await readPidWithin(leafPid, 4000);
    expect(leaf, "the leaf must have started before we test killing it").not.toBeNull();
    expect(alive(leaf as number)).toBe(true);

    running.terminate("cancel");
    const outcome = await running.done;

    expect(
      await goneWithin(leaf as number, 3000),
      "the grandchild outlives a kill aimed at the direct child only"
    ).toBe(true);
    expect(outcome.terminatedBy).toBe("cancel");
  });

  it("escalates to SIGKILL when the tree ignores SIGTERM", async () => {
    const dir = workdir();
    const started = join(dir, "started");
    const script = join(dir, "stubborn.sh");
    writeFileSync(script, `trap '' TERM\necho up > ${started}\nsleep 30\n:\n`);

    const running = runProcess(spec({ argv: ["/bin/sh", script], cwd: dir, graceMs: 300 }));
    expect(await readPidWithin(started, 4000) !== null || existsSync(started)).toBe(true);

    running.terminate("cancel");
    const outcome = await running.done;

    // It refused SIGTERM, so it can only have died to the escalation.
    expect(outcome.signal, "a TERM-ignoring tree must still be stopped").toBe("SIGKILL");
    expect(outcome.exitCode, "a signalled process has no exit code").toBeNull();
  });

  it("reports terminatedBy separately from how the process died", async () => {
    // Three orthogonal facts: WE asked it to stop, the kernel signalled it,
    // and it had no exit code. Collapsing them loses which one happened.
    const dir = workdir();
    const running = runProcess(spec({ argv: ["/bin/sh", "-c", "sleep 30"], cwd: dir }));
    running.terminate("dispose");
    const outcome = await running.done;

    expect(outcome.terminatedBy).toBe("dispose");
    expect(outcome.signal).not.toBeNull();
    expect(outcome.exitCode).toBeNull();
  });

  it("leaves terminatedBy null when the process ends on its own", async () => {
    const dir = workdir();
    const outcome = await runProcess(spec({ argv: ["/bin/sh", "-c", "exit 7"], cwd: dir })).done;
    expect(outcome.exitCode).toBe(7);
    expect(outcome.signal).toBeNull();
    expect(outcome.terminatedBy, "nobody terminated this; it exited").toBeNull();
  });

  it("terminates on an AbortSignal", async () => {
    const dir = workdir();
    const controller = new AbortController();
    const running = runProcess(spec({ argv: ["/bin/sh", "-c", "sleep 30"], cwd: dir, signal: controller.signal }));
    controller.abort();
    expect((await running.done).terminatedBy).toBe("cancel");
  });

  it("terminates on its own timeout, and says so", async () => {
    const dir = workdir();
    const outcome = await runProcess(spec({
      argv: ["/bin/sh", "-c", "sleep 30"], cwd: dir, timeoutMs: 150
    })).done;
    // "timeout" rather than "cancel": a deadline we set and a caller who
    // changed their mind are different events in an audit.
    expect(outcome.terminatedBy).toBe("timeout");
  });

  it("puts the child in its own process group", async () => {
    // The precondition for every test above. Node exposes no getpgid, so this
    // asks the OS the same way a person would.
    const dir = workdir();
    const running = runProcess(spec({ argv: ["/bin/sh", "-c", "sleep 5"], cwd: dir }));
    const pid = running.pid;
    expect(pid).not.toBeNull();

    const pgid = Number(
      execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim()
    );
    expect(pgid, "its own group is what makes a group kill reach the tree").toBe(pid);
    expect(pgid).not.toBe(process.pid);

    running.terminate("dispose");
    await running.done;
  });
});

describe("the environment is complete, never inherited", () => {
  it("passes only what the spec names", async () => {
    // The bug this closes: monitor.ts inherited process.env by default and
    // remembered to strip provider keys at one of its two spawn sites. The
    // version probe -- which runs the untrusted binary FIRST -- did not.
    const dir = workdir();
    const priorKey = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "sk-should-never-be-inherited";
    try {
      const outcome = await runProcess(spec({
        argv: ["/bin/sh", "-c", "echo \"[$OPENAI_API_KEY]\""],
        cwd: dir,
        env: { PATH: process.env["PATH"] ?? "" }
      })).done;
      expect(outcome.stdout.text.trim(), "an unnamed variable must not reach the child").toBe("[]");
    } finally {
      if (priorKey === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = priorKey;
    }
  });
});
