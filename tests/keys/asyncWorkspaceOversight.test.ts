import Database from "better-sqlite3";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { appendOversightRecord, createOversightRecord, readOversightRecords, oversightRecordPath, recordWorkspaceOversight,
  recordWorkspaceOversightAsync, workspaceOversightPublicKeys, verifyOversightChain } from "../../src/incidents/oversightRecord.js";
import { buildEvidencePacket } from "../../src/incidents/evidencePacket.js";
import { getPublicKeyHistory, addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { fixture, cleanupFixtures, seedIncident, oversightInput, deferred, PASS } from "../helpers/consoleOversightFixture.js";
const control=vi.hoisted(()=>({afterSign:undefined as (()=>Promise<void>)|undefined,messages:[] as Buffer[],bad:false,failAppend:"",lockAtSign:[] as boolean[]}));
vi.mock("../../src/keys/providers/file.js",async original=>{const actual=await original<typeof import("../../src/keys/providers/file.js")>();return{...actual,fileKeyProvider:(workspace:string)=>{
  const real=actual.fileKeyProvider(workspace);return{...real,async sign(...args:Parameters<typeof real.sign>){const out=await real.sign(...args);
    if(args[0].id==="artifact-seal"){control.messages.push(Buffer.from(args[1]));control.lockAtSign.push(existsSync(join(workspace,".amc/incidents/oversight/.oversight-record.lock")));await control.afterSign?.();if(control.bad)return Buffer.alloc(64);}return out;}};}};});
vi.mock("node:fs",async original=>{const actual=await original<typeof import("node:fs")>();const appendFileSync:typeof actual.appendFileSync=(...args)=>{
  if(String(args[0])===control.failAppend)throw new Error("owned /private/oversight-path PIN=private");return actual.appendFileSync(...args);
};return{...actual,appendFileSync,default:{...actual,appendFileSync}};});
afterEach(()=>{control.afterSign=undefined;control.messages=[];control.bad=false;control.failAppend="";control.lockAtSign=[];cleanupFixtures();});
function pause(){const entered=deferred(),gate=deferred();control.afterSign=async()=>{control.afterSign=undefined;entered.resolve();await gate.promise;};return{entered,gate};}
async function reached(p:ReturnType<typeof pause>,pending:Promise<unknown>){expect(await Promise.race([p.entered.promise.then(()=>"signed"),pending.then(()=>"returned",()=>"refused")])).toBe("signed");}
function setup(){const f=fixture(),incident=seedIncident(f.workspace);return{...f,incident,input:oversightInput(f.workspace,incident),path:oversightRecordPath(f.workspace,incident.incidentId)};}
function valid(f:ReturnType<typeof setup>){const rows=readOversightRecords(f.path);expect(verifyOversightChain(rows,f.incident,workspaceOversightPublicKeys(f.workspace))).toEqual({ok:true,errors:[]});return rows;}
describe("actual stored-incident async oversight publication",()=>{
  test("default record preserves independent v1 field order/raw32 Ed bytes and actual evidence-packet consumption",async()=>{
    const f=setup(),now=Date.now(),key=getSigningKey(f.workspace,"artifact-seal");f.input.reviewedTs=now;vi.spyOn(Date,"now").mockReturnValue(now);
    const record=await recordWorkspaceOversightAsync({...f.input,now:()=>now});
    const body={v:1,recordId:record.recordId,incidentId:f.incident.incidentId,incidentHash:f.incident.incident_hash,reviewerId:f.input.reviewerId,
      reviewedTs:now,recordedTs:now,decision:"ACKNOWLEDGED",rationale:f.input.rationale,clockIds:[],prevRecordHash:null};
    const hash=sha256Hex(canonicalize(body)),expected={...body,recordHash:hash,signature:sign(null,Buffer.from(hash,"hex"),key).toString("base64")};
    expect(record).toEqual(expected);expect(readFileSync(f.path,"utf8")).toBe(JSON.stringify(expected)+"\n");expect(control.messages).toEqual([Buffer.from(hash,"hex")]);expect(control.lockAtSign).toEqual([false]);
    const packet=buildEvidencePacket({incident:f.incident,station:"wealth",generatedTs:now,clocks:[],transitions:[],causalEdges:[],oversightRecords:valid(f),oversightPublicKeys:workspaceOversightPublicKeys(f.workspace)});
    expect(packet.oversight).toEqual([expect.objectContaining({signatureVerified:true,verificationErrors:[]})]);
  });
  test("caller incident/clock arrays are copied across the real Sign await",async()=>{
    const f=setup(),p=pause(),input={...f.input,incident:structuredClone(f.incident),clockIds:["nydfs-500-17-notice"]},pending=recordWorkspaceOversightAsync(input);
    try{await reached(p,pending);input.incident.incident_hash="0".repeat(64);input.clockIds[0]="mutated";input.reviewerId="mutated";p.gate.resolve();await expect(pending).resolves.toMatchObject({incidentHash:f.incident.incident_hash});
      expect(valid(f)[0]).toMatchObject({incidentHash:f.incident.incident_hash,clockIds:["nydfs-500-17-notice"],reviewerId:"owned-reviewer"});
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
  });
  test("a sync writer wins the same-file predecessor and the stale async append cannot endorse it",async()=>{
    const f=setup(),p=pause(),pending=recordWorkspaceOversightAsync(f.input);
    try{await reached(p,pending);const winner=recordWorkspaceOversight({...f.input,privateKeyPem:getSigningKey(f.workspace,"artifact-seal"),publicKeys:workspaceOversightPublicKeys(f.workspace)}),before=readFileSync(f.path);
      p.gate.resolve();await expect(pending).rejects.toThrow("oversight records changed while signing was prepared; retry");expect(readFileSync(f.path)).toEqual(before);expect(valid(f)[0]!.recordHash).toBe(winner.recordHash);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
  });
  test("a different incident append does not conflict with the selected file",async()=>{
    const f=setup(),other=seedIncident(f.workspace),p=pause(),pending=recordWorkspaceOversightAsync(f.input);
    try{await reached(p,pending);await recordWorkspaceOversightAsync(oversightInput(f.workspace,other));p.gate.resolve();await pending;expect(valid(f)).toHaveLength(1);
      expect(readOversightRecords(oversightRecordPath(f.workspace,other.incidentId))).toHaveLength(1);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
  });
  test("actual selected stored signing facts are required before Sign and compared again at final publication",async()=>{
    const f=setup(),fake={...f.incident,incidentId:"not-stored"};await expect(recordWorkspaceOversightAsync({...f.input,incident:fake})).rejects.toThrow("stored incident signing facts changed or are unavailable");expect(control.messages).toHaveLength(0);
    const p=pause(),pending=recordWorkspaceOversightAsync(f.input),db=new Database(join(f.workspace,".amc/evidence.sqlite"));
    const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='protect_incidents_immutable'").get() as {sql:string};expect(trigger.sql).toContain("BEFORE UPDATE");let dropped=false;
    try{await reached(p,pending);db.exec("DROP TRIGGER protect_incidents_immutable");dropped=true;db.prepare("UPDATE incidents SET incident_hash=? WHERE incident_id=?").run("0".repeat(64),f.incident.incidentId);
      p.gate.resolve();await expect(pending).rejects.toThrow("stored incident signing facts changed or are unavailable");expect(existsSync(f.path)).toBe(false);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);try{if(dropped){db.prepare("UPDATE incidents SET incident_hash=? WHERE incident_id=?").run(f.incident.incident_hash,f.incident.incidentId);db.exec(trigger.sql);}}finally{db.close();}}
    await recordWorkspaceOversightAsync(f.input);expect(valid(f)).toHaveLength(1);
  });
  test("full purpose authority is checked after a real final-callback generation change",async()=>{
    const f=setup();let generation=0;
    await expect(recordWorkspaceOversightAsync({...f.input,beforePublish:()=>{generation=rotatePurposeKeys({workspace:f.workspace,purposes:["session"],passphrase:PASS}).generation;}})).rejects.toMatchObject({code:"KEY_PROVIDER_KEY_REFUSED"});
    expect(generation).toBeGreaterThan(1);expect(existsSync(f.path)).toBe(false);await recordWorkspaceOversightAsync(f.input);valid(f);
  });
  test("wrong-purpose raw-valid auditor rotation cannot become an artifact oversight predecessor",async()=>{
    const f=setup();rotatePurposeKeys({workspace:f.workspace,purposes:["config-signature"],passphrase:PASS});const pem=getSigningPublicKeyPem(f.workspace,"config-signature");
    expect(getPurposeKeyHistory(f.workspace,"artifact-seal")).not.toContain(pem);expect(getPublicKeyHistory(f.workspace,"auditor")).toContain(pem);
    const forged=createOversightRecord({...f.input,decision:"ACKNOWLEDGED",privateKeyPem:getSigningKey(f.workspace,"config-signature")});
    expect(verify(null,Buffer.from(forged.recordHash,"hex"),pem,Buffer.from(forged.signature,"base64"))).toBe(true);appendOversightRecord(f.path,forged);const before=readFileSync(f.path);
    await expect(recordWorkspaceOversightAsync(f.input)).rejects.toThrow("existing oversight records failed verification");expect(readFileSync(f.path)).toEqual(before);expect(control.messages).toHaveLength(0);
  });
  test("authenticated imported-only unbound legacy oversight stays readable without admitting other role keys",async()=>{
    const f=setup(),pair=generateKeyPairSync("ed25519"),pub=pair.publicKey.export({format:"pem",type:"spki"}).toString(),priv=pair.privateKey.export({format:"pem",type:"pkcs8"}).toString();
    addPublicKeyToHistory(f.workspace,"auditor",pub,"imported");const legacy=createOversightRecord({...f.input,decision:"ACKNOWLEDGED",privateKeyPem:priv});appendOversightRecord(f.path,legacy);
    await recordWorkspaceOversightAsync(f.input);expect(valid(f)).toHaveLength(2);lockVault(f.workspace);vi.stubEnv("AMC_VAULT_PASSPHRASE","");expect(workspaceOversightPublicKeys(f.workspace)).toContain(pub);
    vi.stubEnv("AMC_VAULT_PASSPHRASE",PASS);unlockVault(f.workspace,PASS);
  });
  test("bad checked signature never appends; a native append refusal keeps cause private and reports possible partial bytes",async()=>{
    const f=setup();control.bad=true;await expect(recordWorkspaceOversightAsync(f.input)).rejects.toMatchObject({code:"KEY_PROVIDER_KEY_REFUSED"});expect(existsSync(f.path)).toBe(false);
    control.bad=false;control.failAppend=f.path;const error=await recordWorkspaceOversightAsync(f.input).catch(e=>e);
    expect(error).toMatchObject({code:"OVERSIGHT_PUBLICATION_INCOMPLETE",appendAttempted:true,appended:false});expect(String(error)).not.toMatch(/private\/|PIN=/);expect(String(error.cause)).toContain("PIN=private");expect(existsSync(f.path)).toBe(false);
    control.failAppend="";await recordWorkspaceOversightAsync(f.input);valid(f);
  });
  test("edited previous bytes and descending reviewed chronology refuse before any new Sign",async()=>{
    const f=setup();await recordWorkspaceOversightAsync(f.input);const before=readFileSync(f.path),calls=control.messages.length;
    await expect(recordWorkspaceOversightAsync({...f.input,reviewedTs:f.input.reviewedTs-1})).rejects.toThrow("reviewedTs precedes the last record");expect(control.messages).toHaveLength(calls);
    const row=JSON.parse(before.toString());row.rationale="edited";writeFileSync(f.path,JSON.stringify(row)+"\n");
    try{await expect(recordWorkspaceOversightAsync(f.input)).rejects.toThrow("existing oversight records failed verification");expect(control.messages).toHaveLength(calls);}finally{writeFileSync(f.path,before);}
    await recordWorkspaceOversightAsync(f.input);expect(valid(f)).toHaveLength(2);
  });
  test("a callback-created independently valid oversight record wins the final JSONL CAS",async()=>{
    const f=setup(),winner=createOversightRecord({...f.input,decision:"ACKNOWLEDGED",privateKeyPem:getSigningKey(f.workspace,"artifact-seal")}),bytes=Buffer.from(JSON.stringify(winner)+"\n");
    expect(verifyOversightChain([winner],f.incident,workspaceOversightPublicKeys(f.workspace))).toEqual({ok:true,errors:[]});let reached=false;
    await expect(recordWorkspaceOversightAsync({...f.input,beforePublish:()=>{reached=true;appendFileSync(f.path,bytes);}})).rejects.toThrow("oversight records changed while signing was prepared; retry");
    expect(reached).toBe(true);expect(control.messages).toHaveLength(1);expect(readFileSync(f.path)).toEqual(bytes);expect(valid(f)).toEqual([winner]);
    await recordWorkspaceOversightAsync(f.input);expect(valid(f)).toHaveLength(2);
  });
});
