/** Real compiled CLI, HTTP route and MCP protocol witnesses. Parent imports Node built-ins only. */
import { describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { createHash, randomBytes, verify } from "node:crypto";
import { chmodSync, closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SOURCE = realpathSync(resolve(fileURLToPath(new URL("../", import.meta.url))));
const NODE = realpathSync(process.execPath), CLI = join(SOURCE, "dist/cli.js");
const T = Date.UTC(2026, 2, 2, 10), HOUR = 3_600_000, NOW = T + 74 * HOUR;
const US_IDS = ["nydfs-500-17-notice", "nydfs-500-17-extortion-notice", "nydfs-500-17-extortion-explanation",
  "glba-314-4j-ftc-notice", "bsa-1020-320-sar-filing"];
type Json = Record<string, unknown>;
const object = (value: unknown): Json => { expect(value !== null && typeof value === "object" && !Array.isArray(value)).toBe(true); return value as Json; };
const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): string {
  const sorted = (x: unknown): unknown => Array.isArray(x) ? x.map(sorted) : x !== null && typeof x === "object"
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sorted(child)])) : x;
  return JSON.stringify(sorted(value));
}
const json = (path: string): Json => object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))));
const write = (path: string, value: unknown): void => writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });

// Complete test-owned child producer/transport. It shares no clock evaluator implementation or expected values.
const DRIVER = String.raw`
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createServer,request} from 'node:http';
const [stage,file]=process.argv.slice(2),c=JSON.parse(readFileSync(file,'utf8'));
const load=p=>import(pathToFileURL(join(c.buildRoot,'dist',p)).href);
const sdk=p=>import(pathToFileURL(join(c.buildRoot,'node_modules/@modelcontextprotocol/sdk/dist/esm',p)).href);
const {openLedger}=await load('ledger/ledger.js'),{closeAllSqlitePools}=await load('storage/sqlitePool.js');
const {unlockVault,lockVault}=await load('vault/vault.js');let ledger,httpServer,client,mcp,result,failure;
const cleanup=[],httpErrors=[];let httpClosed=false,clientClosed=false,serverClosed=false;
try{
 if(stage==='init'){
  const {initWorkspace}=await load('workspace.js');initWorkspace({workspacePath:c.workspace,agentId:'p117-owned-agent',trustBoundaryMode:'isolated'});
  const {getPublicKeyPem}=await load('crypto/keys.js');result={stage,monitorPublicKeyPem:getPublicKeyPem(c.workspace,'monitor')};
 }else if(stage==='seed'){
  unlockVault(c.workspace,c.passphrase);
  const {getPrivateKeyPem,getPublicKeyHistory,getPublicKeyPem,signHexDigest}=await load('crypto/keys.js');
  const {createIncidentStore,computeIncidentHash,verifyIncidentSignature}=await load('incidents/incidentStore.js');
  const {recordIncidentClockEvent}=await load('incidents/incidentClockEvents.js');
  const {canonicalize}=await load('utils/json.js'),{sha256Hex}=await load('utils/hash.js');
  assert.equal(sha256Hex(getPublicKeyPem(c.workspace,'monitor')),c.expectedMonitorSha256);
  ledger=openLedger(c.workspace);const store=createIncidentStore(ledger.db);store.initTables();
  const base={incidentId:c.incidentId,agentId:'p117-owned-agent',severity:'WARN',state:'OPEN',title:'Owned fixed-date clock drill',description:'Synthetic incident; no filing or authenticated-person claim',
   triggerType:'MANUAL',triggerId:'p117-drill',rootCauseClaimIds:[],affectedQuestionIds:[],causalEdges:[],timelineEventIds:[],
   createdTs:c.triggerTs-3600000,updatedTs:c.triggerTs-3600000,resolvedTs:null,postmortemRef:null,prev_incident_hash:store.getLastIncidentHash('p117-owned-agent')};
  const incident_hash=computeIncidentHash(base),incident={...base,incident_hash,signature:signHexDigest(sha256Hex(canonicalize({...base,incident_hash})),getPrivateKeyPem(c.workspace,'monitor'))};
  const publicKeys=getPublicKeyHistory(c.workspace,'monitor');assert.equal(verifyIncidentSignature(c.workspace,incident,publicKeys),true);store.insertIncident(incident);
  const common={incidentId:c.incidentId,station:'wealth',recordedBy:'owned-fixture-clock',privateKeyPem:getPrivateKeyPem(c.workspace,'monitor'),publicKeys};
  const trigger=recordIncidentClockEvent(store,{...common,kind:'TRIGGER',triggerOrClockId:'INCIDENT_DETERMINATION',ts:c.triggerTs,now:()=>c.triggerTs+60000});
  const notice=recordIncidentClockEvent(store,{...common,kind:'NOTIFIED',triggerOrClockId:'nydfs-500-17-notice',ts:c.triggerTs+71*3600000,now:()=>c.triggerTs+71*3600000});
  result={stage,incident,monitorPublicKeyPem:getPublicKeyPem(c.workspace,'monitor'),events:[trigger,notice]};
 }else if(stage==='http'){
  unlockVault(c.workspace,c.passphrase);const {handleIncidentRoute}=await load('api/incidentRouter.js');
  httpServer=createServer((req,res)=>{res.setHeader('Connection','close');
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   Promise.resolve(handleIncidentRoute(path,req.method,req,res,c.workspace)).then(handled=>{if(!handled){res.writeHead(404);res.end('{}');}})
    .catch(error=>{httpErrors.push(error.message);res.destroy(error);});});
  httpServer.on('error',error=>httpErrors.push(error.message));
  await new Promise((done,reject)=>{httpServer.once('error',reject);httpServer.listen({host:'127.0.0.1',port:0},()=>{httpServer.removeListener('error',reject);done();});});
  const port=httpServer.address().port;
  async function send(method,path,body){return await new Promise((done,reject)=>{const raw=body===undefined?undefined:Buffer.from(JSON.stringify(body));
   const q=request({host:'127.0.0.1',port,path,method,agent:false,headers:{Connection:'close',...(raw?{'Content-Type':'application/json','Content-Length':String(raw.length)}:{})}},r=>{
    const chunks=[];let size=0;r.on('error',reject);r.on('data',b=>{size+=b.length;if(size>1048576){r.destroy(new Error('Owned HTTP response exceeds bound'));return;}chunks.push(b);});
    r.on('end',()=>{try{done({status:r.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))});}catch(error){reject(error);}});});
   q.on('error',reject);q.setTimeout(2000,()=>q.destroy(new Error('Owned HTTP observation deadline')));q.end(raw);});}
  const path='/api/v1/incidents/'+c.incidentId,now=encodeURIComponent(c.nowIso);
  const listing=await send('GET',path+'/clocks?station=wealth&now='+now);
  const invalid=await send('GET',path+'/clocks?station=not-a-station&now='+now);
  const missing=await send('GET','/api/v1/incidents/incident-missing/clocks?station=wealth&now='+now);
  const badEvent=await send('POST',path+'/clock-events',{station:'wealth',trigger:'NOT_A_TRIGGER',at:c.triggerIso});
  const created=await send('POST',path+'/clock-events',{station:'wealth',trigger:'EXTORTION_PAYMENT',at:c.triggerIso});
  const after=await send('GET',path+'/clocks?station=wealth&now='+now);
  result={stage,listing,invalid,missing,badEvent,created,after,transport:'owned-loopback-http',principalSupplied:false};
 }else if(stage==='mcp'){
  const {Client}=await sdk('client/index.js'),{InMemoryTransport}=await sdk('inMemory.js'),{CallToolResultSchema}=await sdk('types.js');
  const {createAmcMcpServer}=await load('mcp/amcMcpServer.js');mcp=createAmcMcpServer(c.workspace);client=new Client({name:'p117-clock-surface-fixture',version:'1'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();await mcp.connect(serverTransport);await client.connect(clientTransport);
  const tools=await client.listTools();
  const call=async args=>CallToolResultSchema.parse(await client.callTool({name:'amc_incident_clocks',arguments:{workspace:c.workspace,...args}}));
  const listing=await call({incidentId:c.incidentId,station:'wealth',now:c.nowIso});
  const invalid=await call({incidentId:c.incidentId,station:'not-a-station',now:c.nowIso});
  const missing=await call({incidentId:'incident-missing',station:'wealth',now:c.nowIso});
  result={stage,tools:tools.tools.map(x=>({name:x.name,description:x.description})),listing,invalid,missing,transport:'actual-sdk-linked-memory'};
 }else throw new Error('Unknown owned fixture stage');
}catch(error){failure=error;}
finally{
 if(httpServer)try{await new Promise((done,reject)=>httpServer.close(error=>error?reject(error):done()));httpClosed=true;}catch(error){cleanup.push(error);}
 if(client)try{await client.close();clientClosed=true;}catch(error){cleanup.push(error);}
 if(mcp)try{await mcp.close();serverClosed=true;}catch(error){cleanup.push(error);}
 if(ledger)try{ledger.close();}catch(error){cleanup.push(error);}
 try{closeAllSqlitePools();}catch(error){cleanup.push(error);}try{lockVault(c.workspace);}catch(error){cleanup.push(error);}
}
if(failure||cleanup.length)throw new AggregateError([failure,...cleanup].filter(x=>x!==undefined),'Owned incident surface body or natural cleanup failed');
if(httpErrors.length)throw new AggregateError(httpErrors.map(x=>new Error(x)),'Owned HTTP server errors');
writeFileSync(c.resultFile,JSON.stringify({...result,lifecycle:{httpClosed,clientClosed,serverClosed,httpErrors}},null,2)+'\n',{flag:'wx',mode:0o600});
`;

