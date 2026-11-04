import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { initWorkspace } from '/Users/sid/.codex/worktrees/p0-52-qualification/AgentMaturityCompass/dist/workspace.js';
import { ensureFederationPublisherKey } from '/Users/sid/.codex/worktrees/p0-52-qualification/AgentMaturityCompass/dist/federation/federationIdentity.js';
import { verifyFederationPackage } from '/Users/sid/.codex/worktrees/p0-52-qualification/AgentMaturityCompass/dist/federation/federationSync.js';
import { ed25519KeyId } from '/Users/sid/.codex/worktrees/p0-52-qualification/AgentMaturityCompass/dist/trust/index.js';

const root='/Users/sid/.codex/worktrees/p0-52-qualification/AgentMaturityCompass';
const evidence=mkdtempSync('/private/tmp/p0-52-functional-cli-');
const state=join(evidence,'owned-state');mkdirSync(state);
const home=join(state,'home');mkdirSync(home);
process.env.HOME=home;process.env.AMC_HOME=home;process.env.AMC_AGENT_ID='';process.env.AMC_VAULT_PASSPHRASE='p0-52-owned-cli-passphrase';
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const rows=[];
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});if(revision.status!==0)throw new Error('Cannot resolve measured source');
const sourceHead=revision.stdout.trim();
const inputs=['dist/cli.js','dist/federation/federationSync.js','dist/federation/federationStore.js','dist/federation/federationIdentity.js','dist/federation/federationSchema.js','src/federation/federationSync.ts','src/federation/federationStore.ts'].map(path=>({path,sha256:sha(readFileSync(join(root,path)))}));
function snapshot(base){const out=[];function walk(p){const s=lstatSync(p);out.push({path:relative(base,p)||'.',kind:s.isSymbolicLink()?'link':s.isDirectory()?'directory':s.isFile()?'file':'other',inode:s.ino,links:s.nlink,...(s.isFile()?{sha256:sha(readFileSync(p))}:{}),...(s.isSymbolicLink()?{target:readlinkSync(p)}:{})});if(s.isDirectory())for(const n of readdirSync(p).sort())walk(join(p,n));}walk(base);return out;}
function run(name,cwd,args,expectedExit,expectedEffectsChanged=false){const before=snapshot(cwd);const clock=Date.now();const r=spawnSync(process.execPath,[join(root,'dist/cli.js'),...args],{cwd,env:process.env,encoding:'utf8',timeout:30000});const after=snapshot(cwd);const stdout=join(evidence,name+'.stdout');const stderr=join(evidence,name+'.stderr');writeFileSync(stdout,r.stdout??'',{mode:0o600});writeFileSync(stderr,r.stderr??'',{mode:0o600});const effectsChanged=JSON.stringify(before)!==JSON.stringify(after);const row={name,args,cwd,exit:r.status,signal:r.signal,error:r.error?.message??null,expectedExit,matchesExpectedExit:r.status===expectedExit,durationMs:Date.now()-clock,stdout,stdoutSha256:sha(readFileSync(stdout)),stderr,stderrSha256:sha(readFileSync(stderr)),before,after,effectsChanged,expectedEffectsChanged,matchesExpectedEffects:effectsChanged===expectedEffectsChanged};rows.push(row);return r;}
function workspace(name){const p=join(state,name);mkdirSync(p);initWorkspace({workspacePath:p,trustBoundaryMode:'isolated'});run(name+'-federate-init',p,['federate','init','--org','P0-52 owned '+name],0,true);return p;}
const source=workspace('publisher');const dest=workspace('recipient');const unknown=workspace('unknown-recipient');
const publicKeyPem=ensureFederationPublisherKey(source).publicKeyPem;const keyId=ed25519KeyId(publicKeyPem);const keyFile=join(state,'independent-publisher.pub');writeFileSync(keyFile,publicKeyPem,{mode:0o600});
const bundle=join(state,'genuine.amcfed');run('genuine-export',source,['federate','export','--out',bundle],0);
const trust={mode:'pinned',asOf:new Date(),lists:[],distrust:[],allowUnpinned:false,allowUnanchored:false,explicitPins:[{keyId,purposes:['artifact-seal'],origin:'operator captured before export'}]};
const verified=verifyFederationPackage(bundle,trust);if(!verified.ok)throw new Error('Genuine compiled package failed independent pin verification');
const cliVerify=run('compiled-explicit-pin-verify',dest,['federate','verify-bundle',bundle,'--pubkey',keyFile,'--json'],0);
const cliVerified=JSON.parse(cliVerify.stdout);const verifiedContentMatches=cliVerified.report?.trusted===true && cliVerified.report?.overrides?.length===0 && cliVerified.manifest?.manifestId===verified.manifest?.manifestId;
run('unknown-publisher-refusal',unknown,['federate','import',bundle],1);
run('safe-peer-add',dest,['federate','peer','add','--peerId','known-publisher','--name','Known publisher','--pubkey',keyFile],0,true);
run('unsafe-peer-refusal',dest,['federate','peer','add','--peerId','../unsafe-owned','--name','Unsafe owned fixture','--pubkey',keyFile],1);
run('genuine-import',dest,['federate','import',bundle],0,true);
const importedPath=join(dest,'.amc/federation/inbox/known-publisher',verified.manifest.manifestId);
const importedContent={manifestMatches:JSON.stringify(JSON.parse(readFileSync(join(importedPath,'manifest.json'),'utf8')))===JSON.stringify(verified.manifest),members:verified.manifest.files.map(row=>({path:row.path,expectedSha256:row.sha256,actualSha256:sha(readFileSync(join(importedPath,row.path)))}))};
const importedContentMatches=importedContent.manifestMatches && importedContent.members.every(row=>row.expectedSha256===row.actualSha256);
run('same-bucket-replay-refusal',dest,['federate','import',bundle],1);
const inputsUnchanged=inputs.every(({path,sha256})=>sha(readFileSync(join(root,path)))===sha256);
const receipt={sourceHead,inputs,inputsUnchanged,node:process.version,executable:process.execPath,cliSha256:sha(readFileSync(join(root,'dist/cli.js'))),harnessSha256:sha(readFileSync(new URL(import.meta.url))),evidence,publisherKeyId:keyId,publicKeySha256:sha(publicKeyPem),capturedBeforeExport:true,bundleSha256:sha(readFileSync(bundle)),verified,cliVerified,verifiedContentMatches,importedContent,importedContentMatches,commands:rows,limits:'Actual compiled local CLI and filesystem effects with fixture-owned HOME/workspaces. No hosted workflow, model transport, race or cross-store IO transaction guarantee.'};
writeFileSync('/private/tmp/p0-52-functional-cli-final-20261015.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({evidence,sourceHead,commands:rows.length,matchedExits:rows.filter(r=>r.matchesExpectedExit).length,matchedEffects:rows.filter(r=>r.matchesExpectedEffects).length,verifiedContentMatches,importedContentMatches,inputsUnchanged}));
process.exitCode=rows.every(r=>r.matchesExpectedExit && r.matchesExpectedEffects) && verifiedContentMatches && importedContentMatches && inputsUnchanged?0:1;
