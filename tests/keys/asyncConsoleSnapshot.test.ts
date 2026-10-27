import { sign, verify } from "node:crypto";
import { existsSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { publishConsoleSnapshotAsync } from "../../src/studio/consoleSnapshot.js";
import { pruneOpsCaches } from "../../src/ops/maintenance/cachePrune.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { registerTenant, resetDataResidencyState } from "../../src/compliance/dataResidency.js";
import { initLegalHoldRegistry, issueScopedLegalHold, releaseScopedLegalHold, holdVerdict } from "../../src/residency/legalHoldRegistry.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { fixture, cleanupFixtures, deferred, PASS } from "../helpers/consoleOversightFixture.js";
const control = vi.hoisted(() => ({afterSign: undefined as (() => Promise<void>) | undefined, bad: false,
  messages: [] as Buffer[], faultSignature: "", refreshBeforeLock: ""}));
vi.mock("../../src/keys/providers/file.js", async original => {
  const actual = await original<typeof import("../../src/keys/providers/file.js")>();
  return {...actual, fileKeyProvider: (workspace: string) => {const real = actual.fileKeyProvider(workspace);return {...real,
    async sign(...args: Parameters<typeof real.sign>) {const answer = await real.sign(...args);if(args[0].id === "artifact-seal") {
      control.messages.push(Buffer.from(args[1])); await control.afterSign?.(); if(control.bad) return Buffer.alloc(64); }return answer;}};}};
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>(); const renameSync: typeof actual.renameSync = (from, to) => {
    if (String(to) === control.faultSignature) throw new Error("owned private path /private/never-output PIN=hidden"); return actual.renameSync(from,to);
  };return {...actual,renameSync,default:{...actual,renameSync}};
});
vi.mock("../../src/lifecycle/controlFileLock.js", async original => {
  const actual = await original<typeof import("../../src/lifecycle/controlFileLock.js")>(); return {...actual,
    withControlFileLock: ((input) => {if (input.name === "console-snapshot" && control.refreshBeforeLock) {
      const path = control.refreshBeforeLock; control.refreshBeforeLock = ""; utimesSync(path,new Date(),new Date());
    }return actual.withControlFileLock(input);}) as typeof actual.withControlFileLock};
});
afterEach(() => {control.afterSign=undefined;control.bad=false;control.messages=[];control.faultSignature="";control.refreshBeforeLock="";resetDataResidencyState();cleanupFixtures();});
const payload = () => ({v:1,ts:123,studio:{running:false},agents:[{agentId:"default",latestRun:null}]});
const pair = (workspace: string) => {const path=join(workspace,".amc/studio/console-snapshot.json");return {body:existsSync(path)?readFileSync(path):null,signature:existsSync(path+".sig")?readFileSync(path+".sig"):null};};
function pause() {const entered=deferred(),gate=deferred();control.afterSign=async()=>{control.afterSign=undefined;entered.resolve();await gate.promise;};return{entered,gate};}
async function reached(p: ReturnType<typeof pause>, pending: Promise<unknown>) {expect(await Promise.race([p.entered.promise.then(()=>"signed"),pending.then(()=>"returned",()=>"refused")])).toBe("signed");}
function verifies(workspace: string) {const p=pair(workspace),body=JSON.parse(p.body!.toString()),side=JSON.parse(p.signature!.toString());
  expect(side.digestSha256).toBe(sha256Hex(Buffer.from(JSON.stringify(body))));expect(verify(null,Buffer.from(side.digestSha256,"hex"),getSigningPublicKeyPem(workspace,"artifact-seal"),Buffer.from(side.signature,"base64"))).toBe(true);}
describe("actual async console snapshot publication",()=>{
  test("default compact digest and pretty body/sidecar preserve the independent original Ed25519 wire",async()=>{
    const f=fixture(),now=Date.now(),input=payload(),key=getSigningKey(f.workspace,"artifact-seal");vi.spyOn(Date,"now").mockReturnValue(now);
    const out=await publishConsoleSnapshotAsync(f.workspace,input);const p=pair(f.workspace),digest=sha256Hex(Buffer.from(JSON.stringify(input)));
    expect(p.body!.toString()).toBe(JSON.stringify(input,null,2));expect(p.signature!.toString()).toBe(JSON.stringify({digestSha256:digest,
      signature:sign(null,Buffer.from(digest,"hex"),key).toString("base64"),signedTs:now,signer:"auditor"},null,2));
    expect(out.payload).toEqual(input);expect(control.messages).toEqual([Buffer.from(digest,"hex")]);verifies(f.workspace);
  });
  test("caller payload is copied before the actual file Sign await",async()=>{
    const f=fixture(),input=payload(),p=pause(),pending=publishConsoleSnapshotAsync(f.workspace,input);
    try {await reached(p,pending);input.agents[0]!.agentId="mutated";p.gate.resolve();const out=await pending;expect((out.payload.agents as Array<{agentId:string}>)[0]!.agentId).toBe("default");}finally{p.gate.resolve();await Promise.allSettled([pending]);}
    expect(JSON.parse(pair(f.workspace).body!.toString()).agents[0].agentId).toBe("default");verifies(f.workspace);
  });
  test("a competing real snapshot wins and stale complete-pair publication refuses",async()=>{
    const f=fixture(),p=pause(),pending=publishConsoleSnapshotAsync(f.workspace,payload());
    try{await reached(p,pending);await publishConsoleSnapshotAsync(f.workspace,{...payload(),ts:456});const winner=pair(f.workspace);p.gate.resolve();
      await expect(pending).rejects.toMatchObject({code:"CONSOLE_SNAPSHOT_UNAVAILABLE",phase:"predecessor",bodyWritten:false});expect(pair(f.workspace)).toEqual(winner);verifies(f.workspace);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
  });
  test("producer rechecks full committed authority after its actual final callback",async()=>{
    const f=fixture();await publishConsoleSnapshotAsync(f.workspace,payload());const before=pair(f.workspace);let changed=0;
    await expect(publishConsoleSnapshotAsync(f.workspace,{...payload(),ts:789},()=>{changed=rotatePurposeKeys({workspace:f.workspace,purposes:["session"],passphrase:PASS}).generation;})).rejects.toMatchObject({code:"KEY_PROVIDER_KEY_REFUSED"});
    expect(changed).toBeGreaterThan(1);expect(pair(f.workspace)).toEqual(before);await publishConsoleSnapshotAsync(f.workspace,payload());verifies(f.workspace);
  });
  test("bad real provider response never falls back to unsigned or replaces an existing pair",async()=>{
    const f=fixture();await publishConsoleSnapshotAsync(f.workspace,payload());const before=pair(f.workspace);control.bad=true;
    await expect(publishConsoleSnapshotAsync(f.workspace,{...payload(),ts:9})).rejects.toMatchObject({code:"KEY_PROVIDER_KEY_REFUSED"});expect(pair(f.workspace)).toEqual(before);
    control.bad=false;await publishConsoleSnapshotAsync(f.workspace,payload());verifies(f.workspace);
  });
  test("configured unbound provider refusal is not an optional local unsigned diagnostic",async()=>{
    const f=fixture(),actual=join(f.workspace,".amc/amc.config.yaml"); // Editable refusal policy only.
    const {writeFileSync}=await import("node:fs");const before=readFileSync(actual);const config=YAML.parse(before.toString());
    config.keys={...(config.keys??{}),refs:{...(config.keys?.refs??{}),"artifact-seal":{provider:"aws-kms",id:"arn:aws:kms:us-east-1:123456789012:key/owned-ref"}}};
    writeFileSync(actual,YAML.stringify(config));try{await expect(publishConsoleSnapshotAsync(f.workspace,payload())).rejects.toMatchObject({code:"KEY_PROVIDER_HELD"});expect(pair(f.workspace)).toEqual({body:null,signature:null});}
    finally{writeFileSync(actual,before);}await publishConsoleSnapshotAsync(f.workspace,payload());verifies(f.workspace);
  });
  test("locked local diagnostics remove a stale signature through the real hold gate, while unlocked no-sign refuses checked signing",async()=>{
    const f=fixture();await publishConsoleSnapshotAsync(f.workspace,payload());registerTenant({tenantId:"tenant-a",workspaceId:"owned-cache-workspace",region:"us-east-1"},f.workspace);initLegalHoldRegistry(f.workspace);
    const hold=issueScopedLegalHold({workspace:f.workspace,scope:{tenantId:"tenant-a",workspaceIds:[],sessionIds:[],dataKinds:["caches"]},reason:"owned cache hold",issuedBy:"owner"});
    expect(holdVerdict({workspace:f.workspace,target:{kind:"caches"}})).toMatchObject({verdict:"held"});const before=pair(f.workspace);lockVault(f.workspace);vi.stubEnv("AMC_VAULT_PASSPHRASE","");
    await expect(publishConsoleSnapshotAsync(f.workspace,{...payload(),ts:2})).rejects.toMatchObject({name:"DeletionDenied"});expect(pair(f.workspace)).toEqual(before);
    vi.stubEnv("AMC_VAULT_PASSPHRASE",PASS);unlockVault(f.workspace,PASS);expect(releaseScopedLegalHold(f.workspace,hold.holdId)).toBe(true);
    lockVault(f.workspace);vi.stubEnv("AMC_VAULT_PASSPHRASE","");vi.stubEnv("AMC_NO_SIGN","1");expect((await publishConsoleSnapshotAsync(f.workspace,payload())).sigPath).toBeNull();expect(pair(f.workspace).signature).toBeNull();
    // Signed run-hash authority refuses no-sign mode even with an unlocked vault; nothing is published.
    vi.stubEnv("AMC_VAULT_PASSPHRASE",PASS);unlockVault(f.workspace,PASS);vi.stubEnv("AMC_NO_SIGN","1");const unsigned=pair(f.workspace);
    await expect(publishConsoleSnapshotAsync(f.workspace,{...payload(),ts:3})).rejects.toThrow("no-sign mode does not authorize policy signing");expect(pair(f.workspace)).toEqual(unsigned);
    vi.stubEnv("AMC_NO_SIGN","0");expect((await publishConsoleSnapshotAsync(f.workspace,payload())).sigPath).not.toBeNull();verifies(f.workspace);
  });
  test("a native sidecar failure exposes bounded partial truth and retains its native cause privately",async()=>{
    const f=fixture();control.faultSignature=join(f.workspace,".amc/studio/console-snapshot.json.sig");const err=await publishConsoleSnapshotAsync(f.workspace,payload()).catch(e=>e);
    expect(err).toMatchObject({code:"CONSOLE_SNAPSHOT_UNAVAILABLE",phase:"signature",bodyWritten:true});expect(String(err)).not.toMatch(/private\/never|PIN=/);expect(String(err.cause)).toContain("PIN=hidden");
    expect(pair(f.workspace).body).not.toBeNull();expect(pair(f.workspace).signature).toBeNull();control.faultSignature="";await publishConsoleSnapshotAsync(f.workspace,payload());verifies(f.workspace);
  });
  test("cache pruning rechecks the actual current age under the common lock",async()=>{
    const f=fixture(),out=await publishConsoleSnapshotAsync(f.workspace,payload());const old=new Date(Date.now()-10*86400000);utimesSync(out.path,old,old);
    control.refreshBeforeLock=out.path;const pruned=pruneOpsCaches({workspace:f.workspace,pruneConsoleSnapshotsDays:1,pruneTransformSnapshotsDays:1});
    expect(pruned.removedConsoleSnapshots).not.toContain(out.path);expect(existsSync(out.path)).toBe(true);verifies(f.workspace);
  });
  test("a callback-created independently valid snapshot pair wins the final CAS without being overwritten",async()=>{
    const f=fixture(),winner={...payload(),ts:987},path=join(f.workspace,".amc/studio/console-snapshot.json"),key=getSigningKey(f.workspace,"artifact-seal");
    const digest=sha256Hex(Buffer.from(JSON.stringify(winner))),body=Buffer.from(JSON.stringify(winner,null,2));
    const signature=Buffer.from(JSON.stringify({digestSha256:digest,signature:sign(null,Buffer.from(digest,"hex"),key).toString("base64"),signedTs:Date.now(),signer:"auditor"},null,2));
    expect(verify(null,Buffer.from(digest,"hex"),getSigningPublicKeyPem(f.workspace,"artifact-seal"),Buffer.from(JSON.parse(signature.toString()).signature,"base64"))).toBe(true);
    let reached=false;
    // The callback also runs at entry and before Sign; the winner appears only at the final post-Sign gate.
    await expect(publishConsoleSnapshotAsync(f.workspace,payload(),()=>{if(control.messages.length===0||reached)return;reached=true;writeFileSync(path,body);writeFileSync(path+".sig",signature);})).rejects.toMatchObject({code:"CONSOLE_SNAPSHOT_UNAVAILABLE",phase:"predecessor",bodyWritten:false});
    expect(reached).toBe(true);expect(control.messages).toHaveLength(1);expect(pair(f.workspace)).toEqual({body,signature});verifies(f.workspace);
    await publishConsoleSnapshotAsync(f.workspace,payload());verifies(f.workspace);
  });
});
