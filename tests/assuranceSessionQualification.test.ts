import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

const repo = resolve(__dirname, "..");
let evidence: string;
const ownedStates: string[] = [];
const reportSchema = z.object({ caseName: z.string(), success: z.boolean(), node: z.string(),
  originalError: z.unknown().optional(), fatal: z.unknown().optional(), checks: z.record(z.string(), z.unknown()) }).passthrough();

// The child runs real built APIs. Only transport is denied; no runner, responder, ledger or crypto method is mocked.
const helper = String.raw`
import assert from 'node:assert/strict';
import { verify, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const request=JSON.parse(readFileSync(process.argv[2],'utf8'));
const {root,caseName,caseDir,mode='supervise',noSign=false}=request;
assert.equal(Number(process.versions.node.split('.')[0]),22);
const moduleAt=path=>pathToFileURL(join(root,'dist',path)).href;
const {initWorkspace}=await import(moduleAt('workspace.js'));
const {openLedger,verifyLedgerIntegrity,hashBinaryOrPath}=await import(moduleAt('ledger/ledger.js'));
const {runAssurance}=await import(request.runnerModule??moduleAt('assurance/assuranceRunner.js'));
const {startAssuranceSession,sealAbortedAssuranceSession}=await import(moduleAt('assurance/evidenceWriters.js'));
const {AgentResponderUnavailableError}=await import(moduleAt('assurance/agentResponder.js'));
const {getPublicKeyPem}=await import(moduleAt('crypto/keys.js'));
const {ed25519KeyId}=await import(moduleAt('trust/index.js'));
const {closeSqlitePool}=await import(moduleAt('storage/sqlitePool.js'));
const state=join(caseDir,'state'),workspace=join(state,'workspace');mkdirSync(workspace,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const handles=[];
const open=(options={})=>{const ledger=openLedger(workspace,options);handles.push(ledger);return ledger;};
function errorValue(error){return error instanceof Error?{name:error.name,message:error.message,code:error.code??null,
 reason:error.reason??null,cause:error.cause?errorValue(error.cause):null}:{thrown:String(error)};}
function fileState(path){if(!existsSync(path))return{path,exists:false};const stat=lstatSync(path);return{path,exists:true,
 mode:stat.mode,inode:stat.ino,links:stat.nlink,bytes:stat.size,sha256:sha(readFileSync(path))};}
function mainBytes(){const db=join(workspace,'.amc/evidence.sqlite');return['','-wal','-shm'].map(suffix=>fileState(db+suffix));}
function rows(ledger){return Object.fromEntries(['sessions','evidence_events','assurance_runs'].map(table=>[table,
 ledger.db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()]));}
function filesUnder(path){if(!existsSync(path))return[];const result=[];function walk(p){const stat=lstatSync(p);
 if(stat.isDirectory()){for(const name of readdirSync(p).sort())walk(join(p,name));}
 else result.push({path:p,kind:stat.isSymbolicLink()?'link':'file',...(stat.isSymbolicLink()?{target:readlinkSync(p)}:{bytes:stat.size,sha256:sha(readFileSync(p))})});}walk(path);return result;}
let monitorPem,monitorFingerprint,trust;
function verifyRows(ledger,sessionId){const events=ledger.getAllEvents().filter(row=>row.session_id===sessionId);
 const session=ledger.db.prepare('SELECT * FROM sessions WHERE session_id=?').get(sessionId);
 assert(events.length>0);for(const event of events){assert.notEqual(event.writer_sig,'unsigned');
  assert(verify(null,Buffer.from(event.event_hash,'hex'),monitorPem,Buffer.from(event.writer_sig,'base64')));}
 assert(session.ended_ts!==null);assert.equal(session.session_final_event_hash,events.at(-1).event_hash);
 assert(verify(null,Buffer.from(session.session_final_event_hash,'hex'),monitorPem,Buffer.from(session.session_seal_sig,'base64')));
 return{session,events};}
function operational(ledger,label){const sessionId='p0-27-operational-'+label;
 ledger.startSession({sessionId,runtime:'unknown',binaryPath:'p0-27-owned-operational-control',binarySha256:hashBinaryOrPath('p0-27-owned-operational-control','1')});
 ledger.appendEvidence({sessionId,runtime:'unknown',eventType:'audit',payload:JSON.stringify({operation:label}),payloadExt:'json',inline:true,
 meta:{agentId:'default',source:'p0-27-owned-operational-control'}});ledger.sealSession(sessionId);return verifyRows(ledger,sessionId);}
async function aborted(){let caught;try{await runAssurance({workspace,agentId:'default',packId:'injection',mode,window:'14d',model:'p0-27-offline-model',noSign});}
 catch(error){caught=error;}assert(caught instanceof AgentResponderUnavailableError);assert.equal(caught.code,'AGENT_RESPONDER_UNAVAILABLE');
 assert.match(caught.reason,/credential|not set/);return caught;}
function assertAbortRows(ledger){const all=rows(ledger);const sessions=all.sessions.filter(row=>row.binary_path==='amc-assurance-runner');
 assert.equal(sessions.length,1);const events=all.evidence_events.filter(row=>row.session_id===sessions[0].session_id);
 const audits=events.map(row=>JSON.parse(row.meta_json));assert.equal(audits.filter(row=>row.auditType==='ASSURANCE_RUN_STARTED').length,1);
 const aborts=audits.filter(row=>row.auditType==='ASSURANCE_RUN_ABORTED');assert.equal(aborts.length,1);assert.equal(aborts[0].reason,'AgentResponderUnavailableError');
 assert.equal(events.length,mode==='sandbox'?3:2);assert(events.every(row=>row.event_type==='audit'));
 assert.equal(all.assurance_runs.length,0);assert.equal(filesUnder(join(workspace,'.amc/agents/default/reports/assurance')).length,0);
 return{all,session:sessions[0],events};}
const report={caseName,node:process.version,executable:process.execPath,runnerModule:request.runnerModule??moduleAt('assurance/assuranceRunner.js'),success:false,checks:{},originalError:null};
try{
 delete process.env.AMC_NO_SIGN;
 initWorkspace({workspacePath:workspace,trustBoundaryMode:'isolated'});
 monitorPem=getPublicKeyPem(workspace,'monitor');monitorFingerprint=sha(Buffer.from(monitorPem,'utf8'));
 trust={mode:'pinned',asOf:new Date(),lists:[],explicitPins:[{keyId:ed25519KeyId(monitorPem),purposes:['ledger-row'],origin:'owned operator record before session'}],distrust:[],allowUnpinned:false,allowUnanchored:false};
 writeFileSync(join(caseDir,'monitor-before-artifacts.json'),JSON.stringify({capturedAt:new Date().toISOString(),publicKeyPem:monitorPem,monitorFingerprint,trust},null,2)+'\n',{mode:0o600});
 report.monitorFingerprint=monitorFingerprint;
 const ledger=open();
 if(caseName==='signed-abort'){
  const error=await aborted();report.originalError=errorValue(error);assert.equal(error.cause,undefined);
  const found=assertAbortRows(ledger);report.checks.abort=found;report.checks.crypto=verifyRows(ledger,found.session.session_id);
  const integrity=verifyLedgerIntegrity(workspace,{expectedMonitorFingerprint:monitorFingerprint,trust});
  assert.equal(integrity.ok,true);assert.equal(integrity.chain.ok,true);assert.equal(integrity.trustRoot.anchored,true);report.checks.integrity=integrity;
 }else if(caseName==='unsigned-abort'){
  report.checks.beforeOperational=operational(ledger,'before');const beforeRows=rows(ledger),beforeBytes=mainBytes();
  process.env.AMC_NO_SIGN='1';const error=await aborted();report.originalError=errorValue(error);assert.equal(error.cause,undefined);
  // Capture DB/WAL/SHM BEFORE a signed reader can change coordination sidecars.
  const afterBytes=mainBytes();assert.deepEqual(afterBytes,beforeBytes);const afterRows=rows(ledger);assert.deepEqual(afterRows,beforeRows);
  report.checks.signedStoreDuringUnsigned={beforeBytes,afterBytes,beforeRows,afterRows};
  const unsigned=open({store:'unsigned',readonly:true});const found=assertAbortRows(unsigned);
  assert(found.events.every(row=>row.writer_sig==='unsigned'));assert.equal(found.session.session_seal_sig,'unsigned');
  assert(found.session.ended_ts!==null);report.checks.unsigned=found;
  delete process.env.AMC_NO_SIGN;report.checks.afterOperational=operational(ledger,'after');
  assert(ledger.getAllEvents().every(row=>row.writer_sig!=='unsigned'));
  const integrity=verifyLedgerIntegrity(workspace,{expectedMonitorFingerprint:monitorFingerprint,trust});
  assert.equal(integrity.ok,true);assert.equal(integrity.chain.ok,true);assert.equal(integrity.trustRoot.anchored,true);report.checks.integrity=integrity;
 }else if(caseName==='first-row-fault'){
  ledger.db.exec("CREATE TRIGGER p0_27_first_row_fault BEFORE INSERT ON evidence_events WHEN json_extract(NEW.meta_json,'$.auditType')='ASSURANCE_RUN_STARTED' BEGIN SELECT RAISE(ABORT,'P0_27_FIRST_ROW_FAULT'); END");
  const before=rows(ledger),beforeBlobs=filesUnder(join(workspace,'.amc/blobs'));let error;
  try{startAssuranceSession({ledger,mode:'supervise',agentId:'default',packIds:['injection'],trustTier:'OBSERVED'});}catch(caught){error=caught;}
  assert(error instanceof Error);assert.match(error.message,/P0_27_FIRST_ROW_FAULT/);assert.equal(ledger.db.inTransaction,false);
  const after=rows(ledger),afterBlobs=filesUnder(join(workspace,'.amc/blobs'));assert.deepEqual(after,before);assert.deepEqual(afterBlobs,beforeBlobs);
  report.originalError=errorValue(error);report.checks.rollback={before,after,beforeBlobs,afterBlobs,inTransaction:ledger.db.inTransaction};
  ledger.db.exec('DROP TRIGGER p0_27_first_row_fault');
  const id=startAssuranceSession({ledger,mode:'supervise',agentId:'default',packIds:['injection'],trustTier:'OBSERVED'});
  ledger.sealSession(id);report.checks.healthyRetry=verifyRows(ledger,id);
 }else if(caseName==='seal-fault'||caseName==='seal-helper-identity'){
  ledger.db.exec("CREATE TRIGGER p0_27_seal_fault BEFORE UPDATE ON sessions WHEN OLD.binary_path='amc-assurance-runner' AND NEW.session_seal_sig IS NOT NULL BEGIN SELECT RAISE(ABORT,'P0_27_ABORT_SEAL_FAULT'); END");
  let error;
  if(caseName==='seal-fault')error=await aborted();
  else{const id=startAssuranceSession({ledger,mode:'supervise',agentId:'default',packIds:['injection'],trustTier:'OBSERVED'});
   error=new AgentResponderUnavailableError('owned unavailable fixture','owned remediation');
   assert.equal(sealAbortedAssuranceSession({ledger,sessionId:id,runId:'owned-helper-run',agentId:'default',error}),error);
   report.checks.originalObjectIdentityRetained=true;}
  assert(error instanceof AgentResponderUnavailableError);assert.equal(error.name,'AgentResponderUnavailableError');
  assert(error.cause instanceof Error);assert.match(error.cause.message,/P0_27_ABORT_SEAL_FAULT/);
  report.originalError=errorValue(error);const found=assertAbortRows(ledger);report.checks.abort=found;
  assert.equal(found.session.ended_ts,null);assert.equal(found.session.session_final_event_hash,null);assert.equal(found.session.session_seal_sig,null);
  const integrity=verifyLedgerIntegrity(workspace,{expectedMonitorFingerprint:monitorFingerprint,trust});
  assert.equal(integrity.chain.ok,false);assert(integrity.chain.errors.some(message=>message.includes('missing seal')));report.checks.integrity=integrity;
  ledger.db.exec('DROP TRIGGER p0_27_seal_fault');
 }else if(caseName==='store-guard'){
  const beforeRows=rows(ledger),before=mainBytes();assert(!existsSync(join(workspace,'.amc/unsigned/evidence.sqlite')));
  assert.throws(()=>openLedger(workspace,{store:'unsigned'}),/only for AMC_NO_SIGN=1/);
  assert(!existsSync(join(workspace,'.amc/unsigned/evidence.sqlite')));assert.deepEqual(mainBytes(),before);assert.deepEqual(rows(ledger),beforeRows);
  report.checks.refusedDiversion={beforeRows,afterRows:rows(ledger),beforeBytes:before,afterBytes:mainBytes(),unsignedPathExists:false};
 }else throw new Error('unsupported owned case');
 report.success=true;
}catch(error){report.fatal=errorValue(error);}
finally{
 for(const ledger of handles)ledger.close();
 for(const path of [join(workspace,'.amc/evidence.sqlite'),join(workspace,'.amc/unsigned/evidence.sqlite')])closeSqlitePool('ledger:'+resolve(workspace)+':'+path);
 report.transportBlocked=true;report.providerCredentialKeysPresent=Object.keys(process.env).filter(key=>/^(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|AWS|AZURE|BEDROCK|COHERE|GROQ|MISTRAL|DEEPSEEK).*(?:KEY|TOKEN|SECRET|CREDENTIAL)/.test(key));
 writeFileSync(join(caseDir,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify({caseName,success:report.success,fatal:report.fatal??null}));
process.exitCode=report.success?0:1;
`;

