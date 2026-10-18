/** P1-05 profile/source contracts only. No sandbox-exec or kernel execution is claimed. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, type Stats } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { within } from "../../src/sandbox/bwrapBackend.js";
import { realOrLiteral } from "../../src/sandbox/seatbeltBackend.js";
import { buildSeatbeltShellProfile, MACOS_SECRET_PATHS, seatbeltNativeShell, seatbeltPrerequisites, type SeatbeltShellProfileInput } from "../../src/sandbox/seatbeltNativeShell.js";
import type { SandboxPolicy } from "../../src/sandbox/sandboxTypes.js";

type BinaryMetadata = Pick<Stats, "uid" | "mode" | "isFile">;
const synthetic = vi.hoisted(() => ({
  stat: vi.fn<(path: string) => BinaryMetadata>(),
  launch: vi.fn(() => { throw new Error("This profile unit suite must never launch a process"); })
}));
// Only the prerequisite stat is synthetic. Directory/symlink operations below use the real filesystem.
vi.mock("node:fs", async importOriginal => ({ ...(await importOriginal<typeof import("node:fs")>()), statSync: synthetic.stat }));
vi.mock("../../src/exec/runProcess.js", () => ({ runProcess: synthetic.launch }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const actualPlatform = process.platform;
const ownedRoots: string[] = [];
function platform(value: NodeJS.Platform): void { Object.defineProperty(process, "platform", { ...originalPlatform, value }); }
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-p105-native-profile-"));
  ownedRoots.push(root);
  return root;
}
function metadata(uid = 0, mode = 0o100755, isFile = true): BinaryMetadata {
  return { uid, mode, isFile: () => isFile };
}
beforeEach(() => {
  synthetic.stat.mockReset().mockReturnValue(metadata());
  synthetic.launch.mockClear();
});
afterEach(({ task }) => {
  Object.defineProperty(process, "platform", originalPlatform);
  synthetic.stat.mockReset();
  synthetic.launch.mockClear();
  for (const root of ownedRoots.splice(0)) {
    if (task.result?.state === "fail") console.error(`P1-05 native-profile fixture retained ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }
});

const input = (changes: Partial<SeatbeltShellProfileInput> = {}): SeatbeltShellProfileInput => ({
  workspace: "/synthetic/workspace",
  writableRoots: ["/synthetic/workspace/build", "/synthetic/workspace/cache"],
  privateTmp: "/synthetic/launcher/tmp",
  denied: [...MACOS_SECRET_PATHS.map(path => `/synthetic/operator/${path}`), "/synthetic/custom-deny"],
  proxyPort: null,
  ...changes
});
// The only interpolated golden value is node:path's platform spelling of one fixed signed-root path.
// Every policy rule, service, launcher and other path below is an authored literal expectation.
const signedRootLiteral = JSON.stringify(join("/synthetic/workspace", ".amc"));
const golden = `(version 1)
;; Reads stay open except the deny-list below.
(allow default)
(deny file-write*)
(allow file-write* (subpath "/synthetic/workspace/build") (subpath "/synthetic/workspace/cache") (subpath "/synthetic/launcher/tmp") (literal "/dev/null"))
(deny file-read* file-write* (subpath ${signedRootLiteral}) (subpath "/synthetic/operator/.ssh") (subpath "/synthetic/operator/.aws") (subpath "/synthetic/operator/.config/gcloud") (subpath "/synthetic/operator/.azure") (subpath "/synthetic/operator/.gnupg") (subpath "/synthetic/operator/.kube") (subpath "/synthetic/operator/.docker") (subpath "/synthetic/operator/.netrc") (subpath "/synthetic/operator/.npmrc") (subpath "/synthetic/operator/Library/Keychains") (subpath "/synthetic/operator/.amc") (subpath "/synthetic/custom-deny"))
;; A hard link in a writable root to an outside file would write through to it.
(deny file-link)
(deny network*)
;; Nothing may ask launchd, LaunchServices or another app to start a process outside this profile.
(deny mach-lookup)
(allow mach-lookup (global-name "com.apple.bsd.dirhelper" "com.apple.logd" "com.apple.system.notification_center" "com.apple.system.opendirectoryd.libinfo" "com.apple.system.opendirectoryd.membership"))
(deny lsopen)
(deny appleevent-send)
(deny job-creation)
(deny signal (target others))
(allow signal (target pgrp))
(deny process-info* (target others))
(deny process-exec (literal "/usr/bin/open") (literal "/usr/bin/osascript") (literal "/bin/launchctl") (literal "/usr/bin/at"))
`;

describe("the native Seatbelt shell profile text", () => {
  test("matches the authored no-egress profile, secret deny-list and launcher restrictions", () => {
    expect(buildSeatbeltShellProfile(input())).toBe(golden);
  });

  test("a proxy port adds only its one localhost exception after the general network denial", () => {
    expect(buildSeatbeltShellProfile(input({ proxyPort: 32199 }))).toBe(golden.replace(
      "(deny network*)\n", '(deny network*)\n(allow network-outbound (remote ip "localhost:32199"))\n'
    ));
  });

  test("an empty write grant still permits only private temporary storage and /dev/null", () => {
    const profile = buildSeatbeltShellProfile(input({ writableRoots: [] }));
    expect(profile.split("\n").filter(line => line.startsWith("(allow file-write*"))).toEqual([
      '(allow file-write* (subpath "/synthetic/launcher/tmp") (literal "/dev/null"))'
    ]);
  });

  test("uses resolved owned paths supplied by the caller rather than a symlink spelling", () => {
    const root = temporaryRoot(), physical = join(root, "physical"), alias = join(root, "alias");
    const grant = join(physical, "build"), privateTmp = join(root, "launcher", "tmp"), denied = join(root, "operator", ".ssh");
    for (const path of [grant, privateTmp, denied]) mkdirSync(path, { recursive: true });
    symlinkSync(physical, alias, actualPlatform === "win32" ? "junction" : "dir");
    const workspace = realpathSync(alias), writeRoot = realpathSync(join(alias, "build"));
    const profile = buildSeatbeltShellProfile({ workspace, writableRoots: [writeRoot], privateTmp: realpathSync(privateTmp), denied: [realOrLiteral(denied)], proxyPort: null });
    expect(workspace).toBe(realpathSync(physical));
    expect(within(workspace, writeRoot)).toBe(true);
    expect(profile).toContain(`(subpath ${JSON.stringify(writeRoot)})`);
    expect(profile).toContain(`(subpath ${JSON.stringify(join(workspace, ".amc"))})`);
    expect(profile).toContain(`(subpath ${JSON.stringify(realpathSync(denied))})`);
    expect(profile).not.toContain(JSON.stringify(alias).slice(1, -1));
  });

  test.each([
    ['quote in one component', '/synthetic/a"b', String.raw`/synthetic/a\"b`],
    ['backslash in one component', String.raw`/synthetic/a\b`, String.raw`/synthetic/a\\b`],
    ['attempted extra rule stays in the path string', '/synthetic/a") (allow network*) ("b', String.raw`/synthetic/a\") (allow network*) (\"b`]
  ] as const)("escapes %s without adding a rule", (_name, raw, escaped) => {
    const profile = buildSeatbeltShellProfile(input({ writableRoots: [raw], denied: [raw] }));
    expect(profile.split("\n").filter(line => line.startsWith("(allow file-write*"))).toEqual([
      `(allow file-write* (subpath "${escaped}") (subpath "/synthetic/launcher/tmp") (literal "/dev/null"))`
    ]);
    expect(profile.split("\n").filter(line => line.startsWith("(deny file-read*"))).toEqual([
      `(deny file-read* file-write* (subpath ${signedRootLiteral}) (subpath "${escaped}"))`
    ]);
    expect(profile.split("\n").filter(line => line.startsWith("(allow network"))).toEqual([]);
  });
});

const scope = join(tmpdir(), "synthetic-p105-workspace");
describe("the whole-segment path predicate used by native admission", () => {
  test.each([
    ['root itself', scope, true],
    ['child', join(scope, "build"), true],
    ['dot-prefixed child', join(scope, "..cache"), true],
    ['textual prefix sibling', `${scope}-outside`, false],
    ['parent', dirname(scope), false]
  ] as const)("classifies %s without treating text prefixes as directory grants", (_name, candidate, expected) => {
    expect(within(scope, candidate)).toBe(expected);
  });
});

describe("synthetic Seatbelt prerequisite metadata, not a kernel availability claim", () => {
  test.each(["linux", "win32"] as const)("refuses %s without consulting the macOS binary", value => {
    platform(value);
    expect(seatbeltPrerequisites()).toEqual({ ok: false, reason: "Seatbelt requires macOS." });
    expect(synthetic.stat).not.toHaveBeenCalled();
    expect(synthetic.launch).not.toHaveBeenCalled();
  });

  test("admits a synthetic root-owned regular executable only as a prerequisite", () => {
    platform("darwin");
    expect(seatbeltPrerequisites()).toEqual({ ok: true });
    expect(synthetic.stat).toHaveBeenCalledTimes(1);
    expect(synthetic.stat).toHaveBeenCalledWith("/usr/bin/sandbox-exec");
    expect(synthetic.launch).not.toHaveBeenCalled();
  });

  test.each([
    ['non-root owner', 501, 0o100755, true],
    ['directory', 0, 0o040755, false],
    ['group-writable executable', 0, 0o100775, true],
    ['setuid executable', 0, 0o104755, true],
    ['non-executable file', 0, 0o100644, true]
  ] as const)("refuses a synthetic %s", (_name, uid, mode, isFile) => {
    platform("darwin");
    synthetic.stat.mockReturnValue(metadata(uid, mode, isFile));
    expect(seatbeltPrerequisites()).toEqual({ ok: false,
      reason: "/usr/bin/sandbox-exec must be a root-owned, non-setuid executable without group or other write permission." });
    expect(synthetic.launch).not.toHaveBeenCalled();
  });
});

function policy(): SandboxPolicy { return { writableRoots: [], timeoutMs: 1000, network: "deny" }; }
function declined(reason: string, cancelled = false) {
  return { confined: false, backend: "seatbelt", failure: { kind: "runner-failure", reason }, exitCode: null,
    timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: true, ...(cancelled ? { cancelled: true } : {}) };
}
describe("native backend prelaunch refusals with a synthetic prerequisite and a forbidden launcher", () => {
  test.each([
    ['empty argv', [] as string[], policy(), "Invalid confined command."],
    ['NUL in argv', ["/bin/sh", "bad\0argument"], policy(), "Invalid confined command."],
    ['zero timeout', ["/bin/sh"], { ...policy(), timeoutMs: 0 }, "A positive finite shell deadline is required."],
    ['non-finite timeout', ["/bin/sh"], { ...policy(), timeoutMs: Number.NaN }, "A positive finite shell deadline is required."]
  ] as const)("refuses %s before filesystem setup or launch", async (_name, command, inputPolicy, reason) => {
    platform("darwin");
    const absentWorkspace = join(temporaryRoot(), "not-created");
    expect(await seatbeltNativeShell().run(command, absentWorkspace, inputPolicy)).toEqual(declined(reason));
    expect(synthetic.launch).not.toHaveBeenCalled();
  });

  test("an egress policy cannot launch without its audit recorder", async () => {
    platform("darwin");
    expect(await seatbeltNativeShell().run(["/bin/sh"], join(temporaryRoot(), "not-created"), {
      ...policy(), allowHosts: ["example.com"]
    })).toEqual(declined("A shell egress allowlist requires an egress audit recorder."));
    expect(synthetic.launch).not.toHaveBeenCalled();
  });

  test("an already-aborted call refuses before filesystem setup or launch", async () => {
    platform("darwin");
    const controller = new AbortController();
    controller.abort();
    expect(await seatbeltNativeShell().run(["/bin/sh"], join(temporaryRoot(), "not-created"), {
      ...policy(), signal: controller.signal
    })).toEqual(declined("The shell was cancelled before launch.", true));
    expect(synthetic.launch).not.toHaveBeenCalled();
  });
});
