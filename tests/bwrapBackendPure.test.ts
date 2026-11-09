// AMC-1513: the two platform-independent decisions inside the Linux shell
// backend. These run on any host; they do not launch Bubblewrap or load the
// filter into a kernel, so they are not Linux confinement qualification.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bwrapCommandExit, bwrapReadMasks, linuxSocketDenyFilter, unconsumedFds } from "../src/sandbox/bwrapBackend.js";

const KILL = 0x80000000, EPERM = 0x00050001, ALLOW = 0x7fff0000;
const AUDIT_X64 = 0xc000003e, AUDIT_ARM64 = 0xc00000b7, AUDIT_I386 = 0x40000003;

/** Minimal classic-BPF evaluator for the opcodes the filter emits, over seccomp_data {nr, arch}. */
function evaluate(program: Buffer, arch: number, nr: number): number {
  const word = (offset: number) => offset === 0 ? nr >>> 0 : offset === 4 ? arch >>> 0 : Number.NaN;
  let accumulator = 0;
  for (let pc = 0, steps = 0; pc * 8 < program.length && steps < 256; steps++) {
    const code = program.readUInt16LE(pc * 8), jt = program.readUInt8(pc * 8 + 2), jf = program.readUInt8(pc * 8 + 3);
    const k = program.readUInt32LE(pc * 8 + 4);
    if (code === 0x20) { accumulator = word(k); pc += 1; }
    else if (code === 0x15) pc += 1 + (accumulator === k ? jt : jf);
    else if (code === 0x35) pc += 1 + (accumulator >= k ? jt : jf);
    else if (code === 0x06) return k;
    else throw new Error(`unexpected opcode ${code}`);
  }
  throw new Error("filter fell off the end without a verdict");
}

describe("linuxSocketDenyFilter", () => {
  test("x64 kills foreign ABIs and refuses socket, socketpair, connect, x32 and io_uring entry points", () => {
    const filter = linuxSocketDenyFilter("x64");
    expect(evaluate(filter, AUDIT_I386, 41)).toBe(KILL);
    expect(evaluate(filter, AUDIT_ARM64, 0)).toBe(KILL);
    for (const nr of [41, 53, 42, 425, 426, 427]) expect(evaluate(filter, AUDIT_X64, nr)).toBe(EPERM);
    // x32 shares the x86-64 audit architecture with bit 30 set on the syscall number.
    expect(evaluate(filter, AUDIT_X64, 0x40000000 + 41)).toBe(EPERM);
    expect(evaluate(filter, AUDIT_X64, 0x40000000)).toBe(EPERM);
    for (const nr of [0, 1, 59, 60, 231]) expect(evaluate(filter, AUDIT_X64, nr)).toBe(ALLOW);
  });

  test("arm64 uses its own socket numbers and kills the x64 ABI", () => {
    const filter = linuxSocketDenyFilter("arm64");
    expect(evaluate(filter, AUDIT_X64, 198)).toBe(KILL);
    for (const nr of [198, 199, 203, 425, 426, 427]) expect(evaluate(filter, AUDIT_ARM64, nr)).toBe(EPERM);
    // 41/42/53 are unrelated syscalls on arm64; no x32 rule exists there.
    for (const nr of [41, 42, 53, 63, 64, 93]) expect(evaluate(filter, AUDIT_ARM64, nr)).toBe(ALLOW);
  });
});

describe("bwrapCommandExit", () => {
  const status = (...rows: unknown[]) => rows.map(row => typeof row === "string" ? row : JSON.stringify(row)).join("\n");

  test("a child pid followed by one exit code is the only completed receipt", () => {
    expect(bwrapCommandExit(status({ "child-pid": 12 }, { "cgroup-namespace": 1 }, { "exit-code": 3 }, ""))).toBe(3);
    expect(bwrapCommandExit(status({ "child-pid": 12, "exit-code": 0 }))).toBe(0);
    expect(bwrapCommandExit(status({ "child-pid": 12 }))).toBeNull();
    expect(bwrapCommandExit("")).toBeNull();
  });

  test("an exit code without a preceding child pid is refused", () => {
    expect(bwrapCommandExit(status({ "exit-code": 0 }))).toBeNull();
    expect(bwrapCommandExit(status({ "exit-code": 0 }, { "child-pid": 12 }))).toBeNull();
  });

  test("duplicate child or exit rows are refused", () => {
    expect(bwrapCommandExit(status({ "child-pid": 12 }, { "child-pid": 13 }, { "exit-code": 0 }))).toBeNull();
    expect(bwrapCommandExit(status({ "child-pid": 12 }, { "exit-code": 0 }, { "exit-code": 1 }))).toBeNull();
  });

  test.each([0, -1, 1.5, "12", null, 2 ** 53])("child pid %s is refused", pid => {
    expect(bwrapCommandExit(status({ "child-pid": pid }, { "exit-code": 0 }))).toBeNull();
  });

  test.each([-1, 256, 1.5, "0", null])("exit code %s is refused", code => {
    expect(bwrapCommandExit(status({ "child-pid": 12 }, { "exit-code": code }))).toBeNull();
  });

  test.each(["[1]", "7", "null", "\"text\"", "{not json"])("row %s is refused", row => {
    expect(bwrapCommandExit(status({ "child-pid": 12 }, row, { "exit-code": 0 }))).toBeNull();
  });
});

