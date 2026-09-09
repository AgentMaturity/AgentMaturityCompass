// Authored acceptance fixture. Requires explicit frozen artifact/config release.
// Native stub or an owned scripted text-only endpoint; no actual model inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const sha=x=>createHash("sha256").update(x).digest("hex");
const absolute=value=>{assert.equal(typeof value,"string");assert.ok(isAbsolute(value)&&resolve(value)===value&&!value.includes("\0"));return value;};
const readConfig=path=>{absolute(path);const stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=65536);const value=JSON.parse(readFileSync(path,"utf8"));assert.ok(value&&typeof value==="object"&&!Array.isArray(value));return value;};
const configPath=absolute(process.argv[2]),config=readConfig(configPath);
const installPath=absolute(config.installConfig),qualifyPath=absolute(config.qualifyConfig);
const install=readConfig(installPath),qualification=readConfig(qualifyPath);
assert.match(config.source,/^[0-9a-f]{40}$/);
const guestRoot="/var/tmp/amc-native-validation-"+config.source+"-cancel";
const common=["source","guestRoot","tarball","tarballSha256","cliSha256","nodeSha256","sdkFixtureSha256","nodeVersion","platform","arch","runner","runnerSha256"];
for(const value of [config,install,qualification]){
 assert.equal(value.allowExecution,true);for(const key of common){assert.notEqual(value[key],undefined);assert.deepEqual(value[key],config[key]);}
 assert.equal(value.guestRoot,guestRoot);assert.equal(value.platform,"linux");assert.equal(value.arch,"arm64");
 for(const key of ["tarballSha256","cliSha256","nodeSha256","sdkFixtureSha256","runnerSha256"])assert.match(value[key],/^[0-9a-f]{64}$/);
 for(const key of ["tarball","runner"])absolute(value[key]);
}
assert.equal(install.root,guestRoot);assert.equal(install.qualifyConfig,qualifyPath);
assert.equal(qualification.installConfig,installPath);assert.equal(qualification.consumerConfig,configPath);
assert.equal(config.consumer,join(guestRoot,"consumer"));assert.equal(config.node,join(guestRoot,"bin/node"));
assert.equal(qualification.node,config.node);assert.equal(qualification.runnerHome,join(guestRoot,"runner-home"));
assert.equal(qualification.consumerReceipt,join(guestRoot,"acceptance/receipt.json"));assert.equal(config.out,join(guestRoot,"acceptance"));
for(const path of [configPath,installPath,qualifyPath,config.tarball,config.runner,absolute(install.node),absolute(install.npm),absolute(install.sdkFixture),absolute(install.receipt),absolute(install.closureReceipt),absolute(qualification.receiptDirectory)])assert.ok(path!==guestRoot&&!path.startsWith(guestRoot+"/"));
const rootStat=lstatSync(guestRoot);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink());assert.equal(realpathSync(guestRoot),guestRoot);
assert.equal(rootStat.mode&0o077,0);assert.equal(rootStat.uid,process.getuid());
assert.equal(config.runner,fileURLToPath(import.meta.url));assert.equal(sha(readFileSync(config.runner)),config.runnerSha256);
const configurationSha256={install:sha(readFileSync(installPath)),qualification:sha(readFileSync(qualifyPath)),consumer:sha(readFileSync(configPath))};
const installed=readConfig(join(guestRoot,"install-receipt.json"));
assert.equal(installed.source,config.source);assert.equal(installed.guestRoot,guestRoot);assert.deepEqual(installed.configurationSha256,configurationSha256);
for(const [receiptKey,key]of [["artifactSha256","tarballSha256"],["cliSha256","cliSha256"],["nodeSha256","nodeSha256"],["sdkFixtureSha256","sdkFixtureSha256"],["runnerSha256","runnerSha256"]])assert.equal(installed[receiptKey],config[key]);
assert.equal(realpathSync(config.node),realpathSync(install.node));
assert.equal(sha(readFileSync(config.tarball)),config.tarballSha256);
assert.equal(realpathSync(config.node),realpathSync(process.execPath));
assert.equal(sha(readFileSync(process.execPath)),config.nodeSha256);
assert.equal(sha(readFileSync(join(config.consumer,"sdk-validation-case.mjs"))),config.sdkFixtureSha256);
const cli=realpathSync(join(config.consumer,"node_modules/agent-maturity-compass/dist/cli.js"));
assert.equal(sha(readFileSync(cli)),config.cliSha256);assert.equal(process.version,config.nodeVersion);
assert.equal(process.platform,config.platform);assert.equal(process.arch,"arm64");
const out=absolute(config.out);assert.equal(out,join(guestRoot,"acceptance"));assert.equal(existsSync(out),false);mkdirSync(out,{mode:0o700});
const Database=createRequire(join(config.consumer,"package.json"))("better-sqlite3");
const smoke=new Database(":memory:");const sqlite=smoke.prepare("select sqlite_version() as version").get();smoke.close();
const pass="synthetic-installed-validation-passphrase",key="synthetic-installed-validation-key";
const scrub=x=>JSON.parse(JSON.stringify(x).split(pass).join("[REDACTED]").split(key).join("[REDACTED]"));
const put=(path,value)=>writeFileSync(path,JSON.stringify(scrub(value),null,2)+"\n",{mode:0o600,flag:"wx"});
const delay=ms=>new Promise(done=>setTimeout(done,ms));
function alive(pid){try{process.kill(-pid,0);return true;}catch(e){if(e.code==="ESRCH")return false;throw e;}}
function signal(pid,s){try{process.kill(-pid,s);}catch(e){if(e.code!=="ESRCH")throw e;}}
async function reap(pid){if(!alive(pid))return true;signal(pid,"SIGTERM");for(let i=0;i<30&&alive(pid);i++)await delay(50);if(alive(pid))signal(pid,"SIGKILL");for(let i=0;i<40&&alive(pid);i++)await delay(50);return !alive(pid);}
async function command(argv,{cwd,env,timeoutMs=90000}){
 const at=Date.now();const child=spawn(argv[0],argv.slice(1),{cwd,env,shell:false,detached:true,stdio:["ignore","pipe","pipe"]});
 let stdout="",stderr="",size=0,truncated=false,terminatedBy=null,hard,spawnError=null;
 const stop=cause=>{terminatedBy??=cause;if(child.pid){signal(child.pid,"SIGTERM");hard??=setTimeout(()=>signal(child.pid,"SIGKILL"),2000);}};
 const onSignal=()=>stop("signal");process.once("SIGINT",onSignal);process.once("SIGTERM",onSignal);
 const timer=setTimeout(()=>stop("timeout"),timeoutMs);
 for(const [stream,name]of [[child.stdout,"stdout"],[child.stderr,"stderr"]]){stream.setEncoding("utf8");stream.on("data",data=>{size+=Buffer.byteLength(data);if(size>2*1024*1024){truncated=true;stop("capture");}else if(name==="stdout")stdout+=data;else stderr+=data;});}
 child.once("error",e=>{spawnError=e.message;});
 const [exitCode,childSignal]=await new Promise(done=>child.once("close",(c,s)=>done([c,s])));
 clearTimeout(timer);clearTimeout(hard);process.removeListener("SIGINT",onSignal);process.removeListener("SIGTERM",onSignal);
 const treeExitProven=child.pid?await reap(child.pid):spawnError!==null;
 return {argv,exitCode,signal:childSignal,terminatedBy,treeExitProven,truncated,spawnError,durationMs:Date.now()-at,stdout,stderr};
}
async function textEndpoint(){
 const rows=[],errors=[];const server=createServer(async(req,res)=>{try{
  assert.equal(req.method,"POST");assert.equal(req.url,"/v1/responses");assert.equal(req.headers.authorization,"Bearer "+key);
  let count=0;const chunks=[];for await(const chunk of req){count+=chunk.length;assert.ok(count<=1048576);chunks.push(chunk);}
  const raw=Buffer.concat(chunks),body=JSON.parse(raw);assert.equal(body.model,"scripted-public-validation");assert.equal(body.stream,true);
  for(const tool of body.tools??[])assert.match(tool.name,/^[A-Za-z0-9_-]{1,64}$/);
  assert.ok(!body.input.some(item=>item.type==="function_call_output"),"Operator validation cannot fabricate model tool results");
  const index=rows.length;assert.ok(index<32);const id="response_public_"+index;
  const item={id:"message_public_"+index,type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:"MODEL_TURN_COMPLETE_ONLY",annotations:[]}]};
  const events=[{type:"response.created",response:{id}},{type:"response.output_item.added",output_index:0,item:{...item,status:"in_progress",content:[]}},{type:"response.content_part.added",output_index:0,item_id:item.id,content_index:0,part:{type:"output_text",text:"",annotations:[]}},{type:"response.output_text.delta",output_index:0,item_id:item.id,content_index:0,delta:"MODEL_TURN_COMPLETE_ONLY"},{type:"response.output_text.done",output_index:0,item_id:item.id,content_index:0,text:"MODEL_TURN_COMPLETE_ONLY"},{type:"response.content_part.done",output_index:0,item_id:item.id,content_index:0,part:item.content[0]},{type:"response.output_item.done",output_index:0,item},{type:"response.completed",response:{id,status:"completed",output:[item],usage:{input_tokens:40,output_tokens:12,total_tokens:52}}}];
  const wire=events.map((e,n)=>"event: "+e.type+"\ndata: "+JSON.stringify({...e,sequence_number:n})+"\n\n").join("");
  rows.push({index,requestSha256:sha(raw),body,wireSha256:sha(wire),wire,classification:"scripted-text-only-no-model-tool-call"});
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(wire);
 }catch(error){errors.push(String(error));if(!res.headersSent)res.writeHead(500);res.end("fixture refusal");}});
 server.requestTimeout=15000;await new Promise(done=>server.listen(0,"127.0.0.1",done));
 return {origin:"http://127.0.0.1:"+server.address().port,rows,errors,close:async()=>{server.closeAllConnections();await new Promise(done=>server.close(done));}};
}
assert.equal(config.platform,"linux");
const provider=await textEndpoint();
const modes=["cancel"];
const cases=modes.flatMap(mode=>mode==="cancel"?[{mode,surface:"SDK"}]:["CLI","SDK"].map(surface=>({mode,surface})));
const receipt={issue:"AMC-1538",schemaVersion:1,source:config.source,guestRoot,configurationSha256,runnerSha256:config.runnerSha256,artifactSha256:config.tarballSha256,node:process.version,nodeSha256:sha(readFileSync(process.execPath)),platform:process.platform,arch:process.arch,sqlite,startedAt:new Date().toISOString(),classification:"actual-installed-native-validation-with-stub-or-scripted-no-tool-model",qualityClaim:false,trustBoundary:"Consistency with a locally copied pre-run workspace key, not independent external anchoring",trials:[],ok:false};
try{for(const spec of cases){
 const name=spec.surface.toLowerCase()+"-"+spec.mode,folder=join(out,name),work=join(folder,"workspace"),home=join(folder,"home");
 mkdirSync(folder);mkdirSync(work);mkdirSync(home);mkdirSync(join(work,"workspace/allowed"),{recursive:true});
 const env={PATH:dirname(config.node)+":/usr/bin:/bin",HOME:home,USERPROFILE:home,TMPDIR:join(folder,"tmp"),LANG:"C.UTF-8",NO_COLOR:"1",AMC_VAULT_PASSPHRASE:pass,OPENAI_API_KEY:key,AMC_CONTROL_CHECKPOINT_DIR:join(folder,"checkpoints")};mkdirSync(env.TMPDIR);
 const row={...spec,ok:false,commands:[],checks:[]};receipt.trials.push(row);
 const check=(id,value)=>{row.checks.push({id,passed:Boolean(value)});assert.ok(value,id);};
 const run=async(label,args,expected=0)=>{const r=await command([config.node,cli,...args],{cwd:work,env});put(join(folder,label+".json"),r);row.commands.push({label,exitCode:r.exitCode,treeExitProven:r.treeExitProven});check(label+" intact process",r.exitCode===expected&&r.signal===null&&r.terminatedBy===null&&r.treeExitProven&&!r.truncated);return r;};
 try{
  await run("init",["init","--trust-boundary","isolated"]);await run("budgets-init",["budgets","init","--agent","default"]);
  const selected=spec.mode!=="not-requested",workspaceTools=["denied","pass","fail","cancel"].includes(spec.mode);let policySha=null;
  if(workspaceTools){await run("firewall",["firewall","enable","--mode","block","--json"]);await run("tools-init",["tools","init"]);
   const allowedTools=spec.mode==="denied"?[{name:"fs.read",actionClass:"READ_ONLY",allow:{paths:["./workspace/allowed/**"]},deny:{paths:["**/.amc/**","**/.git/**"]},requireExecTicket:false}]:[{name:"bash",actionClass:"WRITE_HIGH",nativeSandbox:{kind:"linux-bwrap",writableDirectories:["workspace/allowed"]},allow:{binariesAllowlist:[]},deny:{argvRegexDenylist:["(^|\\s)sudo(\\s|$)"]},requireExecTicket:false}];
   const policy=JSON.stringify({tools:{version:1,denyByDefault:true,allowedTools}},null,2)+"\n";writeFileSync(join(work,".amc/tools.yaml"),policy);policySha=sha(policy);await run("tools-sign",["tools","sign","--json"]);await run("tools-verify",["tools","verify"]);
  }
  const monitor=sha(readFileSync(join(work,".amc/keys/monitor_ed25519.pub")));env.AMC_EXPECTED_MONITOR_FINGERPRINT=monitor;row.monitorFingerprint=monitor;row.toolsPolicySha256=policySha;
  const marker=join(work,"workspace/allowed/"+spec.mode+".txt"),late=join(work,"workspace/allowed/late.txt");
  const commands={pass:"printf 'public-pass' > workspace/allowed/pass.txt; printf 'PUBLIC_CHECK_PASSED\\n'",fail:"printf 'public-fail' > workspace/allowed/fail.txt; printf 'PUBLIC_CHECK_EXIT_7\\n'; exit 7",cancel:"printf 'public-started' > workspace/allowed/cancel.txt; sleep 30; printf forbidden > workspace/allowed/late.txt",unavailable:"printf forbidden > workspace/allowed/unavailable.txt",denied:"printf forbidden > workspace/allowed/denied.txt"};
  const cfg={schemaVersion:1,checks:[{id:"selected",title:"Operator public "+spec.mode,command:commands[spec.mode]??"printf not-selected",timeoutMs:spec.mode==="cancel"?45000:5000},{id:"never-selected",title:"Unselected sentinel",command:"printf forbidden > workspace/allowed/unselected.txt",timeoutMs:1000}]};
  const cfgPath=join(folder,"public-checks.json"),cfgBytes=JSON.stringify(cfg,null,2)+"\n";writeFileSync(cfgPath,cfgBytes);const cfgSha=sha(cfgBytes);row.validationConfigSha256=selected?cfgSha:null;
  const base={workspace:work,provider:workspaceTools?"openai-responses":"stub",tools:workspaceTools?"workspace":"none",agentId:"default",timeoutMs:60000,env,...(workspaceTools?{model:"scripted-public-validation",baseUrl:provider.origin,credential:"OPENAI_API_KEY",expectedToolsDigest:policySha}:{ }),...(selected?{validationConfig:cfgPath,validationConfigSha256:cfgSha,validate:["selected"]}:{})};
  let result,summary,sid;const requestStart=provider.rows.length;
  if(spec.surface==="CLI"){
   const args=["agent-loop","run","Return one short acknowledgement. Do not call any tool.","--provider",base.provider,"--tools",base.tools,"--json",...(workspaceTools?["--model",base.model,"--base-url",base.baseUrl,"--credential",base.credential]:[]),...(selected?["--validation-config",cfgPath,"--validation-config-sha256",cfgSha,"--validate","selected"]:[])];
   const execution=await run("native-turn",args,["not-requested","pass"].includes(spec.mode)?0:1);summary=JSON.parse(execution.stdout);sid=summary.sessionId;row.summary=summary;
  }else{
   const input=join(folder,"sdk-input-private.json");writeFileSync(input,JSON.stringify({options:base,...(spec.mode==="cancel"?{cancelMarker:marker}:{})}),{mode:0o600});
   const execution=await command([config.node,join(config.consumer,"sdk-validation-case.mjs"),input],{cwd:work,env});put(join(folder,"sdk-process.json"),execution);
   check("SDK worker intact",execution.exitCode===0&&execution.signal===null&&execution.terminatedBy===null&&execution.treeExitProven&&!execution.truncated);result=JSON.parse(execution.stdout);sid=result.sessionId;row.sdk=result;
   check("SDK cold verification with local pre-run pin",result.cold?.state==="verified"&&result.cold.report?.ok===true&&result.cold.report?.trustRoot?.expectedFingerprint===monitor);
   check("SDK does not imply verification from turn",result.result.verification==="not-verified");check("SDK keeps prompt completion distinct",result.result.state==="completed");check("SDK preserves explicit stop reason",result.result.stopReason===(spec.mode==="cancel"?"cancelled":"end_turn"));
  }
  row.sessionId=sid;const validation=summary?.validation??result.result.validation;row.validation=validation;
  const expected=spec.mode==="not-requested"?"not-requested":spec.mode==="pass"?"passed":spec.mode==="fail"?"failed":"unavailable";
  check("exact validation status",validation.status===expected);check("exact config binding",validation.configSha256===(selected?cfgSha:null));
  if(selected){check("only selected check",validation.checks.length===1&&validation.checks[0].id==="selected");check("exact measured exit",validation.checks[0].exitCode===(spec.mode==="pass"?0:spec.mode==="fail"?7:null)||spec.mode==="cancel");}
  check("unselected command never ran",!existsSync(join(work,"workspace/allowed/unselected.txt")));
  check("write disposition",["pass","fail","cancel"].includes(spec.mode)?existsSync(marker):!existsSync(marker));check("late cancel marker absent",!existsSync(late));
  if(spec.mode==="pass")check("positive exact bytes",readFileSync(marker,"utf8")==="public-pass");if(spec.mode==="fail")check("failing exact bytes",readFileSync(marker,"utf8")==="public-fail");
  check("configuration unchanged",sha(readFileSync(cfgPath))===cfgSha);if(policySha)check("signed tool policy unchanged",sha(readFileSync(join(work,".amc/tools.yaml")))===policySha);
  check("no model-directed calls/retries",workspaceTools?provider.rows.length-requestStart===1:provider.rows.length===requestStart);
  const db=new Database(join(work,".amc/evidence.sqlite"),{readonly:true});let events;try{events=db.prepare("SELECT * FROM evidence_events WHERE session_id=? ORDER BY rowid").all(sid);}finally{db.close();}
  const parsed=events.map(e=>({...e,meta:JSON.parse(e.meta_json)}));put(join(folder,"session-evidence.json"),parsed);
  check("no fabricated model tool calls",events.every(e=>e.event_type!=="tool/call"&&e.event_type!=="tool/result"));
  const ending=parsed.filter(e=>e.event_type==="turn/end").at(-1);check("signed model ending",ending?.writer_sig&&ending.meta.reason===(spec.mode==="cancel"?"cancelled":"complete"));
  const audits=parsed.filter(e=>e.event_type==="audit"&&e.meta.kind==="native-validation");check("no invented absent validation",selected?audits.length>=4:audits.length===0);
  if(selected){const finished=audits.filter(e=>e.meta.phase==="finished");check("one signed validation finish",finished.length===1&&finished[0].writer_sig&&finished[0].meta.status===validation.status);const output=audits.find(e=>e.id===validation.checks[0].outputEventId);check("actual output row referenced",output?.meta.phase==="check-result"&&output.writer_sig);}
  const confinement=parsed.filter(e=>e.event_type==="audit"&&e.meta.auditType==="NATIVE_SHELL_CONFINEMENT");row.confinement=confinement;
  if(spec.mode==="cancel"){
   const receipt=confinement[0]?.meta;
   check("one signed interrupted Bubblewrap receipt",confinement.length===1&&confinement[0].writer_sig&&receipt.backend==="bwrap"&&receipt.cancelled===true&&receipt.treeExitProven===true);
   check("no false completed confinement claim",receipt.confined===false&&receipt.enforcement===null&&receipt.failure?.kind==="runner-failure"&&receipt.exitCode===null);
   check("real command start bytes observed",readFileSync(marker,"utf8")==="public-started"&&result.cancelObserved===true);
   check("cancel returned before sleeping command could finish",JSON.parse(readFileSync(join(folder,"sdk-process.json"),"utf8")).durationMs<30000);
   check("cancel remains unavailable with exact reason",validation.status==="unavailable"&&validation.checks[0].reason==="cancelled"&&validation.checks[0].exitCode===null);
  }else if(["pass","fail"].includes(spec.mode)){check("one real confined shell receipt",confinement.length===1&&confinement[0].writer_sig&&confinement[0].meta.backend==="bwrap"&&confinement[0].meta.confined===true&&confinement[0].meta.treeExitProven===true);check("same signed sandbox grant",confinement[0].meta.enforcement?.sourcePolicySha256===policySha);}
  else check("no confined shell invented",confinement.length===0);
  const native=JSON.parse((await run("cold-native",["agent-loop","verify",sid,"--json"])).stdout),ledger=JSON.parse((await run("cold-ledger",["session","verify","--json"])).stdout);
  row.cold={native,ledger};check("cold native matches local pre-run key pin",native.ok===true&&native.trustRoot?.anchored===true&&native.trustRoot?.expectedFingerprint===monitor);check("cold ledger matches local pre-run key pin",ledger.ok===true&&ledger.trustRoot?.anchored===true&&ledger.trustRoot?.expectedFingerprint===monitor);
  row.ok=true;
 }catch(error){row.error=String(error.stack??error);process.exitCode=1;}
}}
finally{put(join(out,"scripted-provider.json"),{rows:provider.rows,errors:provider.errors});await provider.close();receipt.endpointClosed=true;receipt.ok=receipt.trials.length===cases.length&&receipt.trials.every(x=>x.ok)&&provider.errors.length===0;receipt.finishedAt=new Date().toISOString();put(join(out,"receipt.json"),receipt);}
if(!receipt.ok)process.exitCode=1;
process.stdout.write(JSON.stringify({ok:receipt.ok,receipt:join(out,"receipt.json"),trials:receipt.trials.map(({surface,mode,ok,error})=>({surface,mode,ok,error}))})+"\n");
