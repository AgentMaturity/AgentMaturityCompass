/**
 * Nothing became less confined than at commit 5551af1dc. The Seatbelt profiles and the Bubblewrap socket filter
 * generated then are frozen in tests/fixtures/sandbox/confinement-baseline-5551af1dc.json, and the Bubblewrap argv
 * of that commit is reproduced below as it was built inline in bwrapBackend.run(). For every existing caller the new
 * output must keep every old deny rule and add no allow rule, except the one per-call proxy port when the caller
 * has a signed egress allow-list (which every backend refused or did not have before). These are generated
 * arguments only: nothing here launches Seatbelt or Bubblewrap.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { NAMESPACE_FLAGS, bwrapArgv, linuxSocketDenyFilter, type BwrapBind } from "../../src/sandbox/bwrapBackend.js";
import { EGRESS_MOUNT, RELAY_NODE, linuxSocketEgressFilter, relayCommand } from "../../src/sandbox/bwrapEgress.js";
import { buildSeatbeltProfile } from "../../src/sandbox/seatbeltBackend.js";
import { buildSeatbeltShellProfile } from "../../src/sandbox/seatbeltNativeShell.js";

const baseline = JSON.parse(readFileSync(new URL("../fixtures/sandbox/confinement-baseline-5551af1dc.json", import.meta.url), "utf8")) as
  Record<"generic" | "genericEmpty" | "native" | "nativeProxy", string> & { bwrapDenyFilterHex: Record<"x64" | "arm64", string> };

const rules = (profile: string): string[] => profile.split("\n").filter(line => line.startsWith("("));
const PROXY_ALLOW = (port: number) => `(allow network-outbound (remote ip "localhost:${port}"))`;
/** Narrows, not widens: it follows `(deny mach-lookup)`, under `(allow default)` every lookup was allowed before. */
const MACH_ALLOW = /^\(allow mach-lookup \(global-name( "[a-z._]+")+\)\)$/;

function expectNoLooser(before: string, after: string, proxyPort: number | null): void {
  const old = rules(before), now = rules(after);
  for (const rule of old.filter(rule => rule.startsWith("(deny"))) expect(now, `kept: ${rule}`).toContain(rule);
  // Every allow is one that was there before, or a narrowing exception, or the one proxy port.
  for (const rule of now.filter(rule => rule.startsWith("(allow") && !old.includes(rule))) {
    const narrowing = MACH_ALLOW.test(rule) && now.indexOf("(deny mach-lookup)") >= 0 && now.indexOf("(deny mach-lookup)") < now.indexOf(rule);
    expect(narrowing || (proxyPort !== null && rule === PROXY_ALLOW(proxyPort)), `new allow rule: ${rule}`).toBe(true);
  }
  // The write grants are exactly the old ones, in the old order.
  const writes = (list: string[]) => list.filter(rule => rule.includes("file-write"));
  expect(writes(now).filter(rule => rule.startsWith("(allow"))).toEqual(writes(old).filter(rule => rule.startsWith("(allow")));
  expect(now).toContain("(deny network*)");
  expect(now.indexOf("(deny network*)")).toBeLessThan(proxyPort === null ? Infinity : now.indexOf(PROXY_ALLOW(proxyPort)));
}

describe("Seatbelt profiles are never looser than at 5551af1dc", () => {
  test("generic backend (SandboxRunner default: graders, readiness, tests): writes unchanged, network now denied", () => {
    expectNoLooser(baseline.generic, buildSeatbeltProfile(["/nonexistent/amc-ws", "/nonexistent/amc-ws/out"]), null);
    expectNoLooser(baseline.genericEmpty, buildSeatbeltProfile([]), null);
    for (const helper of ["(deny lsopen)", "(deny appleevent-send)", "(deny job-creation)", "(deny mach-lookup)"]) {
      expect(rules(buildSeatbeltProfile([]))).toContain(helper);
    }
  });

  test("generic backend with an allow-list adds only its proxy port", () => {
    expectNoLooser(baseline.generic, buildSeatbeltProfile(["/nonexistent/amc-ws", "/nonexistent/amc-ws/out"], 49152), 49152);
  });

  test("native shell profile, with and without a proxy, is byte for byte the old one", () => {
    const input = { workspace: "/nonexistent/amc-ws", writableRoots: ["/nonexistent/amc-ws/build"], privateTmp: "/nonexistent/launch/tmp" };
    const native = buildSeatbeltShellProfile({ ...input, denied: ["/nonexistent/home/.ssh", "/nonexistent/amc-ws/build/secret"], proxyPort: null });
    const proxied = buildSeatbeltShellProfile({ ...input, denied: ["/nonexistent/home/.ssh"], proxyPort: 49152 });
    expect(native).toBe(baseline.native);
    expect(proxied).toBe(baseline.nativeProxy);
    expectNoLooser(baseline.native, native, null);
  });

  test("the comparison itself catches a looser profile", () => {
    const widened = baseline.generic.replace("(deny file-write*)", "(deny file-write-data)");
    expect(() => expectNoLooser(baseline.generic, widened.replace("(version 1)", "(version 1)\n(deny network*)"), null)).toThrow();
    expect(() => expectNoLooser(baseline.native, baseline.native.replace("(deny network*)", "(deny network*)\n(allow network*)"), null)).toThrow();
  });
});