describe("unconsumedFds: the confined command inherits no launcher descriptor", () => {
  const head = ["/usr/bin/bwrap", "--json-status-fd", "3", "--seccomp", "4"];
  test("a plan whose every fd is taken by a consuming option leaks nothing", () => {
    expect(unconsumedFds([...head, "--ro-bind-fd", "5", "/usr", "--bind-fd", "6", "/ws/a", "--", "/bin/sh"], 4)).toEqual([]);
  });
  test("a /proc/self/fd path bind leaves its fd open in the child", () => {
    expect(unconsumedFds([...head, "--ro-bind", "/proc/self/fd/5", "/ws", "--", "/bin/sh"], 3)).toEqual([5]);
  });
  test("an fd number after -- is the command's argument, not a consumed fd", () => {
    expect(unconsumedFds([...head, "--", "/bin/echo", "--ro-bind-fd", "5"], 3)).toEqual([5]);
  });
});

describe("bwrapReadMasks: what the Linux shell must not read inside its workspace", () => {
  test("masks the signed readDeny and AMC's own secret paths that lie inside the workspace; host paths outside it stay unmounted", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-bwrap-masks-")));
    try {
      const workspace = join(root, "workspace"), outside = join(root, "outside");
      const amcHome = join(workspace, "amc-home"), passphrase = join(workspace, "secrets", "vault-passphrase"), denied = join(workspace, "denied.txt");
      for (const dir of [amcHome, join(workspace, "secrets"), outside]) mkdirSync(dir, { recursive: true });
      writeFileSync(passphrase, "synthetic"); writeFileSync(denied, "synthetic"); writeFileSync(join(outside, "creds.yaml"), "synthetic");
      // An AMC home and a passphrase file kept in the project (a workspace in the home directory has the same shape).
      const env = { AMC_HOME: amcHome, AMC_VAULT_PASSPHRASE_FILE: passphrase, AMC_CREDENTIALS_FILE: join(outside, "creds.yaml") };
      const masks = bwrapReadMasks(workspace, [denied], env);
      expect(masks.ok).toBe(true);
      const plan = masks.ok ? masks.args.join(" ") : "";
      expect(plan).toContain(`--ro-bind /dev/null ${denied}`);
      expect(plan).toContain(`--tmpfs ${amcHome} --remount-ro ${amcHome}`);
      expect(plan).toContain(`--ro-bind /dev/null ${passphrase}`);
      expect(plan).not.toContain(outside);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("a path under a masked directory is not masked again (Bubblewrap cannot make a mount point in the read-only tmpfs)", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-bwrap-nested-")));
    try {
      const workspace = join(root, "workspace"), amcHome = join(workspace, "amc-home"), credentials = join(amcHome, ".credentials.yaml");
      mkdirSync(join(amcHome, "state"), { recursive: true });
      writeFileSync(credentials, "synthetic");
      // AMC_HOME and the credentials file under it are both AMC secret paths; so is a signed readDeny of a directory inside.
      const masks = bwrapReadMasks(workspace, [join(amcHome, "state")], { AMC_HOME: amcHome });
      expect(masks).toEqual({ ok: true, args: ["--tmpfs", amcHome, "--remount-ro", amcHome] });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("a path under the runtime roots is refused rather than masked, whether signed or an AMC secret", () => {
    expect(bwrapReadMasks("/synthetic/workspace", ["/usr/share/synthetic-deny"], {})).toMatchObject({ ok: false });
    expect(bwrapReadMasks("/synthetic/workspace", [], { AMC_VAULT_PASSPHRASE_FILE: "/usr/local/etc/synthetic-passphrase" })).toMatchObject({ ok: false });
  });
});
