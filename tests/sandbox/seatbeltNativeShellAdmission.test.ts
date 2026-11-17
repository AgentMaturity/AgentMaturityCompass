/**
 * The macOS native shell's admission checks and how it reads a launch, on any OS. No kernel and no sandbox-exec are
 * involved: the prerequisite stat of /usr/bin/sandbox-exec and the process launch are synthetic, so nothing here
 * claims that Seatbelt applied a profile. The launch stand-in plays the in-profile wrapper by writing (or not writing)
 * the marker the real wrapper writes; the tests check what the backend concludes from that.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, type Stats } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SandboxPolicy } from "../../src/sandbox/sandboxTypes.js";

type Launch = { argv: string[]; env: Record<string, string>; scrubValues: string[]; cwd: string; timeoutMs: number };
type Outcome = { exitCode: number | null; terminatedBy: "exit" | "timeout" | "cancel"; treeExitProven: boolean;
  stdout: { text: string; droppedBytes: number }; stderr: { text: string; droppedBytes: number } };
const synthetic = vi.hoisted(() => ({
  launch: vi.fn<(options: Launch) => { done: Promise<Outcome> }>(),
  sandboxExec: { uid: 0, mode: 0o100755, isFile: () => true } as Pick<Stats, "uid" | "mode" | "isFile">
}));
// Only the sandbox-exec prerequisite is synthetic; every other stat is the real one.
vi.mock("node:fs", async importOriginal => {
  const real = await importOriginal<typeof import("node:fs")>();
  const statSync = ((path: string, ...rest: unknown[]) => path === "/usr/bin/sandbox-exec" ? synthetic.sandboxExec
    : (real.statSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof real.statSync;
  return { ...real, statSync, default: { ...real, statSync } };
});
vi.mock("../../src/exec/runProcess.js", () => ({ runProcess: synthetic.launch }));
const { seatbeltNativeShell } = await import("../../src/sandbox/seatbeltNativeShell.js");

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
function platform(value: NodeJS.Platform): void { Object.defineProperty(process, "platform", { ...originalPlatform, value }); }

let root: string, workspace: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-seatbelt-admission-")));
  workspace = join(root, "ws");
  mkdirSync(join(workspace, "build"), { recursive: true });
  mkdirSync(join(root, "home"));
  vi.stubEnv("HOME", join(root, "home"));
  platform("darwin");
  synthetic.launch.mockReset();
});
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const policy = (extra: Partial<SandboxPolicy> = {}): SandboxPolicy => ({ writableRoots: [], timeoutMs: 1000, network: "deny", ...extra });
const ADMISSION_FAILED = "macOS shell admission or launcher execution failed; no unconfined fallback was attempted.";
function refusal(reason: string, extra: Record<string, unknown> = {}) {
  return { confined: false, backend: "seatbelt", failure: { kind: "runner-failure", reason }, exitCode: null,
    timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: true, ...extra };
}
function outcome(extra: Partial<Outcome> = {}): Outcome {
  return { exitCode: 0, terminatedBy: "exit", treeExitProven: true, stdout: { text: "out", droppedBytes: 0 }, stderr: { text: "", droppedBytes: 0 }, ...extra };
}
/** Plays the in-profile wrapper: argv is sandbox-exec -f <profile> /bin/sh -c <wrapper> <name> <probe> <marker> <command...>. */
function launches(result: Outcome, wrapperRan = true, seen?: (options: Launch, profile: string) => void): void {
  synthetic.launch.mockImplementation((options) => {
    if (wrapperRan) writeFileSync(options.argv[8]!, "");
    seen?.(options, readFileSync(options.argv[2]!, "utf8"));
    return { done: Promise.resolve(result) };
  });
}

describe("refusals before any launch", () => {
  test("off macOS the backend is unavailable", async () => {
    platform("linux");
    expect(await seatbeltNativeShell().run(["/bin/sh"], workspace, policy())).toEqual({
      ...refusal("Seatbelt requires macOS."), failure: { kind: "unavailable", reason: "Seatbelt requires macOS." } });
  });

  test("an egress allow-list needs the call's workspace and agent", async () => {
    expect(await seatbeltNativeShell().run(["/bin/sh"], workspace, policy({ allowHosts: ["example.com"], onEgress: () => {} })))
      .toEqual(refusal("A shell egress allowlist requires the call's workspace and agent for egress checks."));
  });

  test("a workspace that is a file, or /, is refused", async () => {
    writeFileSync(join(root, "file"), "");
    for (const cwd of [join(root, "file"), "/"]) {
      expect(await seatbeltNativeShell().run(["/bin/sh"], cwd, policy()))
        .toEqual(refusal("The macOS shell workspace must be a directory other than /."));
    }
  });

  test("a missing workspace fails admission without naming the path", async () => {
    expect(await seatbeltNativeShell().run(["/bin/sh"], join(root, "absent"), policy())).toEqual(refusal(ADMISSION_FAILED));
  });

  test.each([
    ["outside the workspace", () => { mkdirSync(join(root, "elsewhere")); return join(root, "elsewhere"); }],
    ["spelled through a symlink", () => { symlinkSync(join(workspace, "build"), join(workspace, "link")); return join(workspace, "link"); }],
    ["under the workspace's .amc", () => { mkdirSync(join(workspace, ".amc", "x"), { recursive: true }); return join(workspace, ".amc", "x"); }],
    ["a file, not a directory", () => { writeFileSync(join(workspace, "f"), ""); return join(workspace, "f"); }]
  ])("a write grant %s is refused", async (_name, grant) => {
    expect(await seatbeltNativeShell().run(["/bin/sh"], workspace, policy({ writableRoots: [grant()] }))).toEqual(refusal(ADMISSION_FAILED));
    expect(synthetic.launch).not.toHaveBeenCalled();
  });

  test("launcher state inside the workspace is refused", async () => {
    vi.stubEnv("TMPDIR", join(workspace, "build"));
    expect(await seatbeltNativeShell().run(["/bin/sh"], workspace, policy()))
      .toEqual(refusal("Launcher state must be outside the exposed workspace."));
    expect(synthetic.launch).not.toHaveBeenCalled();
  });
});