/** bwrapBackend.run() at 5551af1dc, as it built argv inline (binds fd 5 onward, after status 3 and filter 4). */
function argvAt5551af1dc(binds: readonly BwrapBind[], masks: readonly string[], workspace: string, command: readonly string[]): string[] {
  const args: string[] = ["/usr/bin/bwrap", ...NAMESPACE_FLAGS, "--json-status-fd", "3", "--seccomp", "4",
    "--dev", "/dev", "--tmpfs", "/tmp", "--chmod", "1777", "/tmp"];
  binds.forEach((bind, index) => args.push(bind.writable ? "--bind-fd" : "--ro-bind-fd", String(index + 5), bind.destination));
  args.push(...masks);
  const amc = `${workspace}/.amc`;
  args.push("--tmpfs", amc, "--chmod", "000", amc, "--remount-ro", amc,
    "--tmpfs", "/proc", "--remount-ro", "/proc", "--remount-ro", "/", "--chdir", workspace, "--", ...command);
  return args;
}

const runtime: BwrapBind[] = ["/usr", "/bin", "/lib", "/lib64", "/etc/ld.so.cache", "/etc/passwd"].map(destination => ({ destination, writable: false }));
/** Every existing bwrap caller of bwrapBackend.run(): the native shell (with and without write grants and masks) and executable extensions. */
const callers: Record<string, { binds: BwrapBind[]; masks: string[]; workspace: string; command: string[] }> = {
  "native shell": { workspace: "/w", binds: [...runtime, { destination: "/w", writable: false }, { destination: "/w/build", writable: true }, { destination: "/w/build/out", writable: true }],
    masks: ["--tmpfs", "/w/.secrets", "--remount-ro", "/w/.secrets", "--ro-bind", "/dev/null", "/w/key.pem"], command: ["/bin/sh", "-c", "make"] },
  "executable extension": { workspace: "/tmp/amc-executable-run-x", binds: [...runtime, { destination: "/tmp/amc-executable-run-x", writable: false }],
    masks: [], command: ["/tmp/amc-executable-run-x/node", "--max-old-space-size=64", "/tmp/amc-executable-run-x/bootstrap.mjs"] }
};

describe("Bubblewrap arguments are never looser than at 5551af1dc", () => {
  for (const [name, layout] of Object.entries(callers)) {
    test(`${name} without an allow-list: identical arguments`, () => {
      expect(bwrapArgv(layout)).toEqual(argvAt5551af1dc(layout.binds, layout.masks, layout.workspace, layout.command));
    });
  }

  test("native shell with an allow-list: same namespaces (network unshared), two extra read-only mounts, the command under the relay", () => {
    const { binds, masks, workspace, command } = callers["native shell"]!;
    const before = argvAt5551af1dc(binds, masks, workspace, command);
    const after = bwrapArgv({ binds: [...binds, { destination: EGRESS_MOUNT, writable: false }, { destination: RELAY_NODE, writable: false }], masks, workspace, command: relayCommand(command) });
    expect(after.slice(0, 1 + NAMESPACE_FLAGS.length)).toEqual(before.slice(0, 1 + NAMESPACE_FLAGS.length));
    expect(after).toContain("--unshare-net");
    const head = (argv: string[]) => argv.slice(0, argv.indexOf("--"));
    const added = head(after).filter((_, index, all) => index >= head(before).length || all[index] !== head(before)[index]);
    // Only the egress folder and the Node binary over it were inserted, read-only; the rest is the old sequence.
    const at = head(after).indexOf(EGRESS_MOUNT);
    expect(head(after).slice(at - 2, at + 4)).toEqual(["--ro-bind-fd", String(binds.length + 5), EGRESS_MOUNT, "--ro-bind-fd", String(binds.length + 6), RELAY_NODE]);
    expect([...head(after).slice(0, at - 2), ...head(after).slice(at + 4)]).toEqual(head(before));
    expect(added.length).toBeGreaterThan(0);
    expect(after.slice(after.indexOf("--") + 1)).toEqual([...relayCommand([]), ...command]);
    expect(after.filter(arg => arg === "--bind-fd")).toHaveLength(before.filter(arg => arg === "--bind-fd").length);
  });
});

