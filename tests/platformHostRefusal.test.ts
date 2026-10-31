import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bwrapBackend } from "../src/sandbox/bwrapBackend.js";
import { nativeShellReadiness } from "../src/sandbox/nativeShellGate.js";
import { measureProcessConfinement, processIsConfined } from "../src/sandbox/processConfinement.js";
import { SandboxRunner } from "../src/sandbox/sandboxRunner.js";
import { nativePtySupport, prepareNativePtyLaunch } from "../src/terminal/nativePtySandbox.js";

/**
 * WP32: on a real macOS host, every Linux-only confinement request is refused
 * with a reason and nothing launched, and the host's own boundary is Seatbelt,
 * never an unconfined fallback. Unmocked: these call the real backends.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const tempDir = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp32-"))); dirs.push(dir); return dir; };

describe.runIf(process.platform === "darwin")("Linux-only confinement requested on macOS", () => {
  it("refuses the Bubblewrap backend (executable extensions' only backend) and runs nothing", async () => {
    const workspace = tempDir();
    const marker = join(workspace, "ran.txt");
    const runner = new SandboxRunner({ backends: [bwrapBackend()] });
    expect(runner.select()).toBeNull();
    const outcome = await runner.run(["/bin/sh", "-c", `echo ran > ${marker}`], workspace,
      { writableRoots: [workspace], network: "deny", timeoutMs: 5_000 });
    expect(existsSync(marker), "a refused confinement must not fall back to running unconfined").toBe(false);
    expect(outcome).toMatchObject({ confined: false, backend: "none", exitCode: null, failure: { kind: "unavailable" } });
    expect(outcome.failure?.reason).toContain("Bubblewrap requires Linux");
  });

  it("refuses the native PTY before creating any launcher state", () => {
    const workspace = tempDir();
    const support = nativePtySupport();
    expect(support).toMatchObject({ platform: "darwin", prerequisitesAvailable: false, executionVerified: false });
    const before = readdirSync(realpathSync(tmpdir())).filter(name => name.startsWith("amc-pty-")).length;
    expect(() => prepareNativePtyLaunch(workspace, { writableRoots: [workspace], network: "deny", timeoutMs: 5_000 }, 80, 24))
      .toThrow(/Bubblewrap requires Linux/);
    expect(readdirSync(realpathSync(tmpdir())).filter(name => name.startsWith("amc-pty-")).length).toBe(before);
  });

  it("offers the native shell only under Seatbelt, and an unconfined process stays unconfined", () => {
    const readiness = nativeShellReadiness(tempDir());
    expect(readiness).toMatchObject({ offered: true, decision: "confined", enforcement: "enforced", boundary: "macos-seatbelt", optInSource: null });
    // Code Mode reads this: nothing re-execs AMC under a profile, so the process measures unconfined.
    expect(processIsConfined(measureProcessConfinement())).toBe(false);
  });
});
