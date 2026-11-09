import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { bwrapBackend, unconsumedFds } from "../../src/sandbox/bwrapBackend.js";
import { prepareNativePtyLaunch } from "../../src/terminal/nativePtySandbox.js";
import { seatbeltNativeShell } from "../../src/sandbox/seatbeltNativeShell.js";
import { denySessionSecretPaths } from "../../src/sandbox/shellSecretPaths.js";
import { nativeContainmentFixture, sandboxNode, type NativeCall } from "../helpers/nativeContainment.js";

// Binary prerequisites are not confinement evidence. Every actual call must produce a real applied receipt.
const backend = process.platform === "darwin" ? seatbeltNativeShell() : bwrapBackend();
const supported = process.platform === "darwin" || process.platform === "linux";
const prerequisite = backend.available();
const required = process.env.AMC_REQUIRE_REAL_SANDBOX === "1";
const node = sandboxNode();
const realTest = supported && prerequisite.ok && node !== null || required ? test : test.skip;
// Linux refuses a signed egress allowlist (ADR-008), so the proxy cases run where it is supported.
const proxyTest = process.platform === "darwin" ? realTest : test.skip;
// A Linux host whose kernel refuses Bubblewrap's namespaces must say so and run nothing.
const refusalTest = process.platform === "linux" && !prerequisite.ok && !required ? test : test.skip;
if (process.platform === "linux" && !prerequisite.ok) console.warn(`escape suite: Bubblewrap cannot confine here (${prerequisite.reason}); asserting the honest refusal instead.`);
if (process.platform === "linux" && prerequisite.ok && node === null) console.warn("escape suite: skipped, no Node under /usr or /bin is visible inside the Linux shell.");
const emit = (expression: string): string => `console.log("AMC_P105:"+JSON.stringify(${expression}));`;

function applied(call: NativeCall, network: "denied" | "proxy-allowlist" = "denied"): void {
  expect(call.receipt.confined, JSON.stringify(call.receipt)).toBe(true);
  expect(call.receipt.failure).toBeNull();
  expect(call.receipt.treeExitProven).toBe(true);
  expect(call.receipt.timedOut).toBe(false);
  expect(call.receipt.droppedBytes ?? 0).toBe(0);
  expect(call.receipt.cancelled ?? false).toBe(false);
  expect(call.receipt.enforcement).toMatchObject({
    boundary: process.platform === "darwin" ? "macos-seatbelt" : "linux-bwrap",
    hostWrites: "declared-roots-only", network, launcherStatus: "command-exited",
    sourcePolicySha256: call.execution.authorization!.record.policy.toolsConfigDigest
  });
  expect(call.outcome.denied).toBeNull();
  expect(call.outcome.ok).toBe(true);
  expect(call.receipt.exitCode).toBe(0);
  expect(call.data.attempted).toBe(true);
}

const proxyProgram = (url: string): string => `
const http=require("node:http");
const proxy=new URL(process.env.HTTP_PROXY||"");
const auth="Basic "+Buffer.from(decodeURIComponent(proxy.username)+":"+decodeURIComponent(proxy.password)).toString("base64");
const request=http.request({hostname:proxy.hostname,port:proxy.port,path:${JSON.stringify(url)},method:"GET",agent:false,
headers:{"proxy-authorization":auth,connection:"close"}},response=>{
 const chunks=[];response.on("data",chunk=>chunks.push(chunk));
 response.on("end",()=>{${emit('{attempted:true,status:response.statusCode,body:Buffer.concat(chunks).toString()}')}});
});
request.setTimeout(2000,()=>request.destroy(new Error("owned proxy request timed out")));
request.on("error",error=>{${emit('{attempted:true,errorCode:error.code||null,error:error.message}')}});request.end();`;

// Linux's socket filter also denies socketpair, which Node's piped stdio needs, so children there are short sleeps.
const liveChild = process.platform === "linux" ? 'spawn("/bin/sleep",["2"],{stdio:"ignore"})' : 'spawn("/bin/cat",[],{stdio:["pipe","ignore","ignore"]})';

