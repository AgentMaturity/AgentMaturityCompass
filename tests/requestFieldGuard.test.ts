import { spawn } from "node:child_process";
import { createHash, verify } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { gatewayConfigSchema, type GatewayConfig } from "../src/gateway/config.js";
import { checkUpstreamEgress, pinnedLookup, prepareFieldGuard, requestFieldRefusal } from "../src/gateway/requestFieldGuard.js";

const FIELD = "dsh_session_log";
const SOURCE = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const write = (path: string, value: unknown): void => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected fixture JSON object");
  return value as Json;
}
const read = (path: string): Json => object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))));
const upstream = (baseUrl: string): GatewayConfig["upstreams"][string] => ({ baseUrl, auth: { type: "none" } });
function config(urls: Record<string, string>, guards: Record<string, string[]> = {}): GatewayConfig {
  return gatewayConfigSchema.parse({ listen: { host: "127.0.0.1", port: 0 }, redaction: {},
    upstreams: Object.fromEntries(Object.entries(urls).map(([id, url]) => [id, upstream(url)])),
    routes: Object.keys(urls).map(id => ({ prefix: "/" + id, upstream: id, refuseRequestFields: guards[id] ?? [] })),
    proxy: { enabled: false } });
}

describe("request field refusal preserves the hardened top-level JSON contract", () => {
  test.each([
    ["exact key", '{"dsh_session_log":"private"}'],
    ["case-folded key", '{"DSH_SESSION_LOG":"private"}'],
    ["NFKC key", '{"ｄｓｈ＿ｓｅｓｓｉｏｎ＿ｌｏｇ":"private"}'],
    ["JSON-escaped key", '{"\\u0064sh_session_log":"private"}'],
    ["duplicate key", '{"dsh_session_log":null,"dsh_session_log":false}'],
    ["null value", '{"dsh_session_log":null}'],
    ["empty value", '{"dsh_session_log":""}']
  ])("refuses the %s without examining its value", (_name, raw) => {
    expect(requestFieldRefusal(Buffer.from(raw), {}, [FIELD])).toEqual({ reason: "refused-field", fields: [FIELD] });
  });
  test.each([
    ["absent key", '{"model":"fixture","messages":[]}'],
    ["nested key", '{"metadata":{"dsh_session_log":"nested"}}'],
    ["array-nested key", '{"messages":[{"dsh_session_log":"nested"}]}'],
    ["key as a value", '{"content":"dsh_session_log"}'],
    ["different key", '{"dsh_session_logging":"permitted"}'],
    ["empty object", "{}"]
  ])("permits %s", (_name, raw) => {
    expect(requestFieldRefusal(Buffer.from(raw), { "content-type": "application/json; charset=UTF-8" }, [FIELD])).toBeNull();
  });
  test("the configured names, not source values, are reported in configured order", () => {
    expect(requestFieldRefusal(Buffer.from('{"a":"secret-a","DSH_SESSION_LOG":{"anything":true}}'), {}, [FIELD, "A", "missing"]))
      .toEqual({ reason: "refused-field", fields: [FIELD, "A"] });
  });
  test.each([
    ["gzip", Buffer.from("{}"), { "content-encoding": "gzip" }, "content-encoding"],
    ["mixed encoding", Buffer.from("{}"), { "content-encoding": "identity, br" }, "content-encoding"],
    ["non-UTF8 charset", Buffer.from("{}"), { "content-type": "application/json; charset=latin1" }, "charset"],
    ["UTF8 BOM", Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), {}, "byte-order-mark"],
    ["UTF16 BE BOM", Buffer.from([0xfe, 0xff, 0x7b, 0x7d]), {}, "byte-order-mark"],
    ["UTF16 LE BOM", Buffer.from([0xff, 0xfe, 0x7b, 0x7d]), {}, "byte-order-mark"],
    ["invalid UTF8", Buffer.from([0xc3, 0x28]), {}, "invalid-utf8"],
    ["malformed JSON", Buffer.from("{"), {}, "not-json"],
    ["plain text", Buffer.from("dsh_session_log=private"), {}, "not-json"],
    ["array", Buffer.from("[]"), {}, "not-object"],
    ["null", Buffer.from("null"), {}, "not-object"],
    ["string", Buffer.from('"value"'), {}, "not-object"],
    ["number", Buffer.from("7"), {}, "not-object"],
    ["boolean", Buffer.from("true"), {}, "not-object"]
  ] as const)("fails closed for %s", (_name, raw, headers, reason) => {
    expect(requestFieldRefusal(raw, headers, [FIELD])).toEqual({ reason, fields: [] });
  });
  test("empty bodies and unguarded routes preserve the explicit fast paths", () => {
    expect(requestFieldRefusal(Buffer.alloc(0), { "content-encoding": "gzip" }, [FIELD])).toBeNull();
    expect(requestFieldRefusal(Buffer.from([0xff]), { "content-encoding": "gzip" }, [])).toBeNull();
    expect(requestFieldRefusal(Buffer.from("{}"), { "content-encoding": " identity ", "content-type": 'application/json; charset="utf8"' }, [FIELD])).toBeNull();
  });
});