describe("reading a launch", () => {
  test("a confirmed profile is confined, with the grant, private storage and the deny-list in the profile", async () => {
    let launch: Launch | undefined, profile = "";
    launches(outcome({ exitCode: 3, stderr: { text: "warn", droppedBytes: 2 }, stdout: { text: "out", droppedBytes: 1 } }), true,
      (options, text) => { launch = options; profile = text; });
    const result = await seatbeltNativeShell().run(["echo", "hi"], workspace, policy({ writableRoots: [join(workspace, "build")],
      readDeny: [join(root, "secret")], sourcePolicySha256: "abc" }));
    expect(result).toMatchObject({ confined: true, backend: "seatbelt", failure: null, exitCode: 3, timedOut: false, cancelled: false,
      stdout: "out", stderr: "warn", writableRoots: [join(workspace, "build")], treeExitProven: true, droppedBytes: 3 });
    expect(result.enforcement).toMatchObject({ boundary: "macos-seatbelt", network: "denied", allowHosts: [], processLimit: null,
      sourcePolicySha256: "abc", launcherStatus: "command-exited" });
    expect(launch!.argv.slice(-2)).toEqual(["echo", "hi"]);
    expect(launch!.argv[0]).toBe("/usr/bin/sandbox-exec");
    expect(launch!.cwd).toBe(workspace);
    expect(launch!.env.HOME).toBe(launch!.env.TMPDIR);
    expect(launch!.env).not.toHaveProperty("HTTP_PROXY");
    expect(profile).toContain(`(subpath "${join(workspace, "build")}")`);
    expect(profile).toContain(`(subpath "${join(root, "secret")}")`);
    expect(profile).toContain(`(subpath "${join(root, "home", ".ssh")}")`);
    expect(profile).toContain("(deny network*)");
    // The launcher folder (profile, probe, private TMPDIR) is gone afterwards.
    expect(existsSync(launch!.argv[2]!)).toBe(false);
  });

  test("with an allow-list, the command gets the per-call proxy and its token is scrubbed", async () => {
    let launch: Launch | undefined, profile = "";
    launches(outcome(), true, (options, text) => { launch = options; profile = text; });
    const result = await seatbeltNativeShell().run(["true"], workspace, policy({ allowHosts: ["example.com"], onEgress: () => {},
      egressScope: { workspace, agentId: "agent-1" } }));
    expect(result.confined).toBe(true);
    expect(result.enforcement).toMatchObject({ network: "proxy-allowlist", allowHosts: ["example.com"] });
    const port = /127\.0\.0\.1:(\d+)$/.exec(launch!.env.HTTP_PROXY!)?.[1];
    expect(port).toBeDefined();
    expect(launch!.env.NODE_USE_ENV_PROXY).toBe("1");
    expect(profile).toContain(`localhost:${port}`);
    expect(launch!.scrubValues).toHaveLength(1);
    expect(launch!.env.HTTP_PROXY).toContain(launch!.scrubValues[0]!);
  });

  test("no marker means the profile was not confirmed: not confined, no exit code, no grants", async () => {
    launches(outcome({ exitCode: 0 }), false);
    expect(await seatbeltNativeShell().run(["true"], workspace, policy({ writableRoots: [join(workspace, "build")] }))).toMatchObject({
      confined: false, exitCode: null, writableRoots: [],
      failure: { kind: "runner-failure", reason: "Seatbelt did not confirm the profile before the command; the command did not run under it and no unconfined fallback was attempted." }
    });
  });

  test("an unproven process-group exit is a failure even when confined, and a timeout is reported", async () => {
    launches(outcome({ treeExitProven: false, terminatedBy: "timeout", exitCode: null }));
    const result = await seatbeltNativeShell().run(["sleep", "9"], workspace, policy());
    expect(result).toMatchObject({ confined: true, timedOut: true, treeExitProven: false,
      failure: { kind: "runner-failure", reason: "The launcher exited but process-group cleanup could not be confirmed." } });
  });

  test("a launcher that throws after launch is a failure whose tree exit is not proven", async () => {
    synthetic.launch.mockImplementation(() => { throw new Error("spawn failed at /some/host/path"); });
    expect(await seatbeltNativeShell().run(["true"], workspace, policy())).toEqual(refusal(ADMISSION_FAILED, { treeExitProven: false }));
  });
});
