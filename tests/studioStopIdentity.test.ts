import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { stopStudioDaemon } from "../src/studio/studioSupervisor.js";

/**
 * `amc down` reads the pid from .amc/studio/state.json, which is unsigned and outlives a crashed Studio.
 * Before this check a live pid was enough, so a stale file whose pid another program reused got SIGTERM.
 */
const children: ChildProcess[] = [];
const roots: string[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspaceNaming(pid: number): { workspace: string; stateFile: string } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-studio-stop-"));
  roots.push(workspace);
  const stateFile = join(workspace, ".amc", "studio", "state.json");
  mkdirSync(join(workspace, ".amc", "studio"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ pid }));
  return { workspace, stateFile };
}

/** A live process with the given arguments; resolves once it runs its own code, so ps shows its own command line. */
async function idleProcess(args: string[]): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)", ...args], { stdio: ["ignore", "pipe", "ignore"] });
  children.push(child);
  await new Promise<void>((ready) => child.stdout!.once("data", () => ready()));
  return child;
}

const running = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe.skipIf(process.platform === "win32")("amc down signals only the AMC Studio daemon", () => {
  test("a stale state file whose pid another program reused is not signalled", async () => {
    const other = await idleProcess([]);
    const { workspace, stateFile } = workspaceNaming(other.pid!);

    const result = stopStudioDaemon(workspace);

    expect(result.stopped).toBe(false);
    expect(result.message).toContain(`pid ${other.pid} in .amc/studio/state.json is not the AMC Studio daemon; nothing was signalled`);
    await new Promise((settle) => setTimeout(settle, 300));
    expect(running(other.pid!), "the other program must still run").toBe(true);
    expect(other.exitCode).toBeNull();
    // Kept: a foreground Studio (amc studio start) writes the same file, so the user decides.
    expect(existsSync(stateFile)).toBe(true);
  });

  test("the daemon amc up started is signalled and its state cleared", async () => {
    const daemon = await idleProcess(["_studio-daemon", "--workspace", "/fixture/workspace"]);
    const { workspace, stateFile } = workspaceNaming(daemon.pid!);
    const exit = new Promise<NodeJS.Signals | null>((done) => daemon.once("exit", (_code, signal) => done(signal)));

    expect(stopStudioDaemon(workspace)).toEqual({ stopped: true, message: `Sent SIGTERM to studio pid ${daemon.pid}` });
    expect(await exit).toBe("SIGTERM");
    expect(existsSync(stateFile)).toBe(false);
  });
});
