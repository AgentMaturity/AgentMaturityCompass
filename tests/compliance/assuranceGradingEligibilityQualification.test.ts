import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { ComplianceReportJson } from "../../src/compliance/mappingSchema.js";

// These are operator-authored, genuinely auditor-signed reader controls. The
// declared structured/executed metadata does not establish an actual agent
// callback, executed tool, compiled applicability plan or regulated verdict.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = process.execPath;
const evidenceRoot = process.env.P0_19_COMPLIANCE_EVIDENCE_ROOT ?? realpathSync(mkdtempSync(join(tmpdir(), "p0-19-compliance-evidence-")));
mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
const distRoot = process.env.P0_19_COMPLIANCE_DIST_ROOT ?? repo;
const replayIndex = process.env.P0_19_COMPLIANCE_REPLAY_INDEX;
const replay: Record<string, string> = replayIndex ? JSON.parse(readFileSync(replayIndex, "utf8")) : {};
const index: Record<string, string> = {};
writeFileSync(join(evidenceRoot, "location.json"), JSON.stringify({ repo, evidenceRoot, distRoot, replayIndex: replayIndex ?? null }, null, 2));

type Case = {
  name: string;
  method?: string;
  eligible?: boolean;
  score: number;
  measured: number;
  inconclusive?: number;
  evidenceStatus?: "MEASURED" | "INSUFFICIENT_EVIDENCE" | "missing";
  tamper?: "report" | "maps";
  expected: "untrusted" | "incomplete" | "sufficient";
  fail?: boolean;
  reason: string;
};
const cases: Case[] = [
  { name: "keyword-positive-refused", method: "keyword", eligible: false, score: 100, measured: 1, expected: "untrusted", reason: "keyword-graded" },
  { name: "keyword-failure-refused", method: "keyword", eligible: false, score: 20, measured: 1, expected: "untrusted", reason: "keyword-graded" },
  { name: "token-claim-refused", method: "token-claim", eligible: false, score: 100, measured: 1, expected: "untrusted", reason: "token-claim-graded" },
  { name: "legacy-missing-fields-refused", score: 100, measured: 1, expected: "untrusted", reason: "keyword-graded" },
  { name: "structured-declared-positive", method: "structured", eligible: true, score: 100, measured: 2, expected: "sufficient", reason: "no compiled plan decides" },
  { name: "executed-declared-positive", method: "executed", eligible: true, score: 100, measured: 2, expected: "sufficient", reason: "no compiled plan decides" },
  { name: "structured-measured-failure", method: "structured", eligible: true, score: 20, measured: 1, expected: "sufficient", fail: true, reason: "does not meet threshold" },
  { name: "partial-positive-refused", method: "structured", eligible: true, score: 100, measured: 1, inconclusive: 2, expected: "incomplete", reason: "2 of 3 scenarios inconclusive" },
  { name: "all-inconclusive-refused", method: "structured", eligible: true, score: 0, measured: 0, inconclusive: 2, expected: "incomplete", reason: "measured no scenario" },
  { name: "partial-measured-failure", method: "structured", eligible: true, score: 20, measured: 1, inconclusive: 2, expected: "sufficient", fail: true, reason: "does not meet threshold" },
  { name: "canned-insufficient-refused", method: "structured", eligible: true, score: 100, measured: 1, evidenceStatus: "INSUFFICIENT_EVIDENCE", expected: "incomplete", reason: "No sealed assurance run" },
  { name: "missing-evidence-status-refused", method: "structured", eligible: true, score: 100, measured: 1, evidenceStatus: "missing", expected: "incomplete", reason: "No sealed assurance run" },
  { name: "rechecksummed-report-tamper-refused", method: "structured", eligible: true, score: 100, measured: 1, tamper: "report", expected: "untrusted", reason: "failed hash, seal or run integrity verification" },
  { name: "signed-map-byte-tamper-refused", method: "structured", eligible: true, score: 100, measured: 1, tamper: "maps", expected: "untrusted", reason: "digest mismatch" }
];