interface ChildProof {
  label: string; pid: number | undefined; argv: string[]; exit: number | null; signal: NodeJS.Signals | null;
  spawnError: string | null; streamsClosed: boolean; absentByESRCH: boolean; pidProbes: string[];
  truncated: boolean; captureErrors: string[]; environmentKeys: string[];
  stdout: { path: string; bytes: number; sha256: string }; stderr: { path: string; bytes: number; sha256: string };
}
async function child(root: string, workspace: string, label: string, args: string[], env: NodeJS.ProcessEnv): Promise<ChildProof> {
  const names = ["stdout", "stderr"] as const, paths = { stdout: join(root, label + ".stdout.log"), stderr: join(root, label + ".stderr.log") };
  const fds = { stdout: openSync(paths.stdout, "wx", 0o600), stderr: openSync(paths.stderr, "wx", 0o600) };
  const chunks: Record<typeof names[number], Buffer[]> = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
  const p = spawn(NODE, args, { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  let spawnError: string | null = null, truncated = false; const captureErrors: string[] = [];
  p.once("error", error => { spawnError = error.message; });
  for (const name of names) {
    p[name]!.on("error", error => captureErrors.push(`${name}: ${error.message}`));
    p[name]!.on("data", (raw: Buffer) => {
      sizes[name] += raw.length;
      if (sizes[name] > 2_097_152) { truncated = true; return; }
      const b = Buffer.from(raw); chunks[name].push(b);
      try {
        let offset = 0;
        while (offset < b.length) { const count = writeSync(fds[name], b, offset, b.length - offset); if (count < 1) throw new Error("Incomplete stream capture"); offset += count; }
      } catch (error) { captureErrors.push(`${name} capture: ${(error as Error).message}`); }
    });
  }
  const result = await new Promise<ChildProof>(done => p.once("close", (exit, signal) => {
    void (async () => {
      for (const fd of Object.values(fds)) try { closeSync(fd); } catch (error) { captureErrors.push(`capture close: ${(error as Error).message}`); }
      let absentByESRCH = false; const pidProbes: string[] = [], until = performance.now() + 5000;
      if (p.pid !== undefined) do {
        try { process.kill(p.pid, 0); pidProbes.push("present"); }
        catch (error) { const code = (error as NodeJS.ErrnoException).code ?? "unknown"; pidProbes.push(code); if (code === "ESRCH") absentByESRCH = true; else captureErrors.push(`PID ${code}`); break; }
        await new Promise(wait => setTimeout(wait, 50));
      } while (performance.now() < until);
      const stream = (name: typeof names[number]) => ({ path: paths[name], bytes: sizes[name], sha256: digest(Buffer.concat(chunks[name])) });
      done({ label, pid: p.pid, argv: [NODE, ...args], exit, signal, spawnError, streamsClosed: true, absentByESRCH, pidProbes,
        truncated, captureErrors, environmentKeys: Object.keys(env).sort(), stdout: stream("stdout"), stderr: stream("stderr") });
    })().catch(error => {
      captureErrors.push(`closure: ${(error as Error).message}`);
      done({ label, pid: p.pid, argv: [NODE, ...args], exit, signal, spawnError, streamsClosed: true, absentByESRCH: false, pidProbes: [],
        truncated, captureErrors, environmentKeys: Object.keys(env).sort(), stdout: { path: paths.stdout, bytes: sizes.stdout, sha256: "unavailable" }, stderr: { path: paths.stderr, bytes: sizes.stderr, sha256: "unavailable" } });
    });
  }));
  write(join(root, label + ".child.json"), result);
  expect(result.spawnError).toBe(null); expect(result.signal).toBe(null); expect(result.exit).toBe(0);
  expect(result.streamsClosed).toBe(true); expect(result.absentByESRCH).toBe(true); expect(result.truncated).toBe(false); expect(result.captureErrors).toEqual([]);
  for (const name of names) {
    const bytes = readFileSync(result[name].path); expect(bytes.length).toBe(result[name].bytes); expect(digest(bytes)).toBe(result[name].sha256);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  return result;
}
async function fixture(body: (f: { root: string; workspace: string; seed: Json; run(stage: "http" | "mcp"): Promise<Json>; cli(): Promise<Json>; observe(value: unknown): void }) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync("/private/tmp/p117-surface-")); chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), home = join(root, "home"), checkpoints = join(root, "checkpoints");
  for (const path of [workspace, home, checkpoints]) mkdirSync(path, { mode: 0o700 });
  const passphrase = randomBytes(24).toString("hex"), script = join(root, "surface-driver.mjs");
  writeFileSync(script, DRIVER, { flag: "wx", mode: 0o600 });
  const env: NodeJS.ProcessEnv = { PATH: `${dirname(NODE)}:/usr/bin:/bin`, HOME: home, AMC_HOME: home, TMPDIR: root, LANG: "C", LC_ALL: "C", TZ: "UTC", NO_COLOR: "1",
    AMC_VAULT_PASSPHRASE: passphrase, AMC_VAULT_REMEMBER: "false", AMC_NO_SIGN: "0", AMC_OTEL_ENABLED: "false", AMC_LEDGER_SQLITE_SYNCHRONOUS: "FULL",
    AMC_CONTROL_CHECKPOINT_DIR: checkpoints, AMC_GUARD_EVENTS_DB_PATH: join(root, "guard.sqlite"), AMC_GUARD_RECEIPTS_WORKSPACE: workspace };
  const inputPins = [CLI, ...["api/incidentRouter.js", "incidents/incidentClockEvents.js", "incidents/incidentStore.js", "mcp/amcMcpServer.js", "workspace.js",
    "ledger/ledger.js", "storage/sqlitePool.js", "vault/vault.js", "crypto/keys.js", "utils/json.js", "utils/hash.js"].map(path => join(SOURCE, "dist", path)),
    ...["client/index.js", "inMemory.js", "types.js"].map(path => join(SOURCE, "node_modules/@modelcontextprotocol/sdk/dist/esm", path))]
    .map(path => ({ path, sha256: digest(readFileSync(path)) }));
  const observations: unknown[] = []; let success = false, failure: unknown, expectedMonitorSha256: string | undefined;
  const incidentId = "incident-p117-owned", config = { buildRoot: SOURCE, workspace, passphrase, incidentId, triggerTs: T,
    triggerIso: new Date(T).toISOString(), nowIso: new Date(NOW).toISOString() };
  async function run(stage: "init" | "seed" | "http" | "mcp"): Promise<Json> {
    const configFile = join(root, stage + ".config.json"), resultFile = join(root, stage + ".result.json");
    write(configFile, { ...config, resultFile, expectedMonitorSha256 }); const proof = await child(root, workspace, stage, [script, stage, configFile], env);
    observations.push({ child: proof }); const result = json(resultFile); observations.push({ result }); return result;
  }
  try {
    const init = await run("init"), monitorPublicKeyPem = String(init.monitorPublicKeyPem);
    expectedMonitorSha256 = digest(monitorPublicKeyPem);
    writeFileSync(join(root, "monitor-anchor.pem"), monitorPublicKeyPem, { flag: "wx", mode: 0o600 });
    observations.push({ monitorAnchorBeforeSeed: { path: join(root, "monitor-anchor.pem"), sha256: expectedMonitorSha256 } });
    const seed = await run("seed"), incident = object(seed.incident), { signature, ...signedPayload } = incident;
    expect(seed.monitorPublicKeyPem).toBe(monitorPublicKeyPem);
    expect(verify(null, Buffer.from(digest(canonical(signedPayload)), "hex"), monitorPublicKeyPem, Buffer.from(String(signature), "base64"))).toBe(true);
    expect(lstatSync(join(workspace, ".amc/vault.amcvault")).isFile()).toBe(true);
    await body({ root, workspace, seed, run,
      async cli() {
        const proof = await child(root, workspace, "cli", [CLI, "incident", "clocks", incidentId, "--station", "wealth", "--now", new Date(NOW).toISOString(), "--json"], env);
        observations.push({ child: proof }); const result = json(proof.stdout.path); observations.push({ cli: result }); return result;
      }, observe(value) { observations.push(value); } });
    for (const pin of inputPins) expect(digest(readFileSync(pin.path))).toBe(pin.sha256);
    success = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const record = { schema: "p117-incident-surface-observation/1", root, workspace, retained: true, sourceRoot: SOURCE, success, inputPins,
      driverSha256: digest(DRIVER), observations, authorityLimit: "Local workspace signatures and stated operator times; no authenticated-person or outer HTTP authentication proof" };
    try { write(join(root, "surface-observations.json"), record); process.stdout.write(`AMC_P117_SURFACE_OBSERVATION ${JSON.stringify(record)}\n`); }
    catch (error) { if (failure !== undefined) throw new AggregateError([failure, error], "Surface test and observation publication failed"); throw error; }
  }
}
function listing(value: unknown): void {
  const data = object(value); expect(data.incidentId).toBe("incident-p117-owned"); expect(data.station).toBe("wealth"); expect(data.now).toBe(new Date(NOW).toISOString());
  const clocks = data.clocks as Json[]; expect(clocks.filter(clock => US_IDS.includes(String(clock.clockId))).map(clock => clock.clockId)).toEqual(US_IDS);
  const notice = clocks.find(clock => clock.clockId === "nydfs-500-17-notice")!;
  expect(notice.status).toBe("SATISFIED"); expect(notice.triggerTs).toBe(T); expect(notice.dueTs).toBe(T + 72 * HOUR);
  const events = data.events as Json[]; expect(events).toHaveLength(2);
  expect(events.map(event => ({ kind: event.kind, triggerOrClockId: event.triggerOrClockId, at: event.at, recordedBy: event.recordedBy }))).toEqual([
    { kind: "TRIGGER", triggerOrClockId: "INCIDENT_DETERMINATION", at: new Date(T).toISOString(), recordedBy: "owned-fixture-clock" },
    { kind: "NOTIFIED", triggerOrClockId: "nydfs-500-17-notice", at: new Date(T + 71 * HOUR).toISOString(), recordedBy: "owned-fixture-clock" }
  ]);
  expect((data.notes as string[]).join(" ")).toContain("operator claims"); expect((data.notes as string[]).join(" ")).toContain("does not file notices");
}
describe("P1-17 actual incident-clock surfaces", () => {
  test("the compiled CLI lists a genuinely signed fixed-date stored incident and its verified clock events as JSON", async () => {
    await fixture(async f => { listing(await f.cli()); });
  });
  test("the actual HTTP route returns 200/201/400/404 over owned loopback and persists a genuine event without a fabricated principal", async () => {
    await fixture(async f => {
      const out = await f.run("http"); expect(out.transport).toBe("owned-loopback-http"); expect(out.principalSupplied).toBe(false);
      const initial = object(out.listing); expect(initial.status).toBe(200); expect(object(initial.body).ok).toBe(true); listing(object(initial.body).data);
      expect(object(out.invalid).status).toBe(400); expect(object(out.missing).status).toBe(404); expect(object(out.badEvent).status).toBe(400);
      expect(object(object(out.invalid).body).error).toContain("unknown station");
      expect(object(object(out.missing).body).error).toBe("Incident not found");
      expect(object(object(out.badEvent).body).error).toContain("unknown trigger");
      expect(object(out.created).status).toBe(201); const created = object(object(object(out.created).body).data);
      expect(created.kind).toBe("TRIGGER"); expect(created.triggerOrClockId).toBe("EXTORTION_PAYMENT"); expect(created.recordedBy).toBe("api"); expect(created.ts).toBe(T);
      const after = object(object(object(out.after).body).data); const events = after.events as Json[]; expect(events).toHaveLength(3);
      expect(events.filter(row => row.eventId === created.eventId)).toHaveLength(1);
      expect(object(out.lifecycle).httpClosed).toBe(true); expect(object(out.lifecycle).httpErrors).toEqual([]);
      f.observe({ routeAuthenticationClaimed: false, studioDelegationClaimed: false });
    });
  });
  test("the genuine MCP SDK client lists and invokes the read-only clock tool with conservative claims and natural transport closure", async () => {
    await fixture(async f => {
      const out = await f.run("mcp"); const tools = out.tools as Json[];
      expect(tools).toHaveLength(11);
      expect(tools.filter(row => row.name === "amc_incident_clocks")).toHaveLength(1);
      expect(String(tools.find(row => row.name === "amc_incident_clocks")!.description)).toContain("read-only");
      const result = object(out.listing); expect(result.isError ?? false).toBe(false); const structured = object(result.structuredContent); listing(structured);
      expect(structured.claimKind).toBe("self_reported"); expect(object(structured.statusDimensions).result).toBe("not_evaluated");
      expect((result.content as Json[]).some(row => String(row.text).includes("Claim kinds: see docs/CLAIM_KINDS.md"))).toBe(true);
      expect(object(out.invalid).isError).toBe(true); expect(object(out.missing).isError).toBe(true);
      expect((object(out.invalid).content as Json[]).some(row => String(row.text).includes("unknown station"))).toBe(true);
      expect((object(out.missing).content as Json[]).some(row => String(row.text).includes("Incident not found"))).toBe(true);
      expect(object(out.lifecycle).clientClosed).toBe(true); expect(object(out.lifecycle).serverClosed).toBe(true);
      expect(out.transport).toBe("actual-sdk-linked-memory");
    });
  });
});