describe("field guards share current host/address identity without weakening P1-66 egress", () => {
  test("unguarded configs never invoke the resolver", async () => {
    let calls = 0;
    const guard = prepareFieldGuard(config({ a: "https://a.example" }), async () => { calls++; throw new Error("No DNS expected"); });
    expect(await guard.fieldsFor("a", [])).toEqual([]);
    expect(await guard.targetRefused("a.example", [])).toBeNull();
    expect(calls).toBe(0);
  });
  test("unions every route and host alias sharing a checked address", async () => {
    const c = config({ a: "https://API.EXAMPLE./", b: "https://alias.example", c: "https://independent.example" }, { a: [FIELD], b: ["feedback"] });
    c.routes.push({ prefix: "/second-a", upstream: "a", stripPrefix: true, openaiCompatible: false, refuseRequestFields: ["trace", FIELD] });
    const guard = prepareFieldGuard(c, async name => name === "independent.example" ? ["8.8.4.4"] : ["8.8.8.8"]);
    expect(await guard.fieldsFor("a", ["8.8.8.8"])).toEqual([FIELD, "trace", "feedback"]);
    expect(await guard.fieldsFor("b", ["8.8.8.8"])).toEqual([FIELD, "trace", "feedback"]);
    expect(await guard.fieldsFor("c", ["8.8.4.4"])).toEqual([]);
  });
  test("IPv4-mapped address aliases retain the guard", async () => {
    const guard = prepareFieldGuard(config({ a: "http://127.0.0.1", b: "http://[::ffff:7f00:1]" }, { a: [FIELD] }));
    expect(await guard.fieldsFor("b", ["::ffff:127.0.0.1"])).toEqual([FIELD]);
    expect(await guard.targetRefused("alias.example", ["::ffff:7f00:1"])).toMatchObject({ unresolved: false });
  });
  test("unknown guard identity or target addresses retains all fields", async () => {
    const guard = prepareFieldGuard(config({ a: "https://missing.example", b: "https://other.example" }, { a: [FIELD] }), async () => { throw new Error("Owned resolver refusal"); });
    expect(await guard.fieldsFor("b", ["8.8.8.8"])).toEqual([FIELD]);
    expect(await guard.targetRefused("other.example", ["8.8.8.8"])).toMatchObject({ unresolved: true });
    const known = prepareFieldGuard(config({ a: "https://a.example", b: "https://b.example" }, { a: [FIELD] }), async () => ["8.8.8.8"]);
    expect(await known.fieldsFor("b", [])).toEqual([FIELD]);
    expect(await known.targetRefused("b.example", [])).toMatchObject({ unresolved: false });
  });
  test("a fresh resolution changes alias membership on the next request", async () => {
    let address = "8.8.8.8", calls = 0;
    const guard = prepareFieldGuard(config({ a: "https://a.example", b: "https://b.example" }, { a: [FIELD] }), async () => { calls++; return [address]; });
    expect(await guard.fieldsFor("b", ["8.8.8.8"])).toEqual([FIELD]);
    address = "8.8.4.4";
    expect(await guard.fieldsFor("b", ["8.8.8.8"])).toEqual([]);
    expect(await guard.fieldsFor("b", ["8.8.4.4"])).toEqual([FIELD]);
    expect(calls).toBe(3);
  });
  test("forward tunnels refuse the guarded host, subdomain and address alias only", async () => {
    const guard = prepareFieldGuard(config({ a: "https://api.example" }, { a: [FIELD] }), async () => ["8.8.8.8"]);
    for (const [host, addresses] of [["API.EXAMPLE.", ["8.8.4.4"]], ["sub.api.example", ["8.8.4.4"]], ["alias.example", ["8.8.8.8"]]] as const) {
      expect(await guard.targetRefused(host, addresses)).toMatchObject({ unresolved: false });
    }
    expect(await guard.targetRefused("evil-api.example", ["8.8.4.4"])).toBeNull();
  });
  test("reverse egress resolves each request and rejects an inward answer", async () => {
    const c = upstream("https://api.example"); let calls = 0;
    const resolver = async (): Promise<string[]> => ++calls === 1 ? ["8.8.8.8"] : ["127.0.0.1"];
    expect((await checkUpstreamEgress(c, c, true, resolver)).decision.allowed).toBe(true);
    expect((await checkUpstreamEgress(c, c, true, resolver)).decision.allowed).toBe(false);
    expect(calls).toBe(2);
  });
  test("non-public named addresses require a valid signed opt-in", async () => {
    const c = { ...upstream("https://api.example"), allowNonPublicAddresses: ["10.1.2.3"] };
    const resolver = async (): Promise<string[]> => ["8.8.8.8", "10.1.2.3"];
    expect((await checkUpstreamEgress(c, c, true, resolver)).decision.allowed).toBe(true);
    const unsigned = await checkUpstreamEgress(c, c, false, resolver);
    expect(unsigned.decision.allowed).toBe(false);
    expect(unsigned.decision.reason).toContain("signature is not valid");
  });
  test("literal/local opt-ins work but an environment expansion is no signed IP opt-in", async () => {
    const literal = upstream("http://127.0.0.1:1");
    expect((await checkUpstreamEgress(literal, literal, true)).decision.allowed).toBe(true);
    expect((await checkUpstreamEgress(upstream("${ENDPOINT}"), literal, true)).decision.allowed).toBe(false);
    const local = { ...upstream("http://local.example"), allowLocalhost: true };
    expect((await checkUpstreamEgress(local, local, true, async () => ["::1", "127.0.0.1"])).decision.allowed).toBe(true);
  });
  test("unresolved named upstreams are explicit transport failures", async () => {
    const c = upstream("https://missing.example");
    expect(await checkUpstreamEgress(c, c, true, async () => [])).toMatchObject({ addresses: [], unresolved: true, decision: { allowed: false } });
  });
  test("connection lookup returns only the checked addresses without another resolver", async () => {
    expect(pinnedLookup([])).toBeUndefined();
    const lookup = pinnedLookup(["8.8.8.8", "2001:4860:4860::8888"]);
    expect(lookup).toBeTypeOf("function");
    const all = await new Promise<unknown>((done, reject) => lookup!("changed.example", { all: true }, (error, addresses) => error ? reject(error) : done(addresses)));
    expect(all).toEqual([{ address: "8.8.8.8", family: 4 }, { address: "2001:4860:4860::8888", family: 6 }]);
    const first = await new Promise<unknown>((done, reject) => lookup!("changed.example", {}, (error, address, family) => error ? reject(error) : done({ address, family })));
    expect(first).toEqual({ address: "8.8.8.8", family: 4 });
  });
});

