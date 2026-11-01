/**
 * P1-02 follow-up: on a filesystem without hard links (linkSync fails EPERM, ENOTSUP...), the control-file lock the lease
 * revocation store and other signed stores take falls back to an exclusive `wx` create: still one holder at a time,
 * released by its owner. Any other linkSync failure still throws.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";

const link = vi.hoisted(() => ({ code: "EPERM" as string | null }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, linkSync: (...args: Parameters<typeof actual.linkSync>) => {
    if (link.code === null) return actual.linkSync(...args);
    throw Object.assign(new Error(`${link.code}: operation not permitted, link`), { code: link.code });
  } };
});
const { ControlFileLockError, withControlFileLock } = await import("../../src/lifecycle/controlFileLock.js");

const root = mkdtempSync(join(tmpdir(), "amc-lock-nolinks-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const lockPath = join(root, ".revocations.lock");

describe("control-file lock without hard links", () => {
  test.each(["EPERM", "ENOTSUP"])("%s: the lock is an exclusive create, held once, released by its owner", (code) => {
    link.code = code;
    const inside = withControlFileLock({ root, name: "revocations", operation: () => {
      const owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number; token: string };
      expect(owner.pid).toBe(process.pid);
      expect(() => withControlFileLock({ root, name: "revocations", timeoutMs: 50, operation: () => "second holder" })).toThrow(ControlFileLockError);
      return "held";
    } });
    expect(inside).toBe("held");
    expect(existsSync(lockPath)).toBe(false);
  });

  test("another link failure is not a fallback", () => {
    link.code = "EACCES";
    expect(() => withControlFileLock({ root, name: "revocations", operation: () => "unreachable" })).toThrow(/EACCES/);
    expect(existsSync(lockPath)).toBe(false);
    link.code = null;
  });
});
