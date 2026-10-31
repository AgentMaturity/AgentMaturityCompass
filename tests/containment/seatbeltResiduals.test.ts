import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { seatbeltNativeShell } from "../../src/sandbox/seatbeltNativeShell.js";
import type { SandboxOutcome } from "../../src/sandbox/sandboxTypes.js";
import { nativeContainmentFixture } from "../helpers/nativeContainment.js";

// The five macOS cases P1-05 left unverified, run against the real kernel. Under
// AMC_REQUIRE_REAL_SANDBOX=1 on macOS none of them may skip.
const backend = seatbeltNativeShell();
const required = process.env.AMC_REQUIRE_REAL_SANDBOX === "1";
const macTest = process.platform === "darwin" && (backend.available().ok || required) ? test : test.skip;
const PYTHON = "/usr/bin/python3";
const SECURITY = "/usr/bin/security";
const emit = (expression: string): string => `console.log("AMC_P105:"+JSON.stringify(${expression}));`;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-seatbelt-residual-")));
  roots.push(root);
  return root;
}
async function confined(argv: readonly string[], root = workspace()): Promise<SandboxOutcome> {
  const outcome = await backend.run(argv, root, { writableRoots: [root], timeoutMs: 20_000 });
  expect(outcome.confined, JSON.stringify(outcome)).toBe(true);
  expect(outcome.failure).toBeNull();
  return outcome;
}
function python(code: string): string[] {
  // The probes need libc and IOKit calls node has no API for; the system interpreter is part of the macOS toolchain.
  expect(spawnSync(PYTHON, ["-c", "pass"]).status, `${PYTHON} is required for the macOS residual cases`).toBe(0);
  return [PYTHON, "-c", code];
}
const lines = (text: string): Record<string, string> => Object.fromEntries(text.trim().split("\n").map(line => line.split("=", 2) as [string, string]));