const child = String.raw`
import {createHash,verify} from 'node:crypto';
import {appendFileSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,readlinkSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';
const request=JSON.parse(process.argv[1]),{input,caseDir,distRoot,replayFile}=request;
const moduleAt=rel=>pathToFileURL(join(distRoot,'dist',rel)).href;
const networkAttempts=[];const deny=(...args)=>{networkAttempts.push(typeof args[0]==='string'?args[0]:'network');throw new Error('P0_19_OFFLINE_NETWORK_REFUSAL');};
http.request=deny;http.get=deny;https.request=deny;https.get=deny;net.connect=deny;net.createConnection=deny;tls.connect=deny;globalThis.fetch=deny;
const {initWorkspace}=await import(moduleAt('workspace.js'));
const {openLedger}=await import(moduleAt('ledger/ledger.js'));
const {closeSqlitePool}=await import(moduleAt('storage/sqlitePool.js'));
const {getPublicKeyPem}=await import(moduleAt('crypto/keys.js'));
const {ed25519KeyId}=await import(moduleAt('trust/trustList.js'));
const {getAgentPaths}=await import(moduleAt('fleet/paths.js'));
const {canonicalize}=await import(moduleAt('utils/json.js'));
const {initComplianceMaps,generateComplianceReport}=await import(moduleAt('compliance/complianceEngine.js'));
const {verifiedAssuranceByPack}=await import(moduleAt('compliance/evidenceBinding.js'));
const sha=value=>createHash('sha256').update(value).digest('hex');
function files(root){const result=[];function walk(path){if(!existsSync(path))return;const st=lstatSync(path);if(st.isDirectory()){for(const n of readdirSync(path).sort())walk(join(path,n));}
else result.push({path,mode:st.mode,links:st.nlink,...(st.isSymbolicLink()?{kind:'link',target:readlinkSync(path)}:{kind:'file',bytes:st.size,sha256:sha(readFileSync(path))})});}walk(root);return result;}
function rows(workspace){const ledger=openLedger(workspace);try{return Object.fromEntries(['sessions','evidence_events','assurance_runs'].map(table=>[table,ledger.db.prepare('SELECT rowid,* FROM '+table+' ORDER BY rowid').all()]));}finally{ledger.close();}}
function observe(workspace){const beforeFiles=files(caseDir),beforeRows=rows(workspace);const report=generateComplianceReport({workspace,agentId:'default',window:'1d',framework:'SOC2'});
const now=Date.now();const binding=verifiedAssuranceByPack({workspace,agentId:'default',windowStartTs:now-86400000,windowEndTs:now});
return{report,binding:{packs:[...binding.packs.keys()],runs:[...binding.runs],unverifiable:binding.unverifiable},effects:{beforeFiles,afterFiles:files(caseDir),beforeRows,afterRows:rows(workspace)}};}
let result;
try{
 if(replayFile){const saved=JSON.parse(readFileSync(replayFile,'utf8'));process.env.AMC_EXPECTED_MONITOR_FINGERPRINT=saved.pins.monitorPemSha256;
 result={...saved,...observe(saved.workspace),replayFile,distRoot,networkAttempts,node:process.version,executable:process.execPath};}
 else{
 const workspace=join(caseDir,'workspace');initWorkspace({workspacePath:workspace,trustBoundaryMode:'isolated'});
 const auditorPem=getPublicKeyPem(workspace,'auditor'),monitorPem=getPublicKeyPem(workspace,'monitor');
 const pins={capturedAt:new Date().toISOString(),capturedBeforeMapsAndReports:true,auditorPem,monitorPem,auditorKeyId:ed25519KeyId(auditorPem),monitorKeyId:ed25519KeyId(monitorPem),monitorPemSha256:sha(monitorPem),allowUnpinned:false,allowUnanchored:false};
 writeFileSync(join(caseDir,'pins-before-artifacts.json'),JSON.stringify(pins,null,2)+'\n',{mode:0o600});
 process.env.AMC_EXPECTED_MONITOR_FINGERPRINT=pins.monitorPemSha256;
 const map=initComplianceMaps(workspace,{complianceMaps:{version:1,mappings:[{id:'p0-19-pack-eligibility',framework:'SOC2',category:'operator reader control',description:'Signed operator-authored assurance reader control, no actual agent execution claim',evidenceRequirements:[{type:'requires_assurance_pack',packId:'toolGovernance',minScore:50,maxSucceeded:0}],related:{questions:[],packs:['toolGovernance'],configs:[]}}]}});
 const mapSig=JSON.parse(readFileSync(map.sigPath,'utf8')),mapDigest=sha(readFileSync(map.path));
 const mapProof={sha256:mapDigest,signature:mapSig.signature,verifiedWithPriorAuditorPin:verify(null,Buffer.from(mapDigest,'hex'),auditorPem,Buffer.from(mapSig.signature,'base64'))};
 const now=Date.now(),scenarios=[];
 for(let i=0;i<input.measured;i++)scenarios.push({scenarioId:'operator-measured-'+i,pass:input.score>=50,score0to100:input.score,score0to5:input.score/20,auditEventTypes:input.score<50?['TOOL_GOVERNANCE_SUCCEEDED']:[],inconclusive:false});
 for(let i=0;i<(input.inconclusive??0);i++)scenarios.push({scenarioId:'operator-inconclusive-'+i,pass:false,score0to100:0,score0to5:0,auditEventTypes:[],inconclusive:true});
 const pack={packId:'toolGovernance',score0to100:input.score,scenarioResults:scenarios,...(input.method===undefined?{}:{gradingMethod:input.method}),...(input.eligible===undefined?{}:{regulatedEligible:input.eligible})};
 const base={assuranceRunId:'p0-19-'+input.name,agentId:'default',ts:now,mode:'supervise',windowStartTs:now-1000,windowEndTs:now,trustTier:'OBSERVED',status:'VALID',verificationPassed:true,sessionId:'operator-authored-no-agent-session',...(input.evidenceStatus==='missing'?{}:{evidenceStatus:input.evidenceStatus??'MEASURED'}),packResults:[pack],overallScore0to100:input.score,integrityIndex:1,trustLabel:'OPERATOR_AUTHORED_READER_CONTROL',reportJsonSha256:'',runSealSig:''};
 const digest=sha(canonicalize(base)),ledger=openLedger(workspace);let signature;try{signature=ledger.signRunHash(digest);}finally{ledger.close();}
 const sealed={...base,reportJsonSha256:digest,runSealSig:signature};
 const reportDir=join(getAgentPaths(workspace,'default').reportsDir,'assurance');mkdirSync(reportDir,{recursive:true});const reportPath=join(reportDir,base.assuranceRunId+'.json');writeFileSync(reportPath,JSON.stringify(sealed,null,2)+'\n');
 const reportProof={sealed,digest,signature,verifiedWithPriorAuditorPin:verify(null,Buffer.from(digest,'hex'),auditorPem,Buffer.from(signature,'base64')),reportPath};
 const prior=input.tamper?observe(workspace):null;let tamperProof=null;
 if(input.tamper==='report'){const changed={...sealed,overallScore0to100:12};changed.reportJsonSha256=sha(canonicalize({...changed,reportJsonSha256:'',runSealSig:''}));writeFileSync(reportPath,JSON.stringify(changed,null,2)+'\n');tamperProof={changed,signatureUnchanged:changed.runSealSig===signature,verifiedWithPriorAuditorPin:verify(null,Buffer.from(changed.reportJsonSha256,'hex'),auditorPem,Buffer.from(changed.runSealSig,'base64'))};}
 if(input.tamper==='maps'){appendFileSync(map.path,'\n# deliberate post-signing byte tamper\n');tamperProof={signedDigest:mapDigest,changedDigest:sha(readFileSync(map.path)),signatureUnchanged:JSON.parse(readFileSync(map.sigPath,'utf8')).signature===mapSig.signature};}
 result={input,caseDir,workspace,distRoot,pins,mapProof,reportProof,tamperProof,prior,...observe(workspace),networkAttempts,node:process.version,executable:process.execPath};
 }
 for(const suffix of ['.amc/evidence.sqlite','.amc/unsigned/evidence.sqlite'])closeSqlitePool('ledger:'+resolve(result.workspace)+':'+join(result.workspace,suffix));
 writeFileSync(join(caseDir,request.phase+'.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log('P0_19_OBSERVATION '+JSON.stringify(result));
}catch(error){writeFileSync(join(caseDir,request.phase+'-setup-failure.json'),JSON.stringify({name:error.name,message:error.message,stack:error.stack,networkAttempts},null,2)+'\n',{mode:0o600});throw error;}
`;
writeFileSync(join(evidenceRoot, "child-script.mjs"), child);