function refusedBeforeLaunch(call: NativeCall, reason: string): void {
  expect(call.receipt).toMatchObject({ confined: false, exitCode: null, failure: { kind: "unavailable" } });
  expect(call.receipt.failure!.reason).toContain(reason);
  expect(call.receipt.enforcement).toBeUndefined();
  expect(call.outcome.ok).toBe(false);
}

describe("real native shell escape attempts with owned canaries", () => {
  refusalTest("a host that refuses Bubblewrap's namespaces reports it and runs nothing", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const target = join(f.allowed, "refused.txt");
      const call = await f.run(`require("node:fs").writeFileSync(${JSON.stringify(target)},"ran");`);
      refusedBeforeLaunch(call, prerequisite.ok ? "" : prerequisite.reason);
      expect(existsSync(target)).toBe(false); passed = true;
    } finally { await f.finish(passed); }
  });

  (process.platform === "linux" ? test : test.skip)("a signed egress allowlist is refused on Linux before anything launches", async () => {
    const f = nativeContainmentFixture({ allowHosts: ["127.0.0.1"] }); let passed = false;
    try {
      const origin = await f.origin(), requests = origin.requests.length, connections = origin.connectionCount();
      const call = await f.run(proxyProgram(`${origin.url}/allowed`));
      refusedBeforeLaunch(call, prerequisite.ok ? "A signed shell egress allowlist is not available on Linux yet" : prerequisite.reason);
      expect(origin.requests).toHaveLength(requests); expect(origin.connectionCount()).toBe(connections); expect(f.egress).toEqual([]); passed = true;
    } finally { await f.finish(passed); }
  });

  realTest("positive control writes the signed root and preserves the real policy/permit receipt", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const target = join(f.allowed, "positive.txt");
      const call = await f.run(`require("node:fs").writeFileSync(${JSON.stringify(target)},"owned-positive");${emit('{attempted:true,written:true,home:process.env.HOME}')} `);
      applied(call); expect(readFileSync(target, "utf8")).toBe("owned-positive");
      expect(call.receipt.writableRoots).toEqual([f.allowed]);
      expect(call.data.home).not.toBe(f.home); // Native backends intentionally give the command a private HOME.
      expect(call.execution.authorization!.record.action.actionClass).toBe("WRITE_HIGH");
      passed = true;
    } finally { await f.finish(passed); }
  });

  realTest("an absolute write to the owned operator HOME is denied after native launch", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const target = join(f.home, `amc-escape-${randomUUID()}`);
      f.facts.push({ target, hostFileExistsBefore: existsSync(target) });
      const call = await f.run(`let denied=false,code=null;try{require("node:fs").writeFileSync(${JSON.stringify(target)},"owned-escape");}catch(error){denied=true;code=error.code;}${emit('{attempted:true,denied,code}')} `);
      f.facts.push({ target, hostFileExistsAfter: existsSync(target) });
      applied(call); expect(call.data.denied).toBe(true); expect(["EPERM", "EACCES", "ENOENT"]).toContain(call.data.code);
      expect(existsSync(target)).toBe(false); passed = true;
    } finally { await f.finish(passed); }
  });

  realTest("a writable-root symlink cannot modify an owned outside file", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const target = join(f.outside, "outside.txt"), link = join(f.allowed, "outside-link");
      writeFileSync(target, "before-symlink-attempt"); symlinkSync(target, link);
      const call = await f.run(`let denied=false,code=null;try{require("node:fs").writeFileSync(${JSON.stringify(link)},"after-escape");}catch(error){denied=true;code=error.code;}${emit('{attempted:true,denied,code}')} `);
      const after = readFileSync(target, "utf8"); f.facts.push({ target, expectedBefore: "before-symlink-attempt", actualAfter: after });
      applied(call); expect(call.data.denied).toBe(true); expect(after).toBe("before-symlink-attempt"); passed = true;
    } finally { await f.finish(passed); }
  });

  realTest("owned SSH and workspace authority canaries cannot be read into output", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const canary = `synthetic-not-a-real-secret-${randomUUID()}`;
      const paths = [join(f.home, ".ssh", "canary"), join(f.workspace, ".amc", "canary")];
      for (const path of paths) writeFileSync(path, canary);
      const call = await f.run(`const paths=${JSON.stringify(paths)};const reads=paths.map(path=>{try{return {path,value:require("node:fs").readFileSync(path,"utf8")};}catch(error){return {path,denied:true,code:error.code};}});${emit('{attempted:true,reads}')} `);
      f.facts.push({ paths, canariesUnchanged: paths.every(path => readFileSync(path, "utf8") === canary) });
      applied(call); expect(call.receipt.stdout).not.toContain(canary); expect(call.receipt.stderr).not.toContain(canary);
      expect(call.data.reads).toHaveLength(2); expect(call.data.reads.every((row: { denied?: boolean }) => row.denied === true)).toBe(true);
      expect(paths.every(path => readFileSync(path, "utf8") === canary)).toBe(true); passed = true;
    } finally { await f.finish(passed); }
  });

  // SH-SANDBOX-08: AMC's own home (AMC_HOME, where provider credentials live) is denied by the backend itself, not only by a signed readDeny.
  realTest("the AMC home's credentials file cannot be read even when no signed readDeny names it", async () => {
    const f = nativeContainmentFixture({ readDenyHome: false }); let passed = false;
    try {
      const canary = `synthetic-not-a-real-secret-${randomUUID()}`;
      const path = join(process.env.AMC_HOME!, ".credentials.yaml");
      writeFileSync(path, canary);
      const call = await f.run(`let value=null,denied=false,code=null;try{value=require("node:fs").readFileSync(${JSON.stringify(path)},"utf8");}catch(error){denied=true;code=error.code;}${emit('{attempted:true,denied,code}')} `);
      applied(call); expect(call.receipt.stdout).not.toContain(canary);
      expect(call.data.denied).toBe(true); expect(readFileSync(path, "utf8")).toBe(canary); passed = true;
    } finally { await f.finish(passed); }
  });

  // SH-SANDBOX-08: a credential store chosen by --credentials-home (not by AMC_HOME) is denied once the session registers it.
  realTest("a session-selected credential store outside AMC_HOME cannot be read", async () => {
    const f = nativeContainmentFixture({ readDenyHome: false }); let passed = false;
    try {
      const store = join(f.root, "session-credentials"); mkdirSync(store, { recursive: true, mode: 0o700 });
      const canary = `synthetic-not-a-real-secret-${randomUUID()}`;
      const path = join(store, ".credentials.yaml"); writeFileSync(path, canary);
      denySessionSecretPaths([store, path]);
      const call = await f.run(`let value=null,denied=false,code=null;try{value=require("node:fs").readFileSync(${JSON.stringify(path)},"utf8");}catch(error){denied=true;code=error.code;}${emit('{attempted:true,denied,code}')} `);
      applied(call); expect(call.receipt.stdout).not.toContain(canary);
      expect(call.data.denied).toBe(true); expect(readFileSync(path, "utf8")).toBe(canary); passed = true;
    } finally { await f.finish(passed); }
  });

  // S5: an AMC secret a _FILE variable names is denied by the backend itself, here the vault passphrase file kept in the
  // project: Seatbelt denies it outright, and Bubblewrap masks it because it lies inside the mounted workspace.
  realTest("the vault passphrase file AMC_VAULT_PASSPHRASE_FILE names cannot be read, even inside the workspace", async () => {
    const f = nativeContainmentFixture({ readDenyHome: false }); let passed = false;
    try {
      const canary = `synthetic-not-a-real-secret-${randomUUID()}`;
      const secrets = join(f.workspace, "secrets"); mkdirSync(secrets, { recursive: true, mode: 0o700 });
      const path = join(secrets, "vault-passphrase"); writeFileSync(path, canary, { mode: 0o600 });
      process.env.AMC_VAULT_PASSPHRASE_FILE = path; // restored by the fixture's finish
      const call = await f.run(`let value=null,denied=false,code=null;try{value=require("node:fs").readFileSync(${JSON.stringify(path)},"utf8");}catch(error){denied=true;code=error.code;}${emit('{attempted:true,denied,code,value}')} `);
      applied(call); expect(call.receipt.stdout).not.toContain(canary);
      // Seatbelt refuses the read; the Linux mask is /dev/null, which reads as empty.
      expect(call.data.denied === true || call.data.value === "").toBe(true);
      expect(readFileSync(path, "utf8")).toBe(canary); passed = true;
    } finally { await f.finish(passed); }
  });

  (process.platform === "darwin" ? realTest : test.skip)("S5: Seatbelt prevents renaming any writable ancestor of a secret", async () => {
    const f = nativeContainmentFixture({ readDenyHome: false }); let passed = false;
    try {
      const outer = join(f.allowed, "outer"), inner = join(outer, "inner");
      const secret = join(inner, "vault-passphrase"), canary = `synthetic-${randomUUID()}`;
      const moved = join(f.allowed, "moved"), sibling = join(inner, "ordinary.txt");
      mkdirSync(inner, { recursive: true });
      writeFileSync(secret, canary, { mode: 0o600 });
      process.env.AMC_VAULT_PASSPHRASE_FILE = secret;
      const moves = [[inner, join(moved, "vault-passphrase")], [outer, join(moved, "inner", "vault-passphrase")]];
      const call = await f.run(`const fs=require("node:fs"),attempts=[];
        fs.writeFileSync(${JSON.stringify(sibling)},"ordinary write");
        for(const [source,alias] of ${JSON.stringify(moves)}) {
          try { fs.renameSync(source,${JSON.stringify(moved)}); }
          catch(error) { attempts.push({denied:true,code:error.code}); continue; }
          attempts.push({denied:false,value:fs.readFileSync(alias,"utf8")});
        }
        ${emit("{attempted:true,attempts}")}`);
      applied(call);
      expect(call.receipt.stdout).not.toContain(canary);
      expect(call.data.attempts).toEqual([{ denied: true, code: "EPERM" }, { denied: true, code: "EPERM" }]);
      expect(readFileSync(secret, "utf8")).toBe(canary);
      expect(readFileSync(sibling, "utf8")).toBe("ordinary write");
      passed = true;
    } finally { await f.finish(passed); }
  });

  // Linux only: macOS reports Node's own kqueue descriptors as directories, and Seatbelt passes no extra fd.
  (process.platform === "linux" ? realTest : test.skip)("the command inherits no launcher descriptor and cannot write the read-only workspace", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const target = join(f.workspace, "escaped.txt");
      // Any inherited directory or file fd (mount sources, status, filter) would let openat reach the masked .amc or the workspace.
      const call = await f.run(`const fs=require("node:fs");const leaked=[];for(let fd=3;fd<1024;fd++){try{const s=fs.fstatSync(fd);if(s.isDirectory()||s.isFile())leaked.push(fd);}catch{}}let wrote=false,code=null;try{fs.writeFileSync(${JSON.stringify(target)},"escaped");wrote=true;}catch(error){code=error.code;}${emit('{attempted:true,leaked,wrote,code}')} `);
      applied(call); expect(call.data.leaked).toEqual([]); expect(call.data.wrote).toBe(false);
      expect(existsSync(target)).toBe(false); passed = true;
    } finally { await f.finish(passed); }
  });

  (process.platform === "linux" ? realTest : test.skip)("the native PTY launch plan hands its command no launcher descriptor", () => {
    const f = nativeContainmentFixture();
    const launch = prepareNativePtyLaunch(f.workspace, { writableRoots: [f.allowed], network: "deny", timeoutMs: 5_000 }, 80, 24);
    try {
      expect(launch.extraFds.length).toBeGreaterThan(2);
      expect(unconsumedFds(launch.argv, launch.extraFds.length)).toEqual([]);
      expect(launch.argv.some(arg => arg.startsWith("/proc/self/fd/"))).toBe(false);
    } finally { launch.dispose(); }
    return f.finish(true);
  });

  realTest("a root shell's receipt claims no process cap, because the kernel exempts root from RLIMIT_NPROC", async () => {
    const f = nativeContainmentFixture({ maxProcesses: 16 }); let passed = false;
    vi.spyOn(process, "geteuid").mockReturnValue(0);
    try {
      const call = await f.run(emit("{attempted:true}"));
      applied(call); expect(call.receipt.enforcement?.processLimit).toBeNull();
      expect(call.receipt.enforcement!.limitations.join(" ")).toContain("exempts from RLIMIT_NPROC"); passed = true;
    } finally { vi.restoreAllMocks(); await f.finish(passed); }
  });

  realTest("direct TCP to a healthy owned listener fails with an OS permission error", async () => {
    const f = nativeContainmentFixture(); let passed = false;
    try {
      const origin = await f.origin(), before = origin.connectionCount();
      const call = await f.run(`const net=require("node:net");let reported=false;const done=value=>{if(reported)return;reported=true;${emit('{attempted:true,...value}')}};let socket;try{socket=net.createConnection({host:"127.0.0.1",port:${origin.port}});socket.setTimeout(2000);socket.once("connect",()=>{done({connected:true});socket.destroy();});socket.once("error",error=>done({connected:false,code:error.code}));socket.once("timeout",()=>{done({connected:false,code:"TIMEOUT"});socket.destroy();});}catch(error){done({connected:false,code:error.code});}`);
      f.facts.push({ directConnectionsBefore: before, directConnectionsAfter: origin.connectionCount() });
      applied(call); expect(call.data.connected).toBe(false); expect(["EPERM", "EACCES"]).toContain(call.data.code);
      expect(origin.connectionCount()).toBe(before); expect(origin.errors).toEqual([]); passed = true;
    } finally { await f.finish(passed); }
  });

  proxyTest("the real proxy denies an unlisted host with 403 and a matching decision callback", async () => {
    const f = nativeContainmentFixture({ allowHosts: ["127.0.0.1"] }); let passed = false;
    try {
      const origin = await f.origin(), before = origin.requests.length;
      const call = await f.run(proxyProgram(`http://blocked.invalid:${origin.port}/blocked`));
      f.facts.push({ requestsBefore: before, requestsAfter: origin.requests.length });
      applied(call, "proxy-allowlist"); expect(call.data.status).toBe(403);
      expect(f.egress.map(row => ({ callId: row.execution.callId, ...row.row }))).toEqual([{
        callId: call.execution.callId, host: "blocked.invalid", port: origin.port, decision: "deny",
        reason: "blocked.invalid is not in the egress allowlist"
      }]);
      expect(origin.requests).toHaveLength(before); expect(origin.errors).toEqual([]); passed = true;
    } finally { await f.finish(passed); }
  });

  proxyTest("an explicitly listed loopback IP reaches the real owned origin through the authenticated proxy", async () => {
    const f = nativeContainmentFixture({ allowHosts: ["127.0.0.1"] }); let passed = false;
    try {
      const origin = await f.origin(), before = origin.requests.length;
      const call = await f.run(proxyProgram(`${origin.url}/allowed`));
      f.facts.push({ requestsBefore: before, actualRequests: [...origin.requests] });
      applied(call, "proxy-allowlist"); expect(call.data).toMatchObject({ status: 200, body: "owned-p105-origin" });
      expect(origin.requests.slice(before)).toEqual([{ method: "GET", url: "/allowed" }]);
      expect(f.egress.map(row => row.row)).toEqual([{ host: "127.0.0.1", port: origin.port, decision: "allow", reason: "127.0.0.1 is listed as an IP literal" }]);
      expect(origin.errors).toEqual([]); passed = true;
    } finally { await f.finish(passed); }
  });

  proxyTest("a listed localhost name without an IP exemption is refused after actual local resolution", async () => {
    const f = nativeContainmentFixture({ allowHosts: ["localhost"] }); let passed = false;
    try {
      const addresses = (await lookup("localhost", { all: true, verbatim: true })).map(row => row.address);
      expect(addresses.length).toBeGreaterThan(0);
      expect(addresses.every(address => address === "127.0.0.1" || address === "::1")).toBe(true);
      const origin = await f.origin(), before = origin.requests.length;
      const call = await f.run(proxyProgram(`http://localhost:${origin.port}/private-name`));
      f.facts.push({ resolvedBefore: addresses, requestsBefore: before, requestsAfter: origin.requests.length });
      applied(call, "proxy-allowlist"); expect(call.data.status).toBe(403);
      expect(f.egress).toHaveLength(1); expect(f.egress[0]!.row).toMatchObject({ host: "localhost", decision: "deny" });
      expect(f.egress[0]!.row.reason).toMatch(/^localhost resolves to non-public address (127\.0\.0\.1|::1), which is not listed as an IP literal$/);
      expect(origin.requests).toHaveLength(before); expect(origin.errors).toEqual([]); passed = true;
    } finally { await f.finish(passed); }
  });

  // Root is exempt from RLIMIT_NPROC (the receipt says so, tested above), so the cap probe needs an ordinary user.
  (process.geteuid?.() === 0 ? test.skip : realTest)("a finite process-cap probe reaches EAGAIN with at most 32 owned live children and reaps them", async () => {
    const f = nativeContainmentFixture({ maxProcesses: 16 }); let passed = false;
    try {
      const call = await f.run(`(async()=>{const {spawn}=require("node:child_process");const children=[],closed=[],errors=[],stdinErrors=[];let attempts=0;try{for(;attempts<32;){attempts+=1;const child=${liveChild};const close=new Promise(resolve=>child.once("close",(code,signal)=>{closed.push({pid:child.pid||null,code,signal});resolve();}));children.push({child,close});if(child.stdin)child.stdin.on("error",error=>stdinErrors.push(error.code));const started=await new Promise(resolve=>{child.once("spawn",()=>resolve(true));child.once("error",error=>{errors.push(error.code);resolve(false);});});if(!started)break;}}finally{for(const {child}of children)if(child.stdin)child.stdin.end();await Promise.all(children.map(row=>row.close));}${emit('{attempted:true,attempts,spawned:children.filter(row=>row.child.pid).map(row=>row.child.pid),closed,errors,stdinErrors,limitHit:errors.includes("EAGAIN")}')}})().catch(error=>{${emit('{attempted:true,error:error.message}')}process.exitCode=1;});`);
      applied(call); expect(call.data.limitHit).toBe(true); expect(call.data.errors).toEqual(["EAGAIN"]);
      expect(call.data.spawned.length).toBeLessThanOrEqual(32); expect(call.data.attempts).toBeLessThanOrEqual(32);
      expect(call.data.closed).toHaveLength(call.data.spawned.length + 1);
      expect(call.data.closed.filter((row: { pid: number | null }) => row.pid !== null).every((row: { code: number; signal: string | null }) => row.code === 0 && row.signal === null)).toBe(true);
      expect(call.receipt.enforcement?.processLimit).toMatchObject({ mechanism: "rlimit-nproc", max: expect.any(Number) });
      expect(call.receipt.enforcement!.limitations.join(" ")).toContain("every process of your user"); passed = true;
    } finally { await f.finish(passed); }
  });
});
