import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bwrapBackend } from "../../src/sandbox/bwrapBackend.js";
import { seatbeltNativeShell } from "../../src/sandbox/seatbeltNativeShell.js";
import { nativeContainmentFixture, type NativeCall } from "../helpers/nativeContainment.js";

// Binary prerequisites are not confinement evidence. Every actual call must produce a real applied receipt.
const backend = process.platform === "darwin" ? seatbeltNativeShell() : bwrapBackend();
const supported = process.platform === "darwin" || process.platform === "linux";
const prerequisite = backend.available();
const required = process.env.AMC_REQUIRE_REAL_SANDBOX === "1";
const realTest = supported && prerequisite.ok || required ? test : test.skip;
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

describe("real native shell escape attempts with owned canaries", () => {
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

  realTest("the real proxy denies an unlisted host with 403 and a matching decision callback", async () => {
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

  realTest("an explicitly listed loopback IP reaches the real owned origin through the authenticated proxy", async () => {
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

  realTest("a listed localhost name without an IP exemption is refused after actual local resolution", async () => {
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

  realTest("a finite process-cap probe reaches EAGAIN with at most 32 owned live cat children and reaps them", async () => {
    const f = nativeContainmentFixture({ maxProcesses: 16 }); let passed = false;
    try {
      const call = await f.run(`(async()=>{const {spawn}=require("node:child_process");const children=[],closed=[],errors=[],stdinErrors=[];let attempts=0;try{for(;attempts<32;){attempts+=1;const child=spawn("/bin/cat",[],{stdio:["pipe","ignore","ignore"]});const close=new Promise(resolve=>child.once("close",(code,signal)=>{closed.push({pid:child.pid||null,code,signal});resolve();}));children.push({child,close});if(child.stdin)child.stdin.on("error",error=>stdinErrors.push(error.code));const started=await new Promise(resolve=>{child.once("spawn",()=>resolve(true));child.once("error",error=>{errors.push(error.code);resolve(false);});});if(!started)break;}}finally{for(const {child}of children)if(child.stdin)child.stdin.end();await Promise.all(children.map(row=>row.close));}${emit('{attempted:true,attempts,spawned:children.filter(row=>row.child.pid).map(row=>row.child.pid),closed,errors,stdinErrors,limitHit:errors.includes("EAGAIN")}')}})().catch(error=>{${emit('{attempted:true,error:error.message}')}process.exitCode=1;});`);
      applied(call); expect(call.data.limitHit).toBe(true); expect(call.data.errors).toEqual(["EAGAIN"]);
      expect(call.data.spawned.length).toBeLessThanOrEqual(32); expect(call.data.attempts).toBeLessThanOrEqual(32);
      expect(call.data.closed).toHaveLength(call.data.spawned.length + 1);
      expect(call.data.closed.filter((row: { pid: number | null }) => row.pid !== null).every((row: { code: number; signal: string | null }) => row.code === 0 && row.signal === null)).toBe(true);
      expect(call.receipt.enforcement?.processLimit).toMatchObject({ mechanism: "rlimit-nproc", max: expect.any(Number) });
      expect(call.receipt.enforcement!.limitations.join(" ")).toContain("every process of your user"); passed = true;
    } finally { await f.finish(passed); }
  });
});
