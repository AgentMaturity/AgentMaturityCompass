import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initActionPolicy, verifyActionPolicySignature } from "../src/governor/actionPolicyEngine.js";
import { captureOrgFiles, observedFileMode } from "../src/org/preparedOrgPairs.js";
import { initWorkspace } from "../src/workspace.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * Windows keeps only a read-only attribute, and Node reports a regular file's mode as 0o666 (writable) or 0o444
 * (read-only), whatever chmod asked for. The nightly qualification on windows-latest failed `amc init` with
 * "published action-policy pair differs from its acknowledged prepared bytes" because the read-back compared that
 * 0o666 with 0o644. Here lstat reports the Windows form while process.platform reads win32.
 */
const windows = vi.hoisted(() => ({ on: false }));
vi.mock("node:fs", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const windowsForm = <F extends (...args: never[]) => unknown>(original: F) => ((...args: Parameters<F>) => {
    const stat = original(...args) as import("node:fs").Stats | undefined;
    if (windows.on && stat?.isFile()) stat.mode = (stat.mode & ~0o777) | (stat.mode & 0o200 ? 0o666 : 0o444);
    return stat;
  }) as unknown as F;
  const lstatSync = windowsForm(fs.lstatSync), statSync = windowsForm(fs.statSync), fstatSync = windowsForm(fs.fstatSync);
  return { ...fs, default: { ...fs, lstatSync, statSync, fstatSync }, lstatSync, statSync, fstatSync };
});

const realPlatform = process.platform;
function asWindows<T>(platform: NodeJS.Platform, run: () => T): T {
  windows.on = true; Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try { return run(); } finally { windows.on = false; Object.defineProperty(process, "platform", { value: realPlatform, configurable: true }); }
}

const dirs: string[] = [];
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-win-mode-"))); dirs.push(dir); return dir;
}

describe("action-policy publication under Windows file modes", () => {
  it("initializes and verifies when Windows reports a writable file as 0o666", () => {
    process.env["AMC_VAULT_PASSPHRASE"] ??= "windows-mode-pass";
    const ws = tempDir(); initWorkspaceWithoutActionPolicy({ workspacePath: ws, trustBoundaryMode: "isolated" });
    asWindows("win32", () => initActionPolicy(ws));
    expect(verifyActionPolicySignature(ws)).toMatchObject({ valid: true });
  });

  it("completes the whole fresh `amc init` path (sync initWorkspace) under Windows modes", () => {
    process.env["AMC_VAULT_PASSPHRASE"] ??= "windows-mode-pass";
    const ws = tempDir();
    asWindows("win32", () => initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" }));
  });

  it("keeps the exact 0o644 check on POSIX and refuses a read-only file on Windows", () => {
    const dir = tempDir(), file = join(dir, "member.yaml");
    writeFileSync(file, "a: 1\n"); chmodSync(file, 0o644);
    expect(asWindows("linux", () => captureOrgFiles([file]).members[0]!.mode)).toBe(0o666);
    chmodSync(file, 0o444);
    expect(asWindows("win32", () => captureOrgFiles([file]).members[0]!.mode)).toBe(0o444);
    // Expected modes computed from umask or a raw lstat (0o666 on Windows) must go through the same mapping.
    expect([0o666, 0o644].map(mode => observedFileMode(mode, "win32"))).toEqual([0o644, 0o644]);
  });
});
