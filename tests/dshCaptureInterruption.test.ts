import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const source = (name: string): string => JSON.stringify(pathToFileURL(resolve("src", name)).href);

async function isolatedScenario(body: string): Promise<{ code: number | null; stdout: string; stderr: string; result: Record<string, unknown> | null }> {
  const root = mkdtempSync(join(tmpdir(), "amc-dsh-interruption-"));
  const file = join(root, "scenario.mjs");
  writeFileSync(file, `
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { initWorkspace } from ${source("workspace.ts")};
import { initGatewayConfig, gatewayConfigSchema } from ${source("gateway/config.ts")};
import { openLedger, verifyLedgerIntegrity } from ${source("ledger/ledger.ts")};
const workspace = ${JSON.stringify(root)};
const sha = value => createHash('sha256').update(value).digest('hex');
initWorkspace({workspacePath:workspace,trustBoundaryMode:'isolated'});
${body}
`);
  try {
    return await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, ["--import", pathToFileURL(require.resolve("tsx")).href, file], {
        env: { ...process.env, AMC_VAULT_PASSPHRASE: "dsh-interruption-synthetic-test-passphrase" },
        stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32"
      });
      let stdout = "", stderr = "";
      const terminate = (): void => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* The owned process group already exited. */ }
      };
      const timeout = setTimeout(terminate, 25_000);
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", error => { clearTimeout(timeout); reject(error); });
      child.on("close", code => {
        clearTimeout(timeout);
        terminate();
        const record = stdout.split("\n").find(line => line.startsWith("SCENARIO_RESULT "));
        const result: Record<string, unknown> | null = record ? JSON.parse(record.slice("SCENARIO_RESULT ".length)) : null;
        resolveResult({ code, stdout, stderr, result });
      });
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("DSH capture interruption settlement", () => {
  test.each([['SIGINT', 130], ['SIGTERM', 143]] as const)("retains requested %s when the captured runtime gracefully exits zero", async (signal, expectedExit) => {
    const outcome = await isolatedScenario(`
import { runStudioForeground } from ${source("studio/studioSupervisor.ts")};
import { adaptersConfigureCli } from ${source("adapters/adapterCli.ts")};
import { runAdapterCommand } from ${source("adapters/adapterRunner.ts")};
const entry = join(workspace,'runtime.mjs'), ready = join(workspace,'ready');
writeFileSync(entry, ${JSON.stringify("import {writeFileSync} from 'node:fs'; if(process.argv.includes('--version')){console.log('0.1.3-alpha.2');process.exit(0);}process.on('SIGINT',()=>process.exit(0));process.on('SIGTERM',()=>process.exit(0));writeFileSync(new URL('./ready',import.meta.url),'ready');setInterval(()=>{},1000);")});
const launch = join(workspace,'launch.json');writeFileSync(launch,JSON.stringify({executable:{path:process.execPath,sha256:sha(readFileSync(process.execPath))},entrypoint:{path:entry,sha256:sha(readFileSync(entry))}}));
const studio = await runStudioForeground({workspace,apiPort:0,dashboardPort:0,gatewayPort:0,proxyPort:0,metricsPort:0});
let result;
try {
 adaptersConfigureCli({workspace,agentId:'default',adapterId:'deepseek-harness',route:'/openai',model:'fixture-model',mode:'SUPERVISE',launchConfig:launch});
 const running = runAdapterCommand({workspace,agentId:'default',adapterId:'deepseek-harness',command:['one task']});
 const deadline=Date.now()+10000;while(!existsSync(ready)){assert.ok(Date.now()<deadline,'child reached real ready state');await new Promise(r=>setTimeout(r,10));}
 process.emit(${JSON.stringify(signal)});result = await running;
} finally {await studio.stop();}
const ledger=openLedger(workspace,{readonly:true});const rows=ledger.getAllEvents().filter(e=>e.session_id===result.sessionId);ledger.close();
const exit=rows.find(e=>e.event_type==='agent_process_exited');
console.log('SCENARIO_RESULT '+JSON.stringify({exitCode:result.exitCode,coverage:result.captureCoverage,exitPayload:JSON.parse(exit.payload_inline),exitMeta:JSON.parse(exit.meta_json),integrity:verifyLedgerIntegrity(workspace)}));
`);
    expect(outcome.code, outcome.stderr).toBe(0);
    expect(outcome.result).toMatchObject({
      exitCode: expectedExit,
      coverage: { requestedSignal: signal, childExitCode: 0, childSignal: null },
      exitPayload: { exitCode: expectedExit, requestedSignal: signal, childExitCode: 0, childSignal: null },
      exitMeta: { requestedSignal: signal, childExitCode: 0, childSignal: null },
      integrity: { ok: true, errors: [] }
    });
  }, 30_000);

  test.each(["upstream", "downstream"] as const)("a %s SSE abort closes the partial response and leaves the gateway usable and sealable", async direction => {
    const outcome = await isolatedScenario(`
import { createServer, request } from 'node:http';
import { startGateway } from ${source("gateway/server.ts")};
import { issueLeaseForCli } from ${source("leases/leaseCli.ts")};
let calls=0,upstreamClosed=false;
const upstream=createServer((req,res)=>{req.resume();req.on('end',()=>{calls++;if(calls===1){res.writeHead(200,{'content-type':'text/event-stream'});res.on('close',()=>{upstreamClosed=true;});res.write('data: partial\\n\\n');if(${JSON.stringify(direction)}==='upstream')setTimeout(()=>res.destroy(),40);}else{res.writeHead(200,{'content-type':'application/json'});res.end('{"model":"fixture","usage":{"prompt_tokens":1,"completion_tokens":1}}');}});});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
initGatewayConfig(workspace,gatewayConfigSchema.parse({listen:{host:'127.0.0.1',port:0},redaction:{},upstreams:{fixture:{baseUrl:'http://127.0.0.1:'+upstream.address().port,auth:{type:'none'},allowLocalhost:true}},routes:[{prefix:'/test',upstream:'fixture',stripPrefix:true,openaiCompatible:true}],streamPassthrough:true,proxy:{enabled:false}}));
const gateway=await startGateway({workspace});
const lease=issueLeaseForCli({workspace,agentId:'default',ttl:'5m',scopes:'gateway:llm',routes:'/test',models:'*',rpm:100,tpm:10000,maxCostUsdPerDay:null}).token;
async function ask(){return new Promise((resolve,reject)=>{const req=request('http://'+gateway.host+':'+gateway.port+'/test/chat/completions',{method:'POST',headers:{'content-type':'application/json','x-amc-lease':lease}},res=>{let body='';let aborted=false;res.on('data',chunk=>{body+=chunk;if(calls===1&&${JSON.stringify(direction)}==='downstream')res.destroy();});res.on('aborted',()=>{aborted=true;});res.on('error',()=>{});res.on('close',()=>resolve({status:res.statusCode,body,aborted,complete:res.complete,trailers:res.trailers}));});req.on('error',reject);req.end(JSON.stringify({model:'fixture',messages:[{role:'user',content:'stream'}]}));});}
const first=await ask();const deadline=Date.now()+5000;while(!upstreamClosed){assert.ok(Date.now()<deadline,'cancelled upstream was closed');await new Promise(r=>setTimeout(r,10));}const health=await fetch('http://'+gateway.host+':'+gateway.port+'/__amc/health');const second=await ask();
await gateway.close();await new Promise(r=>upstream.close(r));
const ledger=openLedger(workspace,{readonly:true});const rows=ledger.getAllEvents();ledger.close();
console.log('SCENARIO_RESULT '+JSON.stringify({first,upstreamClosed,health:health.status,second,requestCount:rows.filter(e=>e.event_type==='llm_request').length,responseCount:rows.filter(e=>e.event_type==='llm_response').length,errorCount:rows.filter(e=>e.event_type==='gateway'&&JSON.parse(e.meta_json).stage==='request_error').length,integrity:verifyLedgerIntegrity(workspace)}));
`);
    expect(outcome.code, outcome.stderr).toBe(0);
    expect(outcome.result).toMatchObject({
      first: { status: 200, body: "data: partial\n\n", aborted: true, complete: false, trailers: {} },
      upstreamClosed: true, health: 200,
      second: { status: 200, aborted: false, complete: true },
      requestCount: 2, responseCount: 1, errorCount: 1,
      integrity: { ok: true, errors: [] }
    });
  }, 30_000);
});
