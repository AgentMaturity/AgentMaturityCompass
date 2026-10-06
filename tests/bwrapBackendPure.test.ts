// AMC-1513: the two platform-independent decisions inside the Linux shell
// backend. These run on any host; they do not launch Bubblewrap or load the
// filter into a kernel, so they are not Linux confinement qualification.
import { describe, expect, test } from "vitest";
import { bwrapCommandExit, linuxSocketDenyFilter } from "../src/sandbox/bwrapBackend.js";

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