beforeAll(() => {
  expect(Number(process.versions.node.split(".")[0])).toBe(22);
  evidence = mkdtempSync("/private/tmp/p0-27-session-evidence-");
  writeFileSync(join(evidence, "actual-session-helper.mjs"), helper, { mode: 0o600 });
  writeFileSync(join(evidence, "deny-transport.mjs"),
    "import http from 'node:http';import https from 'node:https';import net from 'node:net';import dns from 'node:dns';import {syncBuiltinESMExports} from 'node:module';"
    + "const deny=()=>{throw new Error('P0_27_OWNED_TRANSPORT_DENIED');};http.request=http.get=https.request=https.get=deny;"
    + "net.connect=net.createConnection=deny;net.Socket.prototype.connect=deny;dns.lookup=dns.resolve=deny;globalThis.fetch=deny;syncBuiltinESMExports();\n",
    { mode: 0o600 });
});

afterAll(() => {
  for (const state of ownedStates) rmSync(state, { recursive: true, force: true });
}, 120_000);

function execute(caseName: string, suffix: string, mode: "supervise" | "sandbox" = "supervise", noSign = false) {
  const caseDir = join(evidence, suffix);
  const state = join(caseDir, "state");
  mkdirSync(join(state, "home"), { recursive: true });
  ownedStates.push(state);
  const request = join(caseDir, "request.json");
  writeFileSync(request, JSON.stringify({ root: repo, caseName, caseDir, mode, noSign }), { mode: 0o600 });
  const environment = { HOME: join(state, "home"), AMC_HOME: join(state, "home"), PATH: dirname(process.execPath),
    AMC_CONTROL_CHECKPOINT_DIR: join(state, "checkpoints"), AMC_VAULT_PASSPHRASE: "p0-27-owned-session-passphrase",
    AMC_AGENT_BASE_URL: "http://127.0.0.1:1", NODE_OPTIONS: "--import=" + join(evidence, "deny-transport.mjs"), TZ: "UTC", LANG: "C" };
  const child = spawnSync(process.execPath, [join(evidence, "actual-session-helper.mjs"), request],
    { cwd: caseDir, env: environment, encoding: "utf8", timeout: 60_000 });
  writeFileSync(join(caseDir, "stdout.log"), child.stdout ?? "", { mode: 0o600 });
  writeFileSync(join(caseDir, "stderr.log"), child.stderr ?? "", { mode: 0o600 });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status, `${child.stdout}\n${child.stderr}\nEvidence: ${caseDir}`).toBe(0);
  const report = reportSchema.parse(JSON.parse(readFileSync(join(caseDir, "result.json"), "utf8")));
  expect(report.success).toBe(true);
  expect(report.fatal).toBeUndefined();
  expect(report.providerCredentialKeysPresent).toEqual([]);
}

describe("P0-27 actual assurance session and isolated unsigned evidence", () => {
  test.each(["supervise", "sandbox"] as const)("a real unavailable resolver seals the signed %s abort without a fabricated report", mode => {
    execute("signed-abort", "signed-" + mode, mode);
  }, 75_000);

  test.each([false, true])("AMC_NO_SIGN=1 isolates aborts and preserves signed DB bytes/rows, noSign=%s", noSign => {
    execute("unsigned-abort", "unsigned-" + noSign, "supervise", noSign);
  }, 75_000);

  test("an owned first-row database fault rolls back session creation and permits a genuine sealed retry", () => {
    execute("first-row-fault", "first-row-fault");
  }, 75_000);

  test("an actual abort seal-update fault retains the original resolver error and reports the unsealed negative", () => {
    execute("seal-fault", "seal-fault");
  }, 75_000);

  test("the real abort helper returns the same error object and attaches the actual database failure", () => {
    execute("seal-helper-identity", "seal-helper-identity");
  }, 75_000);

  test("signed callers cannot divert evidence into the unsigned store", () => {
    execute("store-guard", "store-guard");
  }, 75_000);
});
