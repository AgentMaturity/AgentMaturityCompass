import type { IncomingMessage } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

// A pass-through spy, as tests/industryPacksHostedApi.test.ts does: the comparison must go through timingSafeEqual.
const spy = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  spy.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, default: { ...actual, timingSafeEqual: spy.timingSafeEqual }, timingSafeEqual: spy.timingSafeEqual };
});
const { secretEquals } = await import("../src/utils/secretEquals.js");
const { authenticate } = await import("../src/studio/toolhubIntentAuthority.js");
const { initWorkspace } = await import("../src/workspace.js");

const roots: string[] = [];
afterEach(() => {
  spy.timingSafeEqual.mockClear();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function request(headers: Record<string, string>): IncomingMessage {
  return { headers, rawHeaders: Object.entries(headers).flat(), url: "/status", method: "GET", socket: { remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;
}

// LIVE-RUNTIME-08: one constant-time comparison for every admin token, and an empty value never authenticates.
describe("secretEquals", () => {
  test("equal is true; a different value of the same or another length is false; empty and non-strings are false", () => {
    expect(secretEquals("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(secretEquals("a".repeat(64), `${"a".repeat(63)}b`)).toBe(false);
    expect(secretEquals("short", "a".repeat(64))).toBe(false);
    expect(secretEquals("", "")).toBe(false);
    expect(secretEquals("", "a")).toBe(false);
    expect(secretEquals(["a"], "a")).toBe(false);
    expect(secretEquals(undefined, "a")).toBe(false);
  });
});

describe("Studio admin token", () => {
  test("a wrong token is compared in constant time and refused; the right token is admin", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-admin-token-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const token = "f".repeat(64);
    expect(authenticate(request({ "x-amc-admin-token": "e".repeat(64) }), workspace, token)).toBeNull();
    expect(spy.timingSafeEqual).toHaveBeenCalled();
    expect(authenticate(request({ "x-amc-admin-token": token }), workspace, token)?.isAdmin).toBe(true);
  });

  test("an empty header never authenticates, even against an empty configured token", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-admin-token-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    expect(authenticate(request({ "x-amc-admin-token": "" }), workspace, "")).toBeNull();
  });
});
