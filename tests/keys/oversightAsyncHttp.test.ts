import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleIncidentRoute } from "../../src/api/incidentRouter.js";
import { initUsersConfig, createSession, verifyTrackedSessionToken, revokeSessionByToken, setUserRoles, activeUserRecord } from "../../src/auth/authApi.js";
import { readOversightRecords, oversightRecordPath, verifyOversightChain, workspaceOversightPublicKeys } from "../../src/incidents/oversightRecord.js";
import { fixture, cleanupFixtures, seedIncident, deferred } from "../helpers/consoleOversightFixture.js";
const control=vi.hoisted(()=>({afterSign:undefined as (()=>Promise<void>)|undefined,calls:0,bad:false}));
vi.mock("../../src/keys/providers/file.js",async original=>{const actual=await original<typeof import("../../src/keys/providers/file.js")>();return{...actual,fileKeyProvider:(workspace:string)=>{
  const real=actual.fileKeyProvider(workspace);return{...real,async sign(...args:Parameters<typeof real.sign>){const answer=await real.sign(...args);if(args[0].id==="artifact-seal"){control.calls++;await control.afterSign?.();if(control.bad)return Buffer.alloc(64);}return answer;}};}};});
const servers:Server[]=[],dispatches:Promise<unknown>[]=[];
afterEach(async()=>{control.afterSign=undefined;for(const server of servers.splice(0)){server.closeAllConnections();if(server.listening)await new Promise<void>(done=>server.close(()=>done()));}
  await Promise.all(dispatches.splice(0));control.calls=0;control.bad=false;cleanupFixtures();});
async function serve(trusted=true){const f=fixture(),incident=seedIncident(f.workspace),owner=initUsersConfig({workspace:f.workspace,username:"oversight-owner",password:"oversight-owner-password"}).owner,
  session=createSession({workspace:f.workspace,user:owner});let checks=0;
  const server=createServer((req,res)=>{const revalidate=()=>{checks++;const token=verifyTrackedSessionToken({workspace:f.workspace,token:session.token});
    if(!token.ok){res.writeHead(401);res.end(JSON.stringify({error:"current session refused"}));return false;}
    const user=activeUserRecord(f.workspace,owner.userId);if(!user?.roles.some(role=>role==="OWNER"||role==="AUDITOR")){res.writeHead(403);res.end(JSON.stringify({error:"current role refused"}));return false;}return true;};
    const dispatch=handleIncidentRoute(new URL(req.url??"/","http://127.0.0.1").pathname,req.method??"GET",req,res,f.workspace,owner.userId,trusted?revalidate:undefined).then(handled=>{if(!handled){res.writeHead(404);res.end();}});
    dispatches.push(dispatch);void dispatch.catch(err=>res.destroy(err instanceof Error?err:undefined));});servers.push(server);
  await new Promise<void>((done,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.off("error",reject);done();});});const address=server.address();if(!address||typeof address==="string")throw new Error("owned server not bound");control.calls=0;
  const post=(body:unknown={decision:"ACKNOWLEDGED",rationale:"Actual native HTTP review",clockIds:[]})=>fetch(`http://127.0.0.1:${address.port}/api/v1/incidents/${incident.incidentId}/oversight`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  return{...f,incident,owner,session,post,checks:()=>checks,path:oversightRecordPath(f.workspace,incident.incidentId)};
}
describe("actual incident router trusted async oversight contract",()=>{
  test("explicit trusted caller awaits real file crypto and verifies the stored chain",async()=>{const f=await serve(),res=await f.post(),body=await res.json();expect(res.status).toBe(201);expect(body.data.reviewerId).toBe(f.owner.userId);expect(control.calls).toBe(1);expect(f.checks()).toBeGreaterThanOrEqual(2);
    expect(verifyOversightChain(readOversightRecords(f.path),f.incident,workspaceOversightPublicKeys(f.workspace))).toEqual({ok:true,errors:[]});});
  test("no-callback actual router retains synchronous compatibility, with no asynchronous file-provider Sign",async()=>{const f=await serve(false),res=await f.post();expect(res.status).toBe(201);await res.arrayBuffer();expect(control.calls).toBe(0);expect(f.checks()).toBe(0);expect(readOversightRecords(f.path)).toHaveLength(1);});
  test.each(["revoke","roles"] as const)("actual tracked %s change during the signature await refuses without record or second response",async change=>{
    const f=await serve(),entered=deferred(),gate=deferred();control.afterSign=async()=>{control.afterSign=undefined;entered.resolve();await gate.promise;};const pending=f.post();
    try{expect(await Promise.race([entered.promise.then(()=>"signed"),pending.then(()=>"returned",()=>"failed")])).toBe("signed");
      if(change==="revoke")revokeSessionByToken({workspace:f.workspace,token:f.session.token});else{setUserRoles({workspace:f.workspace,username:f.owner.username,roles:["VIEWER"]});expect(activeUserRecord(f.workspace,f.owner.userId)?.roles).toEqual(["VIEWER"]);}
      expect(verifyTrackedSessionToken({workspace:f.workspace,token:f.session.token}).ok).toBe(false);gate.resolve();const res=await pending,text=await res.text();expect(res.status).toBe(401);expect(text).toBe(JSON.stringify({error:"current session refused"}));expect(existsSync(f.path)).toBe(false);
    }finally{gate.resolve();await Promise.allSettled([pending]);}
  });
  test("body reviewer cannot impersonate another principal and bad crypto is bounded with unchanged records",async()=>{const f=await serve();const forbidden=await f.post({reviewerId:"body-spoof",decision:"ACKNOWLEDGED",rationale:"spoof"});expect(forbidden.status).toBe(403);await forbidden.arrayBuffer();expect(control.calls).toBe(0);expect(existsSync(f.path)).toBe(false);
    control.bad=true;const refused=await f.post(),text=await refused.text();expect(refused.status).toBe(409);expect(text).toContain("KEY_PROVIDER_KEY_REFUSED");expect(existsSync(f.path)).toBe(false);
    control.bad=false;const fresh=await f.post();expect(fresh.status).toBe(201);await fresh.arrayBuffer();expect(readFileSync(f.path,"utf8")).toContain(f.owner.userId);});
});
