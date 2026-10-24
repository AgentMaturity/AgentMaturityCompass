import { verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { initUsersConfig, createSession, revokeSessionByToken, setUserRoles, verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { readTransparencyEntries } from "../../src/transparency/logChain.js";
import { initPluginWorkspace, requestPluginInstall } from "../../src/plugins/pluginApi.js";
import { pluginKeygen, pluginPack } from "../../src/plugins/pluginPackage.js";
import { initPluginRegistry, publishPluginToRegistry } from "../../src/plugins/pluginRegistry.js";
import { savePluginRegistriesConfig, verifyInstalledPluginsLock } from "../../src/plugins/pluginStore.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { fixture, cleanupFixtures, deferred } from "../helpers/consoleOversightFixture.js";
const control=vi.hoisted(()=>({afterSign:undefined as (()=>Promise<void>)|undefined,messages:[] as Buffer[]}));
vi.mock("../../src/keys/providers/file.js",async original=>{const actual=await original<typeof import("../../src/keys/providers/file.js")>();return{...actual,fileKeyProvider:(workspace:string)=>{
  const real=actual.fileKeyProvider(workspace);return{...real,async sign(...args:Parameters<typeof real.sign>){const answer=await real.sign(...args);if(args[0].id==="artifact-seal"){
    control.messages.push(Buffer.from(args[1]));await control.afterSign?.();}return answer;}};}};});
const servers:Array<Awaited<ReturnType<typeof startStudioApiServer>>>=[];
afterEach(async()=>{control.afterSign=undefined;for(const server of servers.splice(0))await server.close();control.messages=[];cleanupFixtures();});
async function studio(){const f=fixture(),owner=initUsersConfig({workspace:f.workspace,username:"snapshot-owner",password:"snapshot-owner-password"}).owner,
  session=createSession({workspace:f.workspace,user:owner}),api=await startStudioApiServer({workspace:f.workspace,host:"127.0.0.1",port:0,token:"snapshot-admin"});servers.push(api);control.messages=[];
  const request=(path:string,body?:unknown)=>fetch(api.url+path,{method:body===undefined?"GET":"POST",headers:{cookie:`amc_session=${encodeURIComponent(session.token)}`,"content-type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20_000)});return{...f,owner,session,api,request};}
async function restoredGet(f:Awaited<ReturnType<typeof studio>>){
  control.afterSign=undefined;const user=setUserRoles({workspace:f.workspace,username:f.owner.username,roles:["OWNER"]}),fresh=createSession({workspace:f.workspace,user});
  const res=await fetch(f.api.url+"/console/snapshot",{headers:{cookie:`amc_session=${encodeURIComponent(fresh.token)}`},signal:AbortSignal.timeout(15_000)});
  expect(res.status).toBe(200);const out=await res.json();expect(out.signaturePath).toBeTruthy();
}
function pause(){const entered=deferred(),gate=deferred();control.afterSign=async()=>{control.afterSign=undefined;entered.resolve();await gate.promise;};return{entered,gate};}
async function entered(p:ReturnType<typeof pause>,pending:Promise<unknown>){expect(await Promise.race([p.entered.promise.then(()=>"signed"),pending.then(()=>"returned",()=>"failed")])).toBe("signed");}
async function plugin(f:ReturnType<typeof fixture>){
  initPluginWorkspace({workspace:f.workspace});const keys=pluginKeygen({outDir:join(f.root,"plugin-keys")}),source=join(f.root,"plugin-source");mkdirSync(join(source,"content/learn/questions"),{recursive:true});
  writeFileSync(join(source,"content/learn/questions/AMC-I.1.md"),"# actual owned plugin\n");writeFileSync(join(source,"manifest.json"),JSON.stringify({v:1,plugin:{id:"amc.plugin.fixture.snapshot",name:"Snapshot fixture",version:"2.0.0",description:"Owned plugin",
    publisher:{org:"Fixture",contact:"ops@example.com",website:"https://example.com",pubkeyFingerprint:"0".repeat(64)},compatibility:{amcMinVersion:">=1.0.0",nodeMinVersion:">=20",schemaVersions:{policyPacks:1,assurancePacks:1,complianceMaps:1,adapters:1,outcomes:1,casebooks:1,transform:1}},risk:{category:"LOW",notes:"fixture",touches:["learn"]}},artifacts:[],generatedTs:Date.now(),signing:{algorithm:"ed25519",pubkeyFingerprint:"0".repeat(64)}}));
  const file=join(f.root,"snapshot.amcplug"),packed=pluginPack({inputDir:source,keyPath:keys.privateKeyPath,outFile:file}),dir=join(f.root,"registry"),registry=initPluginRegistry({dir,registryId:"local",registryName:"Owned registry"});
  publishPluginToRegistry({dir,pluginFile:file,registryKeyPath:join(dir,"registry.key")});savePluginRegistriesConfig(f.workspace,{pluginRegistries:{version:1,registries:[{id:"local",type:"file",base:dir,pinnedRegistryPubkeyFingerprint:registry.fingerprint,
    allowPluginPublishers:[packed.manifest.signing.pubkeyFingerprint],allowRiskCategories:["LOW","MEDIUM","HIGH","CRITICAL"],autoUpdate:false}]}});
  const pending=await requestPluginInstall({workspace:f.workspace,agentId:"default",initiator:"snapshot-owner",registryId:"local",pluginRef:"amc.plugin.fixture.snapshot@2.0.0",action:"install"});
  for(const [id,roles] of [["owner-fixture",["OWNER"]],["auditor-fixture",["AUDITOR"]]] as const)decideApprovalForIntent({workspace:f.workspace,agentId:"default",approvalId:pending.approvalRequestId,decision:"APPROVED",mode:"EXECUTE",reason:"owned dual approval",userId:id,username:id,userRoles:[...roles]});
  return{path:"/plugins/execute",body:{approvalRequestId:pending.approvalRequestId},audit:"PLUGIN_INSTALLED"};
}
async function primary(f:ReturnType<typeof fixture>,family:"plugin"|"policy"){return family==="plugin"?plugin(f):{path:"/policy-packs/code-agent.low/apply",body:{agentId:"default"},audit:"HUMAN_POLICY_PACK_APPLY"};}
function primaryCommitted(workspace:string,family:"plugin"|"policy",audit:string){
  if(family==="plugin")expect(verifyInstalledPluginsLock(workspace).valid).toBe(true);else expect(readTransparencyEntries(workspace).some(row=>row.type==="POLICY_PACK_APPLIED")).toBe(true);
  const ledger=openLedger(workspace);try{expect(ledger.getAllEvents().some(row=>String(row.payload_inline??"").includes(audit))).toBe(true);}finally{ledger.close();}
}
describe("actual Studio console snapshot and completed-primary semantics",()=>{
  test("actual authenticated GET writes the compact-digest signature and returns its real paths",async()=>{
    const f=await studio(),res=await f.request("/console/snapshot"),body=await res.json();expect(res.status).toBe(200);const saved=JSON.parse(readFileSync(body.snapshotPath,"utf8")),sig=JSON.parse(readFileSync(body.signaturePath,"utf8"));
    expect(sig.digestSha256).toBe(sha256Hex(Buffer.from(JSON.stringify(saved))));expect(verify(null,Buffer.from(sig.digestSha256,"hex"),getSigningPublicKeyPem(f.workspace,"artifact-seal"),Buffer.from(sig.signature,"base64"))).toBe(true);
    expect(control.messages).toEqual([Buffer.from(sig.digestSha256,"hex")]);
  });
  test.each(["revoke","roles"] as const)("actual GET refuses current %s loss after real Sign without publication or a second response",async change=>{
    const f=await studio(),p=pause(),pending=f.request("/console/snapshot");try{await entered(p,pending);
      if(change==="revoke")revokeSessionByToken({workspace:f.workspace,token:f.session.token});else setUserRoles({workspace:f.workspace,username:f.owner.username,roles:["VIEWER"]});
      expect(verifyTrackedSessionToken({workspace:f.workspace,token:f.session.token}).ok).toBe(false);p.gate.resolve();const res=await pending,text=await res.text();expect(res.status).toBe(401);expect(text).toContain("authenticated authority changed while signing");expect(text).not.toContain("snapshotPath");expect(existsSync(join(f.workspace,".amc/studio/console-snapshot.json"))).toBe(false);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
    await restoredGet(f);
  });
  test.each(["plugin","policy"] as const)("completed actual %s primary and audit survive a non-auth secondary failure with a bounded warning",async family=>{
    const f=await studio(),action=await primary(f,family);control.afterSign=async()=>{throw new Error("private secondary PIN=not-public");};
    const res=await f.request(action.path,action.body),text=await res.text();expect(res.status).toBe(200);const body=JSON.parse(text);expect(body.warning).toEqual({code:"CONSOLE_SNAPSHOT_UNAVAILABLE"});expect(text).not.toMatch(/PIN=|private secondary/);
    if(family==="plugin")expect(body.action).toBe("install");else expect(body.applied.packId).toBe("code-agent.low");primaryCommitted(f.workspace,family,action.audit);
  });
  test.each(["plugin","policy"] as const)("completed actual %s primary remains recorded but a revoked callback returns only401",async family=>{
    const f=await studio(),action=await primary(f,family),p=pause(),pending=f.request(action.path,action.body);
    try{await entered(p,pending);revokeSessionByToken({workspace:f.workspace,token:f.session.token});p.gate.resolve();const res=await pending,text=await res.text();expect(res.status).toBe(401);expect(text).not.toMatch(/approvalRequestId|transparencyHash|"applied"|"action"/);primaryCommitted(f.workspace,family,action.audit);
    }finally{p.gate.resolve();await Promise.allSettled([pending]);}
    await restoredGet(f);
  });
  test.each(["plugin","policy"] as const)("secondary failure before final callback rechecks authority before exposing completed %s primary",async family=>{
    const f=await studio(),action=await primary(f,family);control.afterSign=async()=>{revokeSessionByToken({workspace:f.workspace,token:f.session.token});throw new Error("private before-callback failure");};
    const res=await f.request(action.path,action.body),text=await res.text();expect(res.status).toBe(401);expect(text).not.toMatch(/approvalRequestId|transparencyHash|"applied"|"action"|private before/);primaryCommitted(f.workspace,family,action.audit);await restoredGet(f);
  });
});
