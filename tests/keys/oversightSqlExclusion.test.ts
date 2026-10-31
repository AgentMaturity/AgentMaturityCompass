import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { recordWorkspaceOversightAsync, oversightRecordPath, readOversightRecords, verifyOversightChain, workspaceOversightPublicKeys } from "../../src/incidents/oversightRecord.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { fixture, cleanupFixtures, seedIncident, oversightInput, deferred } from "../helpers/consoleOversightFixture.js";
const control=vi.hoisted(()=>({afterSign:undefined as (()=>Promise<void>)|undefined}));
vi.mock("../../src/keys/providers/file.js",async original=>{const actual=await original<typeof import("../../src/keys/providers/file.js")>();return{...actual,fileKeyProvider:(workspace:string)=>{
  const real=actual.fileKeyProvider(workspace);return{...real,async sign(...args:Parameters<typeof real.sign>){const answer=await real.sign(...args);if(args[0].id==="artifact-seal")await control.afterSign?.();return answer;}};}};});
afterEach(()=>{control.afterSign=undefined;cleanupFixtures();});
test.skipIf(process.platform==="win32")("actual owned SQL holder enters during Sign and final IMMEDIATE publication refuses SQLITE_BUSY without a JSONL append",async()=>{
  const f=fixture(),incident=seedIncident(f.workspace),input=oversightInput(f.workspace,incident),path=oversightRecordPath(f.workspace,incident.incidentId),entered=deferred(),gate=deferred();
  control.afterSign=async()=>{control.afterSign=undefined;entered.resolve();await gate.promise;};const pending=recordWorkspaceOversightAsync(input),outcome=pending.then(()=>null,e=>e);
  let child:ReturnType<typeof spawnOwnedNode>|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined;const release=join(f.root,"release-owned-sql");
  try{
    expect(await Promise.race([entered.promise.then(()=>"signed"),pending.then(()=>"returned",()=>"refused")])).toBe("signed");
    const driver=`import {createRequire} from 'node:module';import {existsSync} from 'node:fs';const require=createRequire(process.cwd()+'/package.json'),Database=require('better-sqlite3');const db=new Database(process.argv[1],{fileMustExist:true,timeout:0});db.exec('BEGIN IMMEDIATE');process.stdout.write('OWNED_SQL_LOCKED\\n');const timer=setInterval(()=>{if(existsSync(process.argv[2])){clearInterval(timer);db.exec('ROLLBACK');db.close();}},10);`;
    child=spawnOwnedNode(["--input-type=module","--eval",driver,join(f.workspace,".amc/evidence.sqlite"),release],{cwd:resolve(".")});let output="";
    const ready=new Promise<void>((done,reject)=>{child!.child.stdout!.on("data",b=>{output+=String(b);if(output.includes("OWNED_SQL_LOCKED\n"))done();});readyTimer=setTimeout(()=>reject(new Error("owned SQL holder did not reach BEGIN IMMEDIATE")),5_000);});
    await Promise.race([ready,child.closed.then(result=>{throw new Error(`owned SQL holder closed before barrier (${result.code})`);})]);clearTimeout(readyTimer);
    gate.resolve();const error=await outcome;expect(error).toMatchObject({code:"SQLITE_BUSY"});expect(existsSync(path)).toBe(false);
    writeFileSync(release,"release");expect((await child.wait(5_000)).code).toBe(0);
  }finally{clearTimeout(readyTimer);gate.resolve();writeFileSync(release,"release");await Promise.allSettled([pending]);if(child)await child.stop();}
  await recordWorkspaceOversightAsync(input);expect(verifyOversightChain(readOversightRecords(path),incident,workspaceOversightPublicKeys(f.workspace))).toEqual({ok:true,errors:[]});
},20_000);