describe("macOS Seatbelt residuals (P1-05)", () => {
  macTest("reads outside the deny-list stay open, by design, and the receipt says so; the deny-list still holds", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const open = join(f.outside, "readable.txt"), denied = join(f.home, ".ssh", "id_canary");
      const canary = `owned-${randomUUID()}`;
      writeFileSync(open, canary); writeFileSync(denied, canary);
      const call = await f.run(`const fs=require("node:fs");const read=p=>{try{return fs.readFileSync(p,"utf8")}catch(e){return "denied:"+e.code}};${emit(`{attempted:true,open:read(${JSON.stringify(open)}),denied:read(${JSON.stringify(denied)})}`)}`);
      expect(call.receipt.confined).toBe(true);
      expect(call.data.open).toBe(canary);
      expect(call.data.denied).toBe("denied:EPERM");
      expect(call.receipt.enforcement).toMatchObject({ reads: "open-except-denylist" });
      expect(call.receipt.enforcement!.limitations).toContain("Reads outside the deny-list stay open: the command can read any other file your user can.");
      passed = true;
    } finally { await f.finish(passed); }
  });

  macTest("named POSIX shared memory cannot be created; System V segments can be created empty but never attached", async () => {
    const name = `/amc-${randomUUID().slice(0, 8)}`;
    const key = 0x414d0000 + Math.floor(Math.random() * 0xffff);
    const outcome = await confined(python(`
import ctypes,os
libc=ctypes.CDLL(None,use_errno=True); libc.shmat.restype=ctypes.c_void_p
fd=libc.shm_open(${JSON.stringify(name)}.encode(),os.O_CREAT|os.O_RDWR,0o600); print("posix=%d:%d"%(fd,ctypes.get_errno()))
if fd>=0: libc.shm_unlink(${JSON.stringify(name)}.encode())
def attach(i):
  ctypes.set_errno(0); at=libc.shmat(i,None,0) if i>=0 else None
  return "denied:%d"%ctypes.get_errno() if at in (None,ctypes.c_void_p(-1).value) else "mapped"
k=libc.shmget(${key},4096,0o1600); print("keyedId=%d"%k); print("keyedAttach=%s"%attach(k))
p=libc.shmget(0,4096,0o1600); print("privateId=%d"%p); print("privateAttach=%s"%attach(p))
ctypes.set_errno(0); print("remove=%d:%d"%(libc.shmctl(k,0,None),ctypes.get_errno()))
`));
    const facts = lines(outcome.stdout);
    // The documented residual: the kernel lets segment creation through, empty and unattachable; remove them from outside (the shell may not).
    for (const id of [facts.keyedId, facts.privateId]) if (Number(id) >= 0) spawnSync("/usr/bin/ipcrm", ["-m", String(id)]);
    expect({ posix: facts.posix, keyedAttach: facts.keyedAttach, privateAttach: facts.privateAttach, remove: facts.remove })
      .toEqual({ posix: "-1:1", keyedAttach: "denied:1", privateAttach: "denied:1", remove: "-1:1" });
    // From outside: the named object does not exist.
    const host = spawnSync(PYTHON, ["-c", `import ctypes,os\nlibc=ctypes.CDLL(None,use_errno=True)\nfd=libc.shm_open(${JSON.stringify(name)}.encode(),os.O_RDONLY,0)\nprint(fd,ctypes.get_errno())\nif fd>=0: libc.shm_unlink(${JSON.stringify(name)}.encode())`], { encoding: "utf8" });
    expect(host.stdout.trim()).toBe("-1 2");
  });

  macTest("IOKit user clients cannot be opened; registry reads still work", async () => {
    const outcome = await confined(python(`
import ctypes
iokit=ctypes.CDLL("/System/Library/Frameworks/IOKit.framework/IOKit"); libc=ctypes.CDLL(None)
iokit.IOServiceMatching.restype=ctypes.c_void_p; iokit.IOServiceMatching.argtypes=[ctypes.c_char_p]
iokit.IOServiceGetMatchingService.restype=ctypes.c_uint; iokit.IOServiceGetMatchingService.argtypes=[ctypes.c_uint,ctypes.c_void_p]
service=iokit.IOServiceGetMatchingService(0,iokit.IOServiceMatching(b"IOPMrootDomain"))
connection=ctypes.c_uint(0)
print("found=%s"%(service!=0)); print("open=%s"%hex(iokit.IOServiceOpen(service,ctypes.c_uint.in_dll(libc,"mach_task_self_"),0,ctypes.byref(connection))&0xffffffff))
`));
    // kIOReturnNotPermitted: the power-management root domain (sleep, assertions) is out of reach.
    expect(lines(outcome.stdout)).toEqual({ found: "True", open: "0xe00002e2" });
    const registry = await confined(["/bin/sh", "-c", "/usr/sbin/ioreg -c IOPlatformExpertDevice -d 2 | grep -c IOPlatformUUID"]);
    expect(registry.stdout.trim()).toBe("1");
  });

  macTest("the keychain and trustd are unreachable: lookups and Security.framework trust evaluation fail closed", async () => {
    const root = workspace();
    const certificate = join(root, "apple-root.pem");
    const exported = spawnSync(SECURITY, ["find-certificate", "-c", "Apple Root CA", "-p", "/System/Library/Keychains/SystemRootCertificates.keychain"], { encoding: "utf8" });
    expect(exported.status).toBe(0);
    writeFileSync(certificate, exported.stdout);
    expect(spawnSync(SECURITY, ["verify-cert", "-c", certificate]).status).toBe(0);
    const trust = await confined([SECURITY, "verify-cert", "-c", certificate], root);
    expect(trust.exitCode).not.toBe(0);
    const keychain = await confined([SECURITY, "list-keychains"], root);
    expect(keychain.stdout + keychain.stderr).toMatch(/SecKeychainCopySearchList: One or more parameters passed to a function were not valid/);
  });

  macTest("node fetch reaches an allowlisted origin through the egress proxy", async () => {
    const f = nativeContainmentFixture({ allowHosts: ["127.0.0.1"] }); let passed = false;
    try {
      const origin = await f.origin(), before = origin.requests.length;
      const call = await f.run(`fetch(${JSON.stringify(`${origin.url}/fetched`)},{signal:AbortSignal.timeout(4000)}).then(async r=>{${emit("{attempted:true,status:r.status,body:await r.text()}")}},e=>{${emit("{attempted:true,error:String(e.cause?.code||e.message)}")}});`);
      expect(call.receipt.confined).toBe(true);
      expect(call.data).toMatchObject({ status: 200, body: "owned-p105-origin" });
      expect(origin.requests.slice(before)).toEqual([{ method: "GET", url: "/fetched" }]);
      expect(f.egress.map(row => row.row)).toEqual([{ host: "127.0.0.1", port: origin.port, decision: "allow", reason: "127.0.0.1 is listed as an IP literal" }]);
      passed = true;
    } finally { await f.finish(passed); }
  });
});
