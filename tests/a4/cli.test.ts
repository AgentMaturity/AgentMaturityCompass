/**
 * P1-65 debt (pending-checks.md): `amc a4` (src/cli-a4-commands.ts) run in process, each leaf through `serveA4`. The
 * preview gate and the identity flags refuse first; identity comes only from a private, non-link login token file; a
 * retry with the same --request-id answers the recorded result; refusals exit 1, verify exits by verdict; export
 * stays inside the workspace.
 */
import { chmodSync, copyFileSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerA4Commands } from "../../src/cli-a4-commands.js";
import { loginAs } from "../governor/governanceFixture.js";
import { a4Workspace, A4Project, type A4Workspace } from "./a4Harness.js";

vi.setConfig({ testTimeout: 120_000 });
let ws: A4Workspace;
let carol: { tokenFile: string; userId: string };
let project: A4Project;

beforeEach(async () => {
  ws = a4Workspace();
  carol = loginAs(ws.workspace, "carol", ["OWNER"]);
  project = await A4Project.create(ws.workspace, { userId: carol.userId }, "P1-65 CLI project");
  vi.spyOn(process, "cwd").mockReturnValue(ws.workspace);
});
afterEach(() => { vi.restoreAllMocks(); });

/** One `amc a4 …` command line; its exit code (process.exit or process.exitCode) and what it printed. */
async function amc(...args: string[]): Promise<{ code: number; out: string; err: string; json: Record<string, unknown> | null }> {
  const out: string[] = [], err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...line: unknown[]) => { out.push(line.join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...line: unknown[]) => { err.push(line.join(" ")); });
  let exited: number | null = null;
  const exit = vi.spyOn(process, "exit").mockImplementation(((value?: number) => { exited ??= value ?? 0; }) as never);
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    const program = new Command().exitOverride();
    registerA4Commands(program);
    await program.parseAsync(["node", "amc", "a4", ...args]);
    const code = exited ?? Number(process.exitCode ?? 0);
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(out.join("\n")) as Record<string, unknown>; } catch { /* text output */ }
    return { code, out: out.join("\n"), err: err.join("\n"), json };
  } finally {
    process.exitCode = before;
    exit.mockRestore();
  }
}

describe("refusals before any route", () => {
  test("preview off refuses a leaf with A4_PREVIEW_DISABLED, exit 1", async () => {
    vi.stubEnv("AMC_A4_PREVIEW", "0");
    const result = await amc("list", "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false, code: "A4_PREVIEW_DISABLED" });
    vi.stubEnv("AMC_A4_PREVIEW", "1");
  });
  test.each([["--username", "carol"], ["--roles", "OWNER"], ["--user-id", "u-1"]])("%s is refused (IDENTITY_FLAG_REFUSED)", async (flag, value) => {
    const result = await amc("list", flag, value, "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false, code: "IDENTITY_FLAG_REFUSED" });
  });
});

describe("the login token file", () => {
  test("a private token file reads as its user", async () => {
    const result = await amc("list", "--session-token-file", carol.tokenFile, "--json");
    expect(result.code).toBe(0);
    expect(JSON.stringify(result.json)).toContain(project.projectId);
  });
  test("a symbolic link to the token file is refused (A4_SESSION_REQUIRED)", async () => {
    const link = join(ws.workspace, "..", "carol-link.token");
    symlinkSync(carol.tokenFile, link);
    const result = await amc("list", "--session-token-file", link, "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ code: "A4_SESSION_REQUIRED", error: expect.stringContaining("symbolic link") });
  });
  test("a 0644 token file is refused (A4_SESSION_REQUIRED)", async () => {
    const open = join(ws.workspace, "..", "carol-open.token");
    copyFileSync(carol.tokenFile, open); chmodSync(open, 0o644);
    const result = await amc("list", "--session-token-file", open, "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ code: "A4_SESSION_REQUIRED" });
  });
  test("a write without a token file is a usage error (commander requires --session-token-file)", async () => {
    await expect(amc("hold", project.projectId, "--reason", "r", "--expect-head-seq", "0")).rejects.toThrow(/session-token-file/);
  });
});

describe("writes, replay and exit codes", () => {
  test("a retry with the same --request-id answers the recorded result (replay), once recorded", async () => {
    const args = ["hold", project.projectId, "--reason", "P1-65 replay", "--expect-head-seq", String(await project.sync()),
      "--session-token-file", carol.tokenFile, "--request-id", "p165replay0001", "--json"];
    const first = await amc(...args);
    expect(first.code, first.out + first.err).toBe(0);
    const second = await amc(...args);
    expect(second.code).toBe(0);
    expect(second.json).toMatchObject({ seq: first.json?.seq, kind: first.json?.kind, replay: true });
  });
  test("a stale --expect-head-seq is refused, exit 1", async () => {
    const result = await amc("hold", project.projectId, "--reason", "stale", "--expect-head-seq", "999",
      "--session-token-file", carol.tokenFile, "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false, code: expect.stringMatching(/STALE|SEQ/) });
  });
  test("verify of a project exits by verdict: integrity passes, untrusted without a trust list is not exit 0", async () => {
    const result = await amc("verify", project.projectId, "--json");
    expect(result.code).not.toBe(0);
    expect(result.json).toMatchObject({ integrity: { status: "pass" }, trusted: false });
  });
  test("verify of a file that does not exist exits 1", async () => {
    expect((await amc("verify", join(ws.workspace, "missing.amcbundle"), "--json")).code).toBe(1);
  });
});

describe("export containment", () => {
  test("--out outside the workspace is refused", async () => {
    const result = await amc("export", project.projectId, "--run", "r1", "--out", "../outside.amcbundle", "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false });
  });
  test("--out through a symlinked directory leading outside is refused", async () => {
    const outside = join(ws.workspace, "..", "outside-dir"); mkdirSync(outside);
    symlinkSync(outside, join(ws.workspace, "linked"));
    const result = await amc("export", project.projectId, "--run", "r1", "--out", "linked/x.amcbundle", "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false, code: "INPUT_INVALID", error: expect.stringContaining("symbolic link") });
  });
  test("--out naming a symbolic link is refused", async () => {
    symlinkSync(join(ws.workspace, "..", "target.amcbundle"), join(ws.workspace, "out.amcbundle"));
    const result = await amc("export", project.projectId, "--run", "r1", "--out", "out.amcbundle", "--json");
    expect(result.code).toBe(1);
    expect(result.json).toMatchObject({ ok: false, code: "INPUT_INVALID", error: expect.stringContaining("symbolic link") });
  });
  test("a run id that is not one path segment is a usage error", async () => {
    await expect(amc("export", project.projectId, "--run", "../r1", "--out", "x.amcbundle")).rejects.toThrow(/run id/);
  });
});