// Child-only built APIs: the Vitest parent never opens a ledger or leaves a pooled SQLite handle alive.
const DRIVER = String.raw`
import assert from 'node:assert/strict';import {createServer,request} from 'node:http';import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const [stage,file]=process.argv.slice(2),c=JSON.parse(readFileSync(file,'utf8'));
const load=p=>import(pathToFileURL(join(c.buildRoot,'dist',p)).href),sha=b=>createHash('sha256').update(b).digest('hex');
const {closeAllSqlitePools}=await load('storage/sqlitePool.js'),{lockVault,unlockVault}=await load('vault/vault.js');
let result,failure,gateway,server,ledger;const cleanup=[],serverErrors=[],logs=[];let upstreamClosed=false;const sockets=new Set();
try{
 if(stage==='init'){
  const {initWorkspace}=await load('workspace.js');initWorkspace({workspacePath:c.workspace,agentId:'p124-agent',trustBoundaryMode:'isolated'});
  const {getPublicKeyPem}=await load('crypto/keys.js');result={stage,keys:Object.fromEntries(['monitor','auditor','lease'].map(role=>[role,getPublicKeyPem(c.workspace,role)]))};
 }else if(stage==='http'){
  unlockVault(c.workspace,process.env.AMC_VAULT_PASSPHRASE);const {getPublicKeyPem}=await load('crypto/keys.js');
  for(const [role,pem]of Object.entries(c.keys))assert.equal(getPublicKeyPem(c.workspace,role),pem);
  const seen=[];server=createServer((req,res)=>{const chunks=[];req.on('data',b=>chunks.push(b));req.on('error',e=>serverErrors.push(e.message));req.on('end',()=>{
   const raw=Buffer.concat(chunks);seen.push({path:req.url,method:req.method,raw:raw.toString('utf8'),sha256:sha(raw)});
   res.writeHead(200,{'Content-Type':'application/json','Connection':'close'});res.end(JSON.stringify({id:'owned-p124',model:'fixture',usage:{total_tokens:1}}));});});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',e=>serverErrors.push(e.message));});
  server.on('error',e=>serverErrors.push(e.message));await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);done();});});
  const {gatewayConfigSchema,initGatewayConfig,verifyGatewayConfigSignature}=await load('gateway/config.js');
  const cfg=gatewayConfigSchema.parse({listen:{host:'127.0.0.1',port:0},redaction:{},upstreams:{owned:{baseUrl:'http://127.0.0.1:'+server.address().port,auth:{type:'none'},allowLocalhost:true}},
   routes:[{prefix:'/guarded',upstream:'owned',refuseRequestFields:['dsh_session_log']},{prefix:'/alias',upstream:'owned'}],proxy:{enabled:false}});
  const paths=initGatewayConfig(c.workspace,cfg);assert.equal(verifyGatewayConfigSignature(c.workspace).valid,true);
  const {issueLeaseForCli,verifyLeaseForCli}=await load('leases/leaseCli.js');const lease=issueLeaseForCli({workspace:c.workspace,agentId:'p124-agent',ttl:'10m',scopes:'gateway:llm',routes:'/guarded,/alias',models:'*',rpm:1000,tpm:1000000,maxCostUsdPerDay:null});
  const verifiedLease=verifyLeaseForCli({workspace:c.workspace,token:lease.token});assert.equal(verifiedLease.ok,true);
  const {startGateway}=await load('gateway/server.js');gateway=await startGateway({workspace:c.workspace,logger:{log:m=>logs.push(String(m)),error:m=>logs.push(String(m))}});
  assert.equal(gateway.signatureValid,true);const gatewaySessionId=gateway.gatewaySessionId;
  async function post(path,raw,extra={}){return await new Promise((done,reject)=>{const q=request({host:gateway.host,port:gateway.port,path,method:'POST',agent:false,
   headers:{Connection:'close','Content-Type':'application/json','Content-Length':String(raw.length),'x-amc-agent-id':'p124-agent','x-amc-lease':lease.token,...extra}},r=>{
    const chunks=[];r.on('error',reject);r.on('data',b=>chunks.push(b));r.on('end',()=>done({status:r.statusCode,body:Buffer.concat(chunks).toString('utf8')}));});
   q.on('error',reject);q.setTimeout(2000,()=>q.destroy(new Error('Owned HTTP observation deadline')));q.end(raw);});}
  const absent=Buffer.from(JSON.stringify({model:'fixture',messages:[]})),nested=Buffer.from(JSON.stringify({model:'fixture',metadata:{dsh_session_log:'nested-is-not-top-level'}}));
  const forwards=[];for(const raw of[absent,nested]){const before=seen.length,response=await post('/guarded/v1/chat/completions',raw);forwards.push({response,before,after:seen.length,sha256:sha(raw)});}
  const refusals=[];for(const [path,raw,headers,reason,fields]of[
   ['/guarded/v1/chat/completions',Buffer.from(JSON.stringify({model:'fixture',dsh_session_log:c.secret})),{},'refused-field',['dsh_session_log']],
   ['/alias/v1/chat/completions',Buffer.from(JSON.stringify({model:'fixture',DSH_SESSION_LOG:c.secret+'-alias'})),{},'refused-field',['dsh_session_log']],
   ['/guarded/v1/chat/completions',Buffer.from('{}'),{'Content-Encoding':'gzip'},'content-encoding',[]]]){
    const before=seen.length,response=await post(path,raw,headers);refusals.push({path,response,before,after:seen.length,bytes:raw.length,reason,fields});}
  result={stage,gatewaySessionId,forwards,refusals,seen,leaseVerified:verifiedLease.ok,leasePayload:verifiedLease.payload,
   configRaw:readFileSync(paths.configPath,'utf8'),configSignature:JSON.parse(readFileSync(paths.sigPath,'utf8')),logs};
 }else if(stage==='read'){
  const {getPublicKeyPem}=await load('crypto/keys.js');for(const [role,pem]of Object.entries(c.keys))assert.equal(getPublicKeyPem(c.workspace,role),pem);
  const {openLedger}=await load('ledger/ledger.js'),{verifyLedgerIntegrity}=await load('ledger/ledgerVerification.js');
  const verification=verifyLedgerIntegrity(c.workspace,{expectedMonitorFingerprint:sha(c.keys.monitor)});
  ledger=openLedger(c.workspace,{readonly:true});result={stage,verification,events:ledger.getAllEvents(),sessions:ledger.getAllSessions()};
 }else throw new Error('Unknown owned fixture stage');
}catch(error){failure=error;}finally{
 if(gateway)try{await gateway.close();}catch(error){cleanup.push(error);}
 if(server)try{await new Promise((done,reject)=>server.close(error=>error?reject(error):done()));upstreamClosed=true;
  const until=Date.now()+1000;while(sockets.size>0&&Date.now()<until)await new Promise(done=>setTimeout(done,10));
  assert.equal(server.listening,false);assert.equal(sockets.size,0);}catch(error){cleanup.push(error);}
 if(ledger)try{ledger.close();}catch(error){cleanup.push(error);}
 try{closeAllSqlitePools();}catch(error){cleanup.push(error);}try{lockVault(c.workspace);}catch(error){cleanup.push(error);}
}
if(failure||cleanup.length||serverErrors.length)throw new AggregateError([failure,...cleanup,...serverErrors.map(x=>new Error(x))].filter(x=>x!==undefined),'Owned gateway body or cleanup failed');
writeFileSync(c.resultFile,JSON.stringify({...result,lifecycle:{upstreamClosed,upstreamSockets:sockets.size,serverErrors}},null,2)+'\n',{flag:'wx',mode:0o600});
`;