/** Classic-BPF evaluator over seccomp_data {nr, arch, args[0] low word}. */
function evaluate(program: Buffer, arch: number, nr: number, arg0 = 0): number {
  const word = (offset: number) => offset === 0 ? nr >>> 0 : offset === 4 ? arch >>> 0 : offset === 16 ? arg0 >>> 0 : Number.NaN;
  let accumulator = 0;
  for (let pc = 0, steps = 0; pc * 8 < program.length && steps < 256; steps++) {
    const code = program.readUInt16LE(pc * 8), jt = program.readUInt8(pc * 8 + 2), jf = program.readUInt8(pc * 8 + 3), k = program.readUInt32LE(pc * 8 + 4);
    if (code === 0x20) { accumulator = word(k); pc += 1; }
    else if (code === 0x15) pc += 1 + (accumulator === k ? jt : jf);
    else if (code === 0x35) pc += 1 + (accumulator >= k ? jt : jf);
    else if (code === 0x06) return k;
    else throw new Error(`unexpected opcode ${code}`);
  }
  throw new Error("filter fell off the end without a verdict");
}

describe("the Linux socket filter is never looser than at 5551af1dc", () => {
  const ALLOW = 0x7fff0000;
  const ARCH = { x64: 0xc000003e, arm64: 0xc00000b7 } as const;
  const SOCKET = { x64: { socket: 41, socketpair: 53, connect: 42 }, arm64: { socket: 198, socketpair: 199, connect: 203 } } as const;

  for (const arch of ["x64", "arm64"] as const) {
    test(`${arch}: the deny-all filter is byte for byte the old one`, () => {
      expect(linuxSocketDenyFilter(arch).toString("hex")).toBe(baseline.bwrapDenyFilterHex[arch]);
    });

    test(`${arch}: the relay filter allows only what the old one denied for Unix and IP sockets and connect`, () => {
      const old = Buffer.from(baseline.bwrapDenyFilterHex[arch], "hex"), relay = linuxSocketEgressFilter(arch);
      const calls = SOCKET[arch];
      const widened: string[] = [];
      for (const archValue of [ARCH.x64, ARCH.arm64, 0x40000003]) {
        for (const nr of [...Array.from({ length: 512 }, (_, i) => i), 0x40000000, 0x40000000 + 41]) {
          for (const family of [0, 1, 2, 3, 4, 5, 10, 16, 17, 38, 44, 0x100000001 >>> 0]) {
            const before = evaluate(old, archValue, nr, family), after = evaluate(relay, archValue, nr, family);
            if (before === after) continue;
            expect(after, `arch ${archValue} nr ${nr} family ${family} only ever gets looser to ALLOW`).toBe(ALLOW);
            widened.push(`${nr}/${family}`);
          }
        }
      }
      const expected = new Set<string>();
      for (const family of [0, 1, 2, 3, 4, 5, 10, 16, 17, 38, 44, 0x100000001 >>> 0]) {
        if ([1, 2, 10].includes(family)) expected.add(`${calls.socket}/${family}`);
        if (family === 1) expected.add(`${calls.socketpair}/${family}`);
        expected.add(`${calls.connect}/${family}`);
      }
      expect(new Set(widened)).toEqual(expected);
      for (const nr of [425, 426, 427]) expect(evaluate(relay, ARCH[arch], nr)).not.toBe(ALLOW);
    });
  }
});
