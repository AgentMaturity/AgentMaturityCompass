#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeStudioScenarios } from "../tests/e2e/native-tasks-page.mjs";
import { NATIVE_STUDIO_SCENARIOS, nativeStudioBrowserReceiptPassed } from "./lib/nativeStudioBrowserReceipt.mjs";

const argv=process.argv.slice(2);
const option=name=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;};
const fixturePath=option("--fixture"), outputPath=option("--out");
if(!fixturePath||!outputPath) throw new Error("Usage: node scripts/studio-native-browser-check.mjs --fixture <private fixture.json> --out <new output directory> [--dependency-root <owned Playwright install>] [--browser-executable <path>]");
const fixture=JSON.parse(readFileSync(resolve(fixturePath),"utf8"));
if(fixture.schemaVersion!=="amc-native-studio-browser-fixture/v1" || !/^[a-f0-9]{40}$/.test(fixture.sourceCommit) || !/^[a-f0-9]{64}$/.test(fixture.artifactSha256)) throw new Error("Fixture requires exact source and artifact provenance");
for(const key of ["ownerBase","demoBase"]){const url=new URL(fixture[key]);if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw new Error("Browser acceptance is restricted to owned loopback servers without URL credentials");fixture[key]=url.href.replace(/\/$/,"");}
if(fixture.agentId==="default"||!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(fixture.agentId))throw new Error("Fixture must use a valid nondefault agent");
const hash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(hash(fixture.artifactPath)!==fixture.artifactSha256)throw new Error("Artifact digest does not match the fixture pin");
if(!statSync(fixture.installedCli).isFile())throw new Error("Installed CLI entry is unavailable");
const secret=path=>{const st=statSync(path);if(!st.isFile()||(process.platform!=="win32"&&(st.mode&0o077)!==0))throw new Error("Fixture credential files must be private regular files");return readFileSync(path,"utf8").trim();};
const credentials={username:secret(fixture.ownerUsernameFile),password:secret(fixture.ownerPasswordFile)};
const scrub=text=>[credentials.password,credentials.username].filter(Boolean).reduce((value,s)=>value.replaceAll(s,"[fixture-credential]"),String(text));
const out=resolve(outputPath);mkdirSync(out,{recursive:false,mode:0o700});
const planned=[...NATIVE_STUDIO_SCENARIOS];
const receipt={schemaVersion:"2026-09-08",startedAt:new Date().toISOString(),sourceCommit:fixture.sourceCommit,artifactSha256:fixture.artifactSha256,artifactPath:resolve(fixture.artifactPath),installedCli:realpathSync(fixture.installedCli),installedCliSha256:hash(fixture.installedCli),node:{version:process.version,platform:process.platform,arch:process.arch},browser:null,planned,checks:[],notes:[],requests:[],sessionIds:[],cleanup:[],ok:false,qualification:"not-started",limits:["Actual browser with installed AMC server; provider is the explicit local deterministic stub.","No real model coding-quality claim. Workspace stub tool arguments are synthetic; denial/cancellation are the exercised tool behaviors.","Browser service workers are blocked for deterministic lost-response interception; offline/service-worker behavior is not qualified.","Cold cryptographic verification must be run separately after orderly Studio shutdown; a live gateway can make whole-workspace verification refuse.","No HAR/trace or credential values are retained."]};
const self=fileURLToPath(import.meta.url), pageModule=fileURLToPath(new URL("../tests/e2e/native-tasks-page.mjs",import.meta.url));
receipt.harness={scriptSha256:hash(self),pageModuleSha256:hash(pageModule)};
if(fixture.knownHomeFailureReceipt){
  const previous=JSON.parse(readFileSync(fixture.knownHomeFailureReceipt,"utf8"));
  if(previous.artifactSha256!==fixture.artifactSha256||!previous.checks.some(c=>c.name==="rendered-layout-keyboard-and-home-handoff"&&c.status==="failed"))throw new Error("Continuation needs the actual same-artifact Home failure receipt");
  receipt.priorFailure={path:fixture.knownHomeFailureReceipt,sha256:hash(fixture.knownHomeFailureReceipt)};
  receipt.checks.push({name:"rendered-layout-keyboard-and-home-handoff",status:"not-exercised",reason:"Known actual same-artifact failure retained in priorFailure; unchanged passed layout was not repeated."});
}
if(fixture.knownResumeFailureReceipt){
  const previous=JSON.parse(readFileSync(fixture.knownResumeFailureReceipt,"utf8"));
  if(previous.artifactSha256!==fixture.artifactSha256||!previous.checks.some(c=>c.name==="release-reload-explicit-resume"&&c.status==="failed"))throw new Error("Continuation needs the actual same-artifact resume failure receipt");
  receipt.priorResumeFailure={path:fixture.knownResumeFailureReceipt,sha256:hash(fixture.knownResumeFailureReceipt)};
  for(const name of ["selected-agent-committed-task-and-follow-up","release-reload-explicit-resume"])receipt.checks.push({name,status:"not-exercised",reason:"Actual prior first/follow-up passed and resume failed; preserved in priorResumeFailure. Continuing independent scenarios without repetition."});
}
const sessions=new Set();let browser;
const note=(kind,message)=>receipt.notes.push({kind,message:scrub(message)});
const step=async(name,run)=>{const started=Date.now();try{const details=await run();receipt.checks.push({name,status:"passed",elapsedMs:Date.now()-started,details});}catch(error){receipt.checks.push({name,status:"failed",elapsedMs:Date.now()-started,error:scrub(error?.message||error)});throw error;}};
try{
  const dependencyRoot=resolve(option("--dependency-root")||join(dirname(self),".."));
  const require=createRequire(join(dependencyRoot,"package.json"));const {chromium,expect:baseExpect}=require("@playwright/test");const expect=baseExpect.configure({timeout:15_000});
  const playwrightPackage=require.resolve("@playwright/test/package.json");receipt.harness.playwright={path:playwrightPackage,version:JSON.parse(readFileSync(playwrightPackage,"utf8")).version};
  browser=await chromium.launch({headless:true,...(option("--browser-executable")?{executablePath:resolve(option("--browser-executable"))}:{})});
  receipt.browser={engine:"chromium",version:browser.version()};
  await runNativeStudioScenarios({browser,expect,fixture,credentials,out,step,note,requests:receipt.requests,sessions});
}catch(error){note("run-stopped",error?.message||error);}
finally{
  if(browser){try{await browser.close();receipt.cleanup.push({resource:"owned browser",ok:true});}catch(error){receipt.cleanup.push({resource:"owned browser",ok:false,error:scrub(error?.message||error)});}}
  for(const name of planned)if(!receipt.checks.some(check=>check.name===name))receipt.checks.push({name,status:"not-exercised",reason:"An earlier prerequisite or scenario stopped the run."});
  receipt.sessionIds=[...sessions].filter(Boolean);receipt.finishedAt=new Date().toISOString();
  receipt.counts={planned:planned.length,passed:receipt.checks.filter(c=>c.status==="passed").length,failed:receipt.checks.filter(c=>c.status==="failed").length,notExercised:receipt.checks.filter(c=>c.status==="not-exercised").length};
  receipt.ok=nativeStudioBrowserReceiptPassed(receipt);
  receipt.qualification=receipt.ok?"browser-slice-passed":"failed-or-incomplete";
  writeFileSync(join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({ok:receipt.ok,qualification:receipt.qualification,counts:receipt.counts,receipt:join(out,"receipt.json")}));
  if(!receipt.ok)process.exitCode=1;
}