interface ChildObservation { stage: string; pid: number | null; code: number | null; signal: string | null; errors: string[]; pidAbsent: boolean;
  stdout: { path: string; bytes: number; sha256: string }; stderr: { path: string; bytes: number; sha256: string }; resultFile: string }
async function runChild(root: string, stage: string, cfg: Json): Promise<ChildObservation> {
  const resultFile = join(root, stage + "-result.json"), input = join(root, stage + "-input.json"), driver = join(root, "driver.mjs");
  write(input, { ...cfg, resultFile });
  const env = { PATH: process.env.PATH ?? "", HOME: join(root, "home"), TMPDIR: join(root, "tmp"), AMC_HOME: join(root, "operator"),
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1", AMC_VAULT_PASSPHRASE: "synthetic-p124-owned-vault" };
  const errors: string[] = [], output: Buffer[] = [], errorOutput: Buffer[] = [];
  const child = spawn(realpathSync(process.execPath), [driver, stage, input], { cwd: SOURCE, env, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", error => errors.push("spawn: " + error.message));
  child.stdout.on("error", error => errors.push("stdout: " + error.message));
  child.stderr.on("error", error => errors.push("stderr: " + error.message));
  child.stdout.on("data", (bytes: Buffer) => output.push(Buffer.from(bytes)));
  child.stderr.on("data", (bytes: Buffer) => errorOutput.push(Buffer.from(bytes)));
  const close = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(done => child.once("close", (code, signal) => done({ code, signal })));
  let pidAbsent = false;
  if (child.pid !== undefined) {
    const until = Date.now() + 5_000;
    do {
      try { process.kill(child.pid, 0); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") { pidAbsent = true; break; }
        errors.push("PID probe: " + String(error)); break;
      }
      await new Promise(done => setTimeout(done, 20));
    } while (Date.now() < until);
  }
  const capture = (name: string, chunks: Buffer[]): ChildObservation["stdout"] => {
    const bytes = Buffer.concat(chunks), path = join(root, stage + "-" + name + ".log");
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (error) { errors.push(name + " UTF8: " + String(error)); }
    return { path, bytes: bytes.length, sha256: sha(bytes) };
  };
  const row: ChildObservation = { stage, pid: child.pid ?? null, ...close, errors, pidAbsent,
    stdout: capture("stdout", output), stderr: capture("stderr", errorOutput), resultFile };
  write(join(root, stage + "-child.json"), row);
  expect(row, "Actual child natural close, full streams and positive PID absence").toMatchObject({ code: 0, signal: null, errors: [], pidAbsent: true });
  return row;
}

test("a signed leased real gateway forwards safe bodies and refuses top-level fields before any upstream hit, with cold signed audit evidence", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p124-field-"))); chmodSync(root, 0o700);
  const workspace = join(root, "workspaces", "p124-owned");
  for (const path of [workspace, join(root, "home"), join(root, "tmp"), join(root, "operator")]) mkdirSync(path, { recursive: true, mode: 0o700 });
  writeFileSync(join(root, "driver.mjs"), DRIVER, { flag: "wx", mode: 0o600 });
  const modules = ["workspace.js", "gateway/config.js", "gateway/requestFieldGuard.js", "gateway/server.js", "enforce/egressAllowlist.js",
    "leases/leaseCli.js", "leases/leaseSigner.js", "leases/leaseVerifier.js", "ledger/ledger.js", "ledger/ledgerVerification.js", "storage/sqlitePool.js", "crypto/keys.js", "vault/vault.js"]
    .map(path => join(SOURCE, "dist", path));
  const selected = [...modules, realpathSync(process.execPath), realpathSync(join(SOURCE, "node_modules/better-sqlite3/build/Release/better_sqlite3.node"))]
    .map(path => ({ path, sha256: sha(readFileSync(path)) }));
  const cfg: Json = { buildRoot: SOURCE, workspace, secret: "P124-REFUSED-CONTENT-" + root.split("-").at(-1) };
  const children: ChildObservation[] = []; let success = false;
  try {
    write(join(root, "selected-inputs.json"), { sourceRoot: SOURCE, node: realpathSync(process.execPath), selected });
    children.push(await runChild(root, "init", cfg));
    const initialized = read(children[0]!.resultFile), keys = object(initialized.keys);
    cfg.keys = keys;
    // These external public anchors exist before config/lease creation or the first HTTP request.
    write(join(root, "pre-request-public-anchors.json"), Object.fromEntries(Object.entries(keys).map(([role, pem]) => [role, { publicKeyPem: pem, sha256: sha(String(pem)) }])));
    children.push(await runChild(root, "http", cfg));
    children.push(await runChild(root, "read", cfg));
    const observed = read(children[1]!.resultFile), cold = read(children[2]!.resultFile);
    expect(observed.lifecycle).toEqual({ upstreamClosed: true, upstreamSockets: 0, serverErrors: [] });
    expect(observed.leaseVerified).toBe(true);
    expect(observed.forwards).toEqual(expect.arrayContaining([
      expect.objectContaining({ before: 0, after: 1, response: expect.objectContaining({ status: 200 }) }),
      expect.objectContaining({ before: 1, after: 2, response: expect.objectContaining({ status: 200 }) })
    ]));
    const seen = (observed.seen as unknown[]).map(object), forwards = (observed.forwards as unknown[]).map(object);
    expect(seen).toHaveLength(2); expect(forwards).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(seen[i]!.sha256).toBe(forwards[i]!.sha256);
      expect(seen[i]!.path).toBe("/v1/chat/completions"); expect(seen[i]!.method).toBe("POST");
    }
    expect(JSON.parse(String(seen[1]!.raw))).toEqual({ model: "fixture", metadata: { dsh_session_log: "nested-is-not-top-level" } });
    const refusals = (observed.refusals as unknown[]).map(object);
    expect(refusals).toHaveLength(3);
    for (const refusal of refusals) expect(refusal).toMatchObject({ before: 2, after: 2, response: { status: 403 } });
    const signature = object(observed.configSignature);
    expect(signature.configSha256).toBe(sha(String(observed.configRaw)));
    expect(verify(null, Buffer.from(String(signature.configSha256), "hex"), String(keys.auditor), Buffer.from(String(signature.signature), "base64"))).toBe(true);
    expect(cold.verification).toMatchObject({ ok: true, chain: { ok: true, errors: [] }, governance: { ok: true, errors: [] }, trustRoot: { anchored: true, expectedFingerprint: sha(String(keys.monitor)) } });
    const events = (cold.events as unknown[]).map(object), sessions = (cold.sessions as unknown[]).map(object);
    const audits = events.filter(event => event.event_type === "audit" && object(JSON.parse(String(event.meta_json))).auditType === "REQUEST_FIELD_REFUSED");
    expect(audits).toHaveLength(3);
    expect(events.filter(event => event.event_type === "llm_request")).toHaveLength(2);
    for (let i = 0; i < audits.length; i++) {
      const event = audits[i]!, payload = object(JSON.parse(String(event.payload_inline))), meta = object(JSON.parse(String(event.meta_json)));
      expect(event.session_id).toBe(observed.gatewaySessionId);
      expect(payload).toMatchObject({ auditType: "REQUEST_FIELD_REFUSED", upstreamId: "owned", agentId: "p124-agent",
        reason: refusals[i]!.reason, fields: refusals[i]!.fields, requestBytes: refusals[i]!.bytes,
        route: i === 1 ? "/alias" : "/guarded" });
      expect(meta).toMatchObject(payload);
      expect(verify(null, Buffer.from(String(event.event_hash), "hex"), String(keys.monitor), Buffer.from(String(event.writer_sig), "base64"))).toBe(true);
    }
    const session = sessions.find(row => row.session_id === observed.gatewaySessionId);
    expect(session).toBeDefined();
    expect(verify(null, Buffer.from(String(session!.session_final_event_hash), "hex"), String(keys.monitor), Buffer.from(String(session!.session_seal_sig), "base64"))).toBe(true);
    expect(JSON.stringify(cold)).not.toContain(String(cfg.secret));
    for (const row of selected) expect(sha(readFileSync(row.path))).toBe(row.sha256);
    write(join(root, "public-observation.json"), { sourceRoot: SOURCE, selected, children, keys, observed, cold });
    console.log("P124_FIELD_GUARD_OBSERVATION " + JSON.stringify({ root, sourceRoot: SOURCE, children, forwards: forwards.length,
      refusals: refusals.length, auditIds: audits.map(row => row.id), ledgerVerified: object(cold.verification).ok }));
    success = true;
  } finally {
    if (success) {
      // Keep public proofs and full streams; discard only this fixture's successfully closed secret-bearing roots.
      for (const path of [workspace, join(root, "home"), join(root, "tmp"), join(root, "operator")]) rmSync(path, { recursive: true, force: true });
    } else console.error("P124_FIELD_GUARD_FAILED_FIXTURE " + root);
  }
});
