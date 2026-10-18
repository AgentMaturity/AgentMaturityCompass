import pathlib,subprocess,json,hashlib,tempfile,os,time,datetime,shutil
root=pathlib.Path('/Users/sid/.codex/worktrees/p0-46-qualification/AgentMaturityCompass')
node='/opt/homebrew/opt/node@22/bin/node'
evidence=pathlib.Path(tempfile.mkdtemp(prefix='p0-46-local-install-',dir='/private/tmp'))
for name in ['home','prefix','npm-cache','caller','tmp']:(evidence/name).mkdir(mode=0o700)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=['amc-action/action.yml','.github/workflows/amc-pr-gate.yml','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','scripts/freeze-baseline.json','unused-code/plan-edits/manifest.json']
pins={f:sha(root/f) for f in inputs}
parser='''import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require=createRequire("/Users/sid/.codex/worktrees/p0-51-qualification/AgentMaturityCompass/package.json");
const {parse}=require("yaml");
const d=parse(readFileSync(process.argv[1],"utf8"));
const s=d.runs.steps.find(s=>s.name==="Install AMC CLI");
process.stdout.write(JSON.stringify({run:s.run,defaultNode:d.inputs["node-version"].default,pnpmStep:d.runs.steps.find(s=>s.name==="Set up pnpm")}));'''
parsed=json.loads(subprocess.check_output([node,'--input-type=module','-e',parser,str(root/'amc-action/action.yml')],text=True))
assert parsed['run'].count('${{ inputs.amc-version }}')==1
assert str(parsed['defaultNode'])=='20'
assert parsed['pnpmStep']['with']['version']=='10.33.0'
original=evidence/'original-install-block.sh';original.write_text(parsed['run'])
script=evidence/'local-install-block.sh';script.write_text(parsed['run'].replace('${{ inputs.amc-version }}','local'))
env={'PATH':str(evidence/'prefix/bin')+':/opt/homebrew/opt/node@22/bin:'+os.environ['PATH'],'HOME':str(evidence/'home'),
 'AMC_HOME':str(evidence/'home/amc'),'TMPDIR':str(evidence/'tmp'),'LANG':'en_US.UTF-8','CI':'true','NO_COLOR':'1',
 'npm_config_prefix':str(evidence/'prefix'),'npm_config_cache':str(evidence/'npm-cache'),
 'GITHUB_ACTION_PATH':str(root/'amc-action'),'GIT_NO_LAZY_FETCH':'1'}
source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
record={'issue':'P0-46','kind':'Actual exact local action install block in owned checkout/private npm prefix','source':source,
 'runtime':{'node':subprocess.check_output([node,'--version'],text=True).strip(),'selectedActionInput':'22','declaredDefaultNode':'20','defaultNode20Executed':False,'platform':os.uname().sysname,'arch':os.uname().machine},
 'evidenceDirectory':str(evidence),'callerCwd':str(evidence/'caller'),'actionPath':env['GITHUB_ACTION_PATH'],'prefix':env['npm_config_prefix'],
 'inputHashesBefore':pins,'originalBlock':str(original),'originalBlockSha256':sha(original),'executedBlock':str(script),'executedBlockSha256':sha(script),
 'substitution':'Only the one GitHub input placeholder is replaced with literal local; the parsed authored block is otherwise unchanged.',
 'scope':'Only install/build/local global-link block; no initialization, scoring, branch/stash operations, release installer, comments, uploads or hosted workflow execution.',
 'commands':[]}
pointer=pathlib.Path('/private/tmp/p0-46-local-install-pointer-20261015.json')
pointer.write_text(json.dumps(record,indent=2)+'\n')
def run(name,args,cwd):
 log=evidence/(name+'.log');started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
 with log.open('w') as out:p=subprocess.run(args,cwd=cwd,env=env,stdout=out,stderr=subprocess.STDOUT)
 row={'name':name,'argv':args,'cwd':str(cwd),'exit':p.returncode,'durationMs':round((time.monotonic()-clock)*1000),'startedUtc':started,'log':str(log),'logSha256':sha(log),'logBytes':log.stat().st_size}
 record['commands'].append(row);pointer.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(row),flush=True)
 return p.returncode
code=run('exact-local-install',['bash',str(script)],evidence/'caller')
record['inputHashesAfter']={f:sha(root/f) for f in inputs};record['inputsUnchanged']=pins==record['inputHashesAfter']
assert record['inputsUnchanged']
if code==0:
 cli=evidence/'prefix/bin/amc';assert cli.is_file()
 record['installedCli']={'launcher':str(cli),'isLink':cli.is_symlink(),'realPath':str(cli.resolve()),'sha256':sha(cli),'compiledCliSha256':sha(root/'dist/cli.js')}
 assert cli.resolve()==(root/'dist/cli.js').resolve()
 for name,args in [('installed-version',[str(cli),'--version']),('installed-help',[str(cli),'--help'])]:
  if run(name,args,evidence/'caller')!=0:code=1
record['exit']=code
record['sourceAfter']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
record['workingTreeAfter']=subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True)
record['limits']=['Selected Node22 on macOS arm64 only; defaultNode20 and hostedUbuntu remain unqualified.',
 'Private local folder installation may link the built checkout; this is not standalone packed-artifact or release proof.',
 'Frozen install and normal authored build run as written; no release gate or lifecycle policy is disabled.']
pointer.write_text(json.dumps(record,indent=2)+'\n')
pathlib.Path('/private/tmp/p0-46-local-install-witness-20261015.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'pointer':str(pointer),'exit':code,'inputsUnchanged':record['inputsUnchanged']}),flush=True)
raise SystemExit(code)