type Observation = {
  pins: { capturedBeforeMapsAndReports: boolean; auditorPem: string; monitorPem: string; auditorKeyId: string; monitorKeyId: string; allowUnpinned: boolean; allowUnanchored: boolean };
  mapProof: { sha256: string; signature: string; verifiedWithPriorAuditorPin: boolean };
  reportProof: { sealed: { packResults: Array<{ scenarioResults: unknown[] }> }; digest: string; signature: string; verifiedWithPriorAuditorPin: boolean };
  report: ComplianceReportJson;
  prior: { report: ComplianceReportJson } | null;
  tamperProof: { verifiedWithPriorAuditorPin?: boolean; signatureUnchanged: boolean; signedDigest?: string; changedDigest?: string } | null;
  effects: { beforeRows: unknown; afterRows: unknown; beforeFiles: unknown[]; afterFiles: unknown[] };
  networkAttempts: string[];
  node: string;
  executable: string;
};

function observe(input: Case): Observation {
  const caseDir = replay[input.name] ? dirname(replay[input.name]) : join(evidenceRoot, input.name);
  mkdirSync(caseDir, { recursive: true, mode: 0o700 });
  const home = join(caseDir, "home"), amcHome = join(caseDir, "amc-home");
  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(amcHome, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", HOME: home, AMC_HOME: amcHome, AMC_VAULT_PASSPHRASE: "p0-19-owned-compliance-fixture", LANG: "en_US.UTF-8" };
  const phase = process.env.P0_19_COMPLIANCE_PHASE ?? "first";
  const request = { input, caseDir, distRoot, replayFile: replay[input.name], phase };
  const run = spawnSync(runtime, ["--input-type=module", "-e", child, JSON.stringify(request)], { cwd: caseDir, env, timeout: 30_000, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(evidenceRoot, `${input.name}-${phase}.stdout`), run.stdout ?? "");
  writeFileSync(join(evidenceRoot, `${input.name}-${phase}.stderr`), run.stderr ?? "");
  writeFileSync(join(evidenceRoot, `${input.name}-${phase}.process.json`), JSON.stringify({ executable: runtime, argvMode: "--input-type=module -e retained-child", request, status: run.status, signal: run.signal, error: run.error?.message ?? null }, null, 2));
  expect(run.error, run.stderr).toBeUndefined();
  expect(run.signal, run.stderr).toBeNull();
  expect(run.status, run.stderr).toBe(0);
  const line = run.stdout.split("\n").find((value) => value.startsWith("P0_19_OBSERVATION "));
  expect(line, run.stdout).toBeDefined();
  index[input.name] = replay[input.name] ?? join(caseDir, `${phase}.json`);
  writeFileSync(join(evidenceRoot, "replay-index.json"), JSON.stringify(index, null, 2));
  return JSON.parse(line!.slice("P0_19_OBSERVATION ".length));
}

describe("P0-19 actual compliance reader with signed operator grading controls", () => {
  test.each(cases)("$name", (input) => {
    const out = observe(input);
    expect(out.node).toBe(process.version);
    expect(out.executable).toBe(process.execPath);
    expect(out.networkAttempts).toEqual([]);
    expect(out.pins.capturedBeforeMapsAndReports).toBe(true);
    expect(out.pins.allowUnpinned).toBe(false);
    expect(out.pins.allowUnanchored).toBe(false);
    expect(out.pins.auditorKeyId).toMatch(/^[a-f0-9]{64}$/);
    expect(out.pins.monitorKeyId).toMatch(/^[a-f0-9]{64}$/);
    expect(out.pins.auditorKeyId).not.toBe(out.pins.monitorKeyId);
    expect(out.mapProof.verifiedWithPriorAuditorPin).toBe(true);
    expect(verify(null, Buffer.from(out.mapProof.sha256, "hex"), out.pins.auditorPem, Buffer.from(out.mapProof.signature, "base64"))).toBe(true);
    expect(out.reportProof.verifiedWithPriorAuditorPin).toBe(true);
    expect(verify(null, Buffer.from(out.reportProof.digest, "hex"), out.pins.auditorPem, Buffer.from(out.reportProof.signature, "base64"))).toBe(true);
    expect(out.reportProof.sealed.packResults).toHaveLength(1);
    expect(out.reportProof.sealed.packResults[0].scenarioResults).toHaveLength(input.measured + (input.inconclusive ?? 0));
    expect(out.reportProof.sealed.packResults[0].scenarioResults.length).toBeGreaterThan(0);
    expect(out.effects.beforeRows).toEqual(out.effects.afterRows);
    expect(out.effects.beforeFiles.length).toBeGreaterThan(0);
    expect(out.effects.afterFiles.length).toBeGreaterThan(0);
    expect(out.report.configTrusted).toBe(input.tamper !== "maps");
    expect(out.report.categories).toHaveLength(1);
    const row = out.report.categories[0];
    expect({ status: row.status, result: row.result, evidence: row.evidence }).toEqual({ status: input.fail ? "MISSING" : "NOT_EVALUATED", result: input.fail ? "fail" : "not_evaluated", evidence: input.expected });
    expect(row.dimensions.applicability.state).toBe("unresolved");
    expect(row.dimensions.review).toBe("pending");
    expect(row.reasons.join(" ")).toContain(input.reason);
    expect(out.report.coverage).toMatchObject({ satisfied: 0, partial: 0, unknown: 0, evaluated: input.fail ? 1 : 0, score: input.fail ? 0 : null });
    if (input.expected === "sufficient") {
      expect(row.admitted).toHaveLength(1);
      expect(row.admitted[0]).toMatchObject({ producerId: "amc.assuranceRunner", trustTier: "OBSERVED", ref: { kind: "assurance_report", sha256: out.reportProof.digest } });
      expect(row.claimKind).toBe("observed");
    } else {
      expect(row.admitted).toEqual([]);
      if (input.expected === "untrusted" && input.tamper !== "maps") expect(row.rejected).toHaveLength(1);
    }
    if (input.tamper) {
      expect(out.prior?.report.categories[0]).toMatchObject({ status: "NOT_EVALUATED", result: "not_evaluated", evidence: "sufficient" });
      expect(out.tamperProof?.signatureUnchanged).toBe(true);
      if (input.tamper === "report") expect(out.tamperProof?.verifiedWithPriorAuditorPin).toBe(false);
      else expect(out.tamperProof?.changedDigest).not.toBe(out.tamperProof?.signedDigest);
    }
  }, 60_000);
});
